import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderSmsTemplate } from "@/lib/sms-templates.functions";



// BulkSMSBD SMS endpoint
const BULKSMSBD_ENDPOINT = "https://bulksmsbd.net/api/smsapi";

const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

// Format any BD mobile to 8801XXXXXXXXX (no plus, suitable for wa.me and BulkSMSBD)
function normalizeBdMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9]/g, "");
  if (s.startsWith("8801") && s.length === 13) return s;
  if (s.startsWith("01") && s.length === 11) return "88" + s;
  if (s.startsWith("1") && s.length === 10) return "880" + s;
  if (s.startsWith("00880")) return s.slice(2);
  return null;
}

function fmtBdt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  // Round to integer for SMS brevity, matching user's example (521/-, 200/-)
  return String(Math.round(v));
}

async function buildBillMessage(opts: {
  billingMonth: string | null; // YYYY-MM-DD
  currentBill: number;
  discount: number;
  due: number;
  grandTotal: number;
  companyName: string;
  senderRole: string;
}): Promise<string> {
  let monthLabel = "";
  if (opts.billingMonth) {
    const d = new Date(opts.billingMonth);
    if (!isNaN(d.getTime())) {
      monthLabel = `${BN_MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
    }
  }
  const vars = {
    month: monthLabel,
    current_bill: fmtBdt(opts.currentBill),
    due: fmtBdt(opts.due),
    discount: fmtBdt(opts.discount),
    grand_total: fmtBdt(opts.grandTotal),
    sender_role: opts.senderRole,
    company_name: opts.companyName,
  };
  const fallback =
    `আপনার ${monthLabel} মাসের প্রদেয় ${fmtBdt(opts.currentBill)}/-, ` +
    `পূর্বের বকেয়া ${fmtBdt(opts.due)}/-, ` +
    `ডিসকাউন্ট ${fmtBdt(opts.discount)}/-, ` +
    `মোট প্রদেয় ${fmtBdt(opts.grandTotal)}/-\n\n` +
    `${opts.senderRole}\n${opts.companyName}`;
  return renderSmsTemplate("bill_notification", vars, fallback);
}

// Resolve a user's role to a Bangla label for SMS greetings.
async function resolveSenderRoleLabel(userId: string | null | undefined): Promise<string> {
  if (!userId) return "অ্যাডমিন";
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data || []).map((r: any) => r.role);
  if (roles.includes("admin")) return "অ্যাডমিন";
  if (roles.includes("manager")) return "ম্যানেজার";
  return "অ্যাডমিন";
}


async function callBulkSmsBd(opts: {
  apiKey: string;
  senderId: string;
  number: string;
  message: string;
}): Promise<{ ok: boolean; raw: string }> {
  const isUnicode = Array.from(opts.message).some((char) => char.charCodeAt(0) > 127);
  const params = new URLSearchParams({
    api_key: opts.apiKey,
    type: isUnicode ? "unicode" : "text",
    number: opts.number,
    senderid: opts.senderId,
    message: opts.message,
  });
  try {
    const res = await fetch(`${BULKSMSBD_ENDPOINT}?${params.toString()}`, { method: "GET" });
    const text = await res.text();
    let ok = res.ok;
    let friendly = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") {
        ok = j.response_code === 202;
        // Map common BulkSMSBD error codes to readable Bangla messages
        const code = j.response_code;
        const errMap: Record<number, string> = {
          1001: "Invalid Number",
          1002: "Sender ID not correct / disabled",
          1003: "Required fields missing",
          1004: "Balance validity expired",
          1005: "Sender ID not registered/approved on BulkSMSBD. Provide an approved Sender ID (e.g. 8809XXXXXXXXX) in Settings → Sender ID.",
          1006: "Balance insufficient",
          1007: "Number is blocked",
          1011: "User ID not found",
        };
        if (!ok && errMap[code]) friendly = `[${code}] ${errMap[code]}`;
      }
    } catch { /* non-JSON */ }
    return { ok, raw: friendly.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, raw: `Network error: ${e?.message || String(e)}` };
  }
}

// Loads bill + builds {mobile (8801...), waMessage, smsMessage}. Used by both auto and manual flows.
async function loadBillShareData(billId: string, senderUserId: string | null) {
  const { data: bill } = await supabaseAdmin
    .from("bills")
    .select(
      "id, bill_no, billing_month, previous_balance, subtotal, discount_amount, grand_total, status, customer:customers(name, company_name, mobile, alternative_mobile)",
    )
    .eq("id", billId)
    .maybeSingle();
  if (!bill) return { ok: false as const, reason: "Bill not found" };
  if (bill.status !== "FINALIZED") return { ok: false as const, reason: "Bill is not finalized" };

  const cust = bill.customer as any;
  const smsMobile = normalizeBdMobile(cust?.mobile);
  const waMobile =
    normalizeBdMobile(cust?.alternative_mobile) || smsMobile;
  if (!waMobile && !smsMobile)
    return { ok: false as const, reason: "Customer has no valid mobile number" };

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("company_name, sms_api_key, sender_id, auto_messaging_enabled")
    .limit(1)
    .maybeSingle();

  const companyName = settings?.company_name || "One Associate";
  const currentBill = Number(bill.subtotal || 0);
  const discount = Number(bill.discount_amount || 0);
  const prev = Number(bill.previous_balance || 0);
  // previous_balance < 0 means customer owes (due). > 0 means advance.
  const due = prev < 0 ? -prev : 0;
  const grand = Number(bill.grand_total || 0);

  const senderRole = await resolveSenderRoleLabel(senderUserId);
  const message = await buildBillMessage({
    billingMonth: bill.billing_month as any,
    currentBill,
    discount,
    due,
    grandTotal: grand,
    companyName,
    senderRole,
  });

  return {
    ok: true as const,
    mobile: waMobile || smsMobile!, // back-compat: primary share number (prefer WA)
    smsMobile: smsMobile || waMobile!,
    waMobile: waMobile || smsMobile!,
    message,
    settings: settings ?? null,
    companyName,
  };
}

// Best-effort SMS send used internally on finalize. Never throws.
export async function autoSendBillSms(billId: string, sentBy: string | null) {
  try {
    const info = await loadBillShareData(billId, sentBy);
    if (!info.ok) {
      console.warn("[sms] auto-send skipped:", info.reason);
      return;
    }
    if (!info.settings?.auto_messaging_enabled) return;
    if (!info.settings?.sms_api_key || !info.settings?.sender_id) {
      console.warn("[sms] auto-send skipped: SMS API key or sender ID not configured");
      return;
    }
    const result = await callBulkSmsBd({
      apiKey: info.settings.sms_api_key,
      senderId: info.settings.sender_id,
      number: info.smsMobile,
      message: info.message,
    });
    await supabaseAdmin.from("whatsapp_logs").insert({
      bill_id: billId,
      recipient_mobile: info.smsMobile,
      message: info.message,
      status: result.ok ? "SUCCESS" : "FAILED",
      response: result.raw,
      sent_by: sentBy,
    });
  } catch (e) {
    console.error("[sms] auto-send error:", e);
  }
}

// Server fn: returns the data needed to open WhatsApp Web with prefilled chat.
// Optionally also sends the SMS via BulkSMSBD in the same call.
export const getBillShareInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      sendSms: z.boolean().optional().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Permission: admin or bill creator
    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select("created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole && bill.created_by !== context.userId) {
      throw new Error("You are not allowed to share this bill");
    }

    const info = await loadBillShareData(data.id, context.userId);
    if (!info.ok) throw new Error(info.reason);

    let smsStatus: "SENT" | "FAILED" | "SKIPPED" = "SKIPPED";
    let smsError: string | null = null;
    if (data.sendSms) {
      if (!info.settings?.sms_api_key || !info.settings?.sender_id) {
        smsStatus = "FAILED";
        smsError = "SMS API key or Sender ID not configured";
      } else {
        const result = await callBulkSmsBd({
          apiKey: info.settings.sms_api_key,
          senderId: info.settings.sender_id,
          number: info.smsMobile,
          message: info.message,
        });
        smsStatus = result.ok ? "SENT" : "FAILED";
        if (!result.ok) smsError = result.raw;
        await supabaseAdmin.from("whatsapp_logs").insert({
          bill_id: data.id,
          recipient_mobile: info.smsMobile,
          message: info.message,
          status: result.ok ? "SUCCESS" : "FAILED",
          response: result.raw,
          sent_by: context.userId,
        });
      }
    }

    // Mark whatsapp_sent_at when user opens the share dialog (server tracks the act).
    await supabaseAdmin
      .from("bills")
      .update({ whatsapp_sent_at: new Date().toISOString() })
      .eq("id", data.id);

    // Open the installed WhatsApp app directly with no prefilled text.
    // Avoid wa.me/api.whatsapp.com because that browser redirect is blocked.
    const waUrl = `whatsapp://send?phone=${info.waMobile}&text=`;

    return {
      mobile: info.waMobile,
      message: "",
      waUrl,
      smsStatus,
      smsError,
    };
  });

// Send the bill SMS on demand (manual SMS button on bill detail page).
export const sendBillSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select("created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole && bill.created_by !== context.userId) {
      throw new Error("You are not allowed to send SMS for this bill");
    }

    const info = await loadBillShareData(data.id, context.userId);
    if (!info.ok) throw new Error(info.reason);

    if (!info.settings?.sms_api_key || !info.settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }

    const result = await callBulkSmsBd({
      apiKey: info.settings.sms_api_key,
      senderId: info.settings.sender_id,
      number: info.smsMobile,
      message: info.message,
    });

    await supabaseAdmin.from("whatsapp_logs").insert({
      bill_id: data.id,
      recipient_mobile: info.smsMobile,
      message: info.message,
      status: result.ok ? "SUCCESS" : "FAILED",
      response: result.raw,
      sent_by: context.userId,
    });

    if (!result.ok) throw new Error(result.raw || "SMS send failed");
    return { ok: true, mobile: info.smsMobile, message: info.message };
  });


// Public bill data for /r/$token (no auth)
export const getPublicBill = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid token"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: bill, error } = await supabaseAdmin
      .from("bills")
      .select(
        "id, bill_no, bill_date, billing_month, previous_balance, subtotal, discount_amount, grand_total, status, public_token, customer:customers(name, company_name, mobile, address, area:areas(area_name))",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bill) return { found: false as const };
    if (bill.status !== "FINALIZED") return { found: false as const };

    const { data: items } = await supabaseAdmin
      .from("bill_items")
      .select("qty, final_amount, position, service:service_items(item_name)")
      .eq("bill_id", bill.id)
      .order("position");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, address, phone, email, logo_url, bin_number, invoice_footer_text")
      .limit(1)
      .maybeSingle();

    return { found: true as const, bill, items: items ?? [], company };
  });

// Send a test SMS — used in Settings page
export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mobile: z.string().min(6).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Admin only");

    const mobile = normalizeBdMobile(data.mobile);
    if (!mobile) throw new Error("Invalid BD mobile number");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, sms_api_key, sender_id")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key || !settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }

    const companyName = settings.company_name || "One Associate";
    const message = await renderSmsTemplate(
      "test_sms",
      { company_name: companyName },
      `${settings.company_name || "One Associate"} থেকে টেস্ট এসএমএস। এসএমএস ইন্টিগ্রেশন কাজ করছে।`,
    );
    const result = await callBulkSmsBd({
      apiKey: settings.sms_api_key,
      senderId: settings.sender_id,
      number: mobile,
      message,
    });
    if (!result.ok) throw new Error(result.raw || "Send failed");
    return { ok: true, response: result.raw };
  });

// Fetch BulkSMSBD SMS account balance (admin only)
export const getSmsBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Admin only");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sms_api_key")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key) {
      return { ok: false as const, reason: "API key not configured" };
    }
    try {
      const res = await fetch(
        `https://bulksmsbd.net/api/getBalanceApi?api_key=${encodeURIComponent(settings.sms_api_key)}`,
        { method: "GET" },
      );
      const text = await res.text();
      let balance: number | null = null;
      try {
        const j = JSON.parse(text);
        const raw = j?.balance ?? j?.data?.balance ?? j?.Balance;
        if (raw !== undefined && raw !== null) balance = Number(raw);
      } catch {
        const m = text.match(/-?\d+(\.\d+)?/);
        if (m) balance = Number(m[0]);
      }
      if (balance === null || Number.isNaN(balance)) {
        return { ok: false as const, reason: text.slice(0, 120) };
      }
      return { ok: true as const, balance };
    } catch (e: any) {
      return { ok: false as const, reason: e?.message || "Network error" };
    }
  });

// ---------- Collection WhatsApp share ----------

async function loadCollectionShareData(collectionId: string, senderUserId?: string | null) {
  const { data: collection } = await supabaseAdmin
    .from("collections")
    .select(
      "id, receipt_no, collection_date, amount, payment_method, reference_no, status, customer:customers(id, company_name, name, mobile, alternative_mobile)",
    )
    .eq("id", collectionId)
    .maybeSingle();
  if (!collection) return { ok: false as const, reason: "Collection not found" };
  if (collection.status !== "ACTIVE") return { ok: false as const, reason: "Collection is not active" };

  const cust = collection.customer as any;
  const smsMobile = normalizeBdMobile(cust?.mobile);
  const waMobile = normalizeBdMobile(cust?.alternative_mobile) || smsMobile;
  if (!waMobile && !smsMobile)
    return { ok: false as const, reason: "Customer has no valid mobile number" };

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("company_name")
    .limit(1)
    .maybeSingle();

  const companyName = settings?.company_name || "One Associate";

  // Compute balance excluding this collection
  const { data: custRow } = await supabaseAdmin
    .from("customers")
    .select("opening_balance_amount")
    .eq("id", cust.id)
    .maybeSingle();

  const { data: bills } = await supabaseAdmin
    .from("bills")
    .select("subtotal, discount_amount")
    .eq("customer_id", cust.id)
    .eq("status", "FINALIZED");

  const { data: collRows } = await supabaseAdmin
    .from("collections")
    .select("id, amount")
    .eq("customer_id", cust.id)
    .eq("status", "ACTIVE")
    .neq("id", collectionId);

  let balance = Number(custRow?.opening_balance_amount || 0);
  for (const b of bills ?? []) {
    balance += Number(b.discount_amount || 0) - Number(b.subtotal || 0);
  }
  for (const c of collRows ?? []) {
    balance += Number(c.amount || 0);
  }

  const amount = Number(collection.amount || 0);
  const afterSigned = balance + amount;
  const due = afterSigned < 0 ? Math.round(-afterSigned) : 0;
  const advance = afterSigned > 0 ? Math.round(afterSigned) : 0;
  // Total payable BEFORE this collection (due side only)
  const totalPayable = balance < 0 ? Math.round(-balance) : 0;
  const paid = Math.round(amount);

  const PAYMENT_LABELS: Record<string, string> = {
    CASH: "Cash",
    BKASH: "bKash",
    NAGAD: "Cash",
    ROCKET: "Rocket",
    BANK: "Bank",
    CHEQUE: "Cheque",
    OTHER: "Others",
  };

  let message = `আপনার রসিদ #${collection.receipt_no} - ${fmtBdt(collection.amount)}/- গ্রহণ করা হয়েছে`;
  if (collection.payment_method) {
    message += ` (${PAYMENT_LABELS[collection.payment_method] ?? collection.payment_method})`;
  }
  message += `।`;
  if (due > 0) {
    message += ` আপনার বকেয়া ${due}/-`;
  } else if (advance > 0) {
    message += ` আপনার অগ্রিম ${advance}/-`;
  } else {
    message += ` আপনার ব্যালেন্স ০/-`;
  }
  message += `\n\n${companyName}`;

  const senderRole = await resolveSenderRoleLabel(senderUserId);
  // Short SMS format (per user spec)
  let smsMessage = await renderSmsTemplate(
    "collection_receipt",
    { total_payable: totalPayable, paid, due, sender_role: senderRole, company_name: companyName },
    `আপনার প্রদেয় ছিল ${totalPayable}/-, পরিশোধিত ${paid}/-, বকেয়া ${due}/-\n\n${senderRole}\n${companyName}`,
  );

  return {
    ok: true as const,
    mobile: waMobile || smsMobile!,
    smsMobile: smsMobile || waMobile!,
    waMobile: waMobile || smsMobile!,
    message,
    smsMessage,
    companyName,
  };
}

export const getCollectionShareInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Permission: admin or collection creator
    const { data: collection } = await supabaseAdmin
      .from("collections")
      .select("created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!collection) throw new Error("Collection not found");
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole && collection.created_by !== context.userId) {
      throw new Error("You are not allowed to share this receipt");
    }

    const info = await loadCollectionShareData(data.id, context.userId);
    if (!info.ok) throw new Error(info.reason);

    await supabaseAdmin.from("whatsapp_logs").insert({
      collection_id: data.id,
      recipient_mobile: info.waMobile,
      message: info.message,
      status: "SUCCESS",
      sent_by: context.userId,
    });

    const waUrl = `whatsapp://send?phone=${info.waMobile}&text=`;
    return {
      mobile: info.waMobile,
      message: "",
      waUrl,
    };
  });

// Send collection SMS via BulkSMSBD
export const sendCollectionSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: collection } = await supabaseAdmin
      .from("collections")
      .select("created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!collection) throw new Error("Collection not found");
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole && collection.created_by !== context.userId) {
      throw new Error("You are not allowed to send SMS for this receipt");
    }

    const info = await loadCollectionShareData(data.id, context.userId);
    if (!info.ok) throw new Error(info.reason);

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sms_api_key, sender_id")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key || !settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }

    const result = await callBulkSmsBd({
      apiKey: settings.sms_api_key,
      senderId: settings.sender_id,
      number: info.smsMobile,
      message: info.smsMessage,
    });

    await supabaseAdmin.from("whatsapp_logs").insert({
      collection_id: data.id,
      recipient_mobile: info.smsMobile,
      message: info.smsMessage,
      status: result.ok ? "SUCCESS" : "FAILED",
      response: result.raw,
      sent_by: context.userId,
    });

    if (!result.ok) throw new Error(result.raw || "SMS send failed");
    return { ok: true, mobile: info.smsMobile, message: info.smsMessage };
  });

// Send By-Ref billing summary SMS via BulkSMSBD
export const sendByRefBillingSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mobile: z.string().min(6).max(20),
      message: z.string().min(1).max(1000),
      reference_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const mobile = normalizeBdMobile(data.mobile);
    if (!mobile) throw new Error("Invalid BD mobile number");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sms_api_key, sender_id")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key || !settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }

    const result = await callBulkSmsBd({
      apiKey: settings.sms_api_key,
      senderId: settings.sender_id,
      number: mobile,
      message: data.message,
    });

    await supabaseAdmin.from("whatsapp_logs").insert({
      recipient_mobile: mobile,
      message: data.message,
      status: result.ok ? "SUCCESS" : "FAILED",
      response: result.raw,
      sent_by: context.userId,
    });

    if (!result.ok) throw new Error(result.raw || "SMS send failed");
    return { ok: true, mobile, message: data.message };
  });

// ---------- Bulk Due Reminders SMS ----------

function todayDdMmYyyy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function buildDueReminderMessage(opts: {
  customerName: string;
  due: number;
  dateLabel: string;
  senderRole: string;
  companyName: string;
}): Promise<string> {
  const vars = {
    customer_name: opts.customerName,
    date: opts.dateLabel,
    due: fmtBdt(opts.due),
    sender_role: opts.senderRole,
    company_name: opts.companyName,
  };
  const fallback =
    `প্রিয় মেসার্স ${opts.customerName}। ` +
    `${opts.dateLabel} পর্যন্ত আপনার বকেয়া ${fmtBdt(opts.due)}/- পরিশোধ করার জন্য অনুরোধ করা হলো।\n\n` +
    `${opts.senderRole}\n${opts.companyName}`;
  return renderSmsTemplate("due_reminder", vars, fallback);
}

export const sendDueRemindersSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      area_id: z.string().uuid().optional(),
      reference_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Admin-only — bulk SMS is a high-impact action
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Only Admin can perform this action");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, sms_api_key, sender_id")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key || !settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }
    const companyName = settings.company_name || "One Associate";
    const senderRole = await resolveSenderRoleLabel(context.userId);
    const dateLabel = todayDdMmYyyy();

    // Recompute due using same logic as getDueReport
    let custQ = supabaseAdmin
      .from("customers")
      .select("id, name, mobile, is_active")
      .eq("is_active", true);
    if (data.area_id) custQ = custQ.eq("area_id", data.area_id);
    if (data.reference_id) custQ = custQ.eq("reference_id", data.reference_id);
    const { data: customers, error: custErr } = await custQ;
    if (custErr) throw new Error(custErr.message);
    const custList = (customers ?? []) as any[];
    if (custList.length === 0) {
      return { total: 0, sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
    }
    const ids = custList.map((c) => c.id);

    const [{ data: bills }, { data: collections }] = await Promise.all([
      supabaseAdmin
        .from("bills")
        .select("customer_id, grand_total, bill_date, status")
        .in("customer_id", ids)
        .neq("status", "CANCELLED")
        .order("bill_date", { ascending: false }),
      supabaseAdmin
        .from("collections")
        .select("customer_id, amount, collection_date, status")
        .in("customer_id", ids)
        .eq("status", "ACTIVE"),
    ]);

    const lastBillByCust = new Map<string, { grand_total: number; bill_date: string }>();
    for (const b of (bills ?? []) as any[]) {
      if (!lastBillByCust.has(b.customer_id)) {
        lastBillByCust.set(b.customer_id, {
          grand_total: Number(b.grand_total || 0),
          bill_date: b.bill_date,
        });
      }
    }
    const paidAfterLastByCust = new Map<string, number>();
    for (const c of (collections ?? []) as any[]) {
      const last = lastBillByCust.get(c.customer_id);
      if (!last) continue;
      if (c.collection_date >= last.bill_date) {
        paidAfterLastByCust.set(
          c.customer_id,
          (paidAfterLastByCust.get(c.customer_id) ?? 0) + Number(c.amount || 0),
        );
      }
    }

    const dueClients = custList
      .map((c) => {
        const last = lastBillByCust.get(c.id);
        if (!last) return null;
        const paid = paidAfterLastByCust.get(c.id) ?? 0;
        const due = Math.round((last.grand_total - paid) * 100) / 100;
        if (due <= 0) return null;
        return { id: c.id as string, name: c.name as string, mobile: c.mobile as string | null, due };
      })
      .filter((r): r is { id: string; name: string; mobile: string | null; due: number } => r !== null);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const client of dueClients) {
      const mobile = normalizeBdMobile(client.mobile);
      if (!mobile) {
        skipped++;
        errors.push(`${client.name}: Mobile number missing/invalid`);
        continue;
      }
      const message = await buildDueReminderMessage({
        customerName: client.name,
        due: client.due,
        dateLabel,
        senderRole,
        companyName,
      });
      const result = await callBulkSmsBd({
        apiKey: settings.sms_api_key,
        senderId: settings.sender_id,
        number: mobile,
        message,
      });
      await supabaseAdmin.from("whatsapp_logs").insert({
        recipient_mobile: mobile,
        message,
        status: result.ok ? "SUCCESS" : "FAILED",
        response: result.raw,
        sent_by: context.userId,
      });
      if (result.ok) {
        sent++;
      } else {
        failed++;
        errors.push(`${client.name} (${mobile}): ${result.raw}`);
      }
    }

    return { total: dueClients.length, sent, failed, skipped, errors: errors.slice(0, 20) };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderSmsTemplate } from "@/lib/sms-templates.functions";

const BULKSMSBD_ENDPOINT = "https://bulksmsbd.net/api/smsapi";

function normalizeBdMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9]/g, "");
  if (s.startsWith("8801") && s.length === 13) return s;
  if (s.startsWith("01") && s.length === 11) return "88" + s;
  if (s.startsWith("1") && s.length === 10) return "880" + s;
  if (s.startsWith("00880")) return s.slice(2);
  return null;
}

async function hasRole(userId: string, role: "admin" | "manager") {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

async function callBulkSmsBd(opts: { apiKey: string; senderId: string; number: string; message: string }) {
  const isUnicode = Array.from(opts.message).some((c) => c.charCodeAt(0) > 127);
  const params = new URLSearchParams({
    api_key: opts.apiKey,
    type: isUnicode ? "unicode" : "text",
    number: opts.number,
    senderid: opts.senderId,
    message: opts.message,
  });
  try {
    const res = await fetch(`${BULKSMSBD_ENDPOINT}?${params.toString()}`);
    const text = await res.text();
    let ok = res.ok;
    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") ok = j.response_code === 202;
    } catch { /* */ }
    return { ok, raw: text.slice(0, 500) };
  } catch (e: unknown) {
    return { ok: false, raw: e instanceof Error ? e.message : String(e) };
  }
}

function siteOrigin(): string {
  return (
    process.env.SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    "https://oneassociatebd.lovable.app"
  );
}

// Send a Bangla payment-link SMS to the customer of a finalized bill.
export const sendPaymentLinkSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bill_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select(
        "id, bill_no, billing_month, grand_total, status, public_token, created_by, customer:customers(id, name, company_name, mobile)",
      )
      .eq("id", data.bill_id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");
    if (bill.status !== "FINALIZED") throw new Error("Only finalized bills can be sent");

    if (!isAdmin) {
      const isOwner = bill.created_by === context.userId;
      let assigned = false;
      if (!isOwner) {
        const { data: cm } = await supabaseAdmin
          .from("customer_managers")
          .select("id")
          .eq("customer_id", (bill as any).customer.id)
          .eq("manager_id", context.userId)
          .maybeSingle();
        assigned = !!cm;
      }
      if (!isOwner && !assigned) throw new Error("Forbidden");
    }

    const customer: any = (bill as any).customer || {};
    const mobile = normalizeBdMobile(customer.mobile);
    if (!mobile) throw new Error("Customer mobile is not valid");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("sms_api_key, sender_id, company_name")
      .limit(1)
      .maybeSingle();
    if (!settings?.sms_api_key || !settings?.sender_id) {
      throw new Error("SMS API key or Sender ID not configured");
    }

    const url = `${siteOrigin()}/r/${bill.public_token}`;
    const amount = String(Math.round(Number(bill.grand_total || 0)));
    const monthShort = String(bill.billing_month).slice(0, 7);
    const companyName = settings.company_name || "One Associate";
    const fallback =
      `আপনার ${monthShort} মাসের বিল ${amount}/- টাকা।\n` +
      `বিকাশে পরিশোধ করুন: ${url}\n\n` +
      `${companyName}`;
    const message = await renderSmsTemplate(
      "bkash_payment_link",
      { month: monthShort, amount, url, company_name: companyName },
      fallback,
    );

    const res = await callBulkSmsBd({
      apiKey: settings.sms_api_key,
      senderId: settings.sender_id,
      number: mobile,
      message,
    });
    return { ok: res.ok, response: res.raw };
  });

// Admin list of bKash payment attempts (newest first).
export const listBkashPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { data: rows, error } = await supabaseAdmin
      .from("bkash_payments")
      .select(
        "id, bill_id, customer_id, amount, payment_id, trx_id, status, collection_id, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];
    const billIds = Array.from(new Set(list.map((r) => r.bill_id)));
    const custIds = Array.from(new Set(list.map((r) => r.customer_id)));
    const [{ data: bills }, { data: customers }] = await Promise.all([
      supabaseAdmin.from("bills").select("id, bill_no").in("id", billIds),
      supabaseAdmin.from("customers").select("id, name, company_name, mobile").in("id", custIds),
    ]);
    const bMap = new Map((bills ?? []).map((b) => [b.id, b]));
    const cMap = new Map((customers ?? []).map((c) => [c.id, c]));
    return list.map((r) => ({
      ...r,
      bill: bMap.get(r.bill_id) ? { bill_no: bMap.get(r.bill_id)!.bill_no } : null,
      customer: cMap.get(r.customer_id)
        ? {
            name: cMap.get(r.customer_id)!.name,
            company_name: cMap.get(r.customer_id)!.company_name,
            mobile: cMap.get(r.customer_id)!.mobile,
          }
        : null,
    }));
  });

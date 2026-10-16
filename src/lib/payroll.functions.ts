import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BULKSMSBD_ENDPOINT = "https://bulksmsbd.net/api/smsapi";

const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

function bnMonthLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${BN_MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

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

async function assertAdmin(userId: string) {
  if (!(await hasRole(userId, "admin"))) throw new Error("Forbidden: admin only");
}

async function callBulkSmsBd(opts: {
  apiKey: string;
  senderId: string;
  number: string;
  message: string;
}): Promise<{ ok: boolean; raw: string }> {
  const isUnicode = Array.from(opts.message).some((c) => c.charCodeAt(0) > 127);
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
    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") ok = j.response_code === 202;
    } catch { /* not json */ }
    return { ok, raw: text.slice(0, 500) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, raw: `Network error: ${msg}` };
  }
}

// ============ Manager service rates ============

// Resolve the effective rate for a (manager, service_item) pair.
// Picks the manager-specific row with the latest effective_from on/before today.
// Falls back to the default (manager_id IS NULL) row.
async function resolveRate(managerId: string, serviceItemId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: own } = await supabaseAdmin
    .from("manager_service_rates")
    .select("rate, effective_from")
    .eq("manager_id", managerId)
    .eq("service_item_id", serviceItemId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (own) return Number(own.rate || 0);
  const { data: def } = await supabaseAdmin
    .from("manager_service_rates")
    .select("rate, effective_from")
    .is("manager_id", null)
    .eq("service_item_id", serviceItemId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return def ? Number(def.rate || 0) : 0;
}

// Materialize PENDING earnings rows for a finalized bill. Idempotent via UNIQUE(bill_item_id).
// Credit goes to the manager who FINALIZED the matching VAT submission for the
// same customer + tax_period (= bill.billing_month). If no such finalized
// submission exists, no credit is created (will be created later when the
// submission is finalized via the vat finalize hook).
// The earning's billing_month is set to the MONTH the submission was finalized
// (not bill_date / bill.billing_month), so dashboard + payout filters reflect
// when the credit was actually earned.
export async function materializeManagerEarnings(billId: string): Promise<{ created: number }> {
  const { data: bill } = await supabaseAdmin
    .from("bills")
    .select("id, customer_id, billing_month, status")
    .eq("id", billId)
    .maybeSingle();
  if (!bill || bill.status !== "FINALIZED" || !bill.customer_id) return { created: 0 };

  const { data: sub } = await supabaseAdmin
    .from("vat_submissions")
    .select("finalized_by, finalized_at")
    .eq("customer_id", bill.customer_id)
    .eq("tax_period_date", bill.billing_month)
    .eq("status", "FINALIZED")
    .order("finalized_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.finalized_by || !sub?.finalized_at) return { created: 0 };

  const managerId = sub.finalized_by;
  if (!(await hasRole(managerId, "manager"))) return { created: 0 };

  // Use Bangladesh timezone (UTC+6) so a submission finalized in early-morning
  // BD time (which is late-night previous day in UTC) is credited to the
  // correct BD month.
  const bdDate = new Date(new Date(sub.finalized_at).getTime() + 6 * 60 * 60 * 1000);
  const creditMonth = `${bdDate.getUTCFullYear()}-${String(bdDate.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: items } = await supabaseAdmin
    .from("bill_items")
    .select("id, service_item_id, qty")
    .eq("bill_id", billId);
  if (!items || items.length === 0) return { created: 0 };

  let created = 0;
  for (const it of items) {
    const rate = await resolveRate(managerId, it.service_item_id);
    const qty = Number(it.qty || 0);
    const amount = Math.round(qty * rate * 100) / 100;

    // Refresh-friendly: upsert keyed by UNIQUE(bill_item_id) so re-running
    // (e.g. via Backfill, or VAT finalize-after-bill) updates manager_id,
    // billing_month (credit month) and amount on existing PENDING rows.
    const { data: existing } = await supabaseAdmin
      .from("manager_earnings")
      .select("id, status")
      .eq("bill_item_id", it.id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "PAID") continue; // never disturb paid rows
      const { error } = await supabaseAdmin
        .from("manager_earnings")
        .update({
          manager_id: managerId,
          bill_id: billId,
          service_item_id: it.service_item_id,
          billing_month: creditMonth,
          qty,
          rate,
          amount,
          status: "PENDING",
        })
        .eq("id", existing.id);
      if (!error) created++;
    } else {
      const { error } = await supabaseAdmin.from("manager_earnings").insert({
        manager_id: managerId,
        bill_id: billId,
        bill_item_id: it.id,
        service_item_id: it.service_item_id,
        billing_month: creditMonth,
        qty,
        rate,
        amount,
        status: "PENDING",
      });
      if (!error) created++;
    }
  }
  return { created };
}


// ============ Rates CRUD ============

export const listManagerRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("manager_service_rates")
      .select("id, manager_id, service_item_id, rate, effective_from, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertManagerRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        manager_id: z.string().uuid().nullable(),
        service_item_id: z.string().uuid(),
        rate: z.number().min(0),
        effective_from: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("manager_service_rates")
        .update({
          manager_id: data.manager_id,
          service_item_id: data.service_item_id,
          rate: data.rate,
          effective_from: data.effective_from,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("manager_service_rates")
      .insert({
        manager_id: data.manager_id,
        service_item_id: data.service_item_id,
        rate: data.rate,
        effective_from: data.effective_from,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteManagerRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("manager_service_rates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Earnings & payouts ============

export const listPendingEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    let q = supabaseAdmin
      .from("manager_earnings")
      .select("id, manager_id, bill_id, service_item_id, billing_month, qty, rate, amount, status, created_at")
      .eq("status", "PENDING")
      .order("billing_month", { ascending: false });
    if (!isAdmin) q = q.eq("manager_id", context.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    let q = supabaseAdmin
      .from("manager_payouts")
      .select(
        "id, manager_id, period_month, amount, payment_method, account_info, reference_no, paid_at, notes, sms_status, sms_response, sms_sent_at, created_at",
      )
      .order("paid_at", { ascending: false });
    if (!isAdmin) q = q.eq("manager_id", context.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Backfill missing earnings rows for already-finalized bills (admin-triggered).
export const backfillEarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: bills } = await supabaseAdmin
      .from("bills")
      .select("id")
      .eq("status", "FINALIZED");
    let total = 0;
    for (const b of bills ?? []) {
      const r = await materializeManagerEarnings(b.id).catch(() => ({ created: 0 }));
      total += r?.created ?? 0;
    }
    return { created: total };
  });

async function sendPayoutSms(payoutId: string): Promise<{ status: "SENT" | "FAILED"; response: string }> {
  const { data: payout } = await supabaseAdmin
    .from("manager_payouts")
    .select("manager_id, period_month, amount, payment_method")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { status: "FAILED", response: "Payout not found" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("mobile, name")
    .eq("id", payout.manager_id)
    .maybeSingle();
  const mobile = normalizeBdMobile(profile?.mobile);
  if (!mobile) return { status: "FAILED", response: "Manager has no valid mobile number" };

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("sms_api_key, sender_id, company_name")
    .limit(1)
    .maybeSingle();
  if (!settings?.sms_api_key || !settings?.sender_id) {
    return { status: "FAILED", response: "SMS API key or Sender ID not configured" };
  }

  const monthLabel = bnMonthLabel(payout.period_month as unknown as string);
  const methodLabel = payout.payment_method === "BKASH" ? "বিকাশ" : "ব্যাংক";
  const amountStr = String(Math.round(Number(payout.amount || 0)));
  const companyName = settings.company_name || "One Associate";
  const message = `আপনার ${monthLabel} মাসের কাজের বিল ${amountStr}/- যা আপনার ${methodLabel} একাউন্টে ট্রান্সফার করা হয়েছে।\n\nঅ্যাডমিন\n${companyName}`;

  const res = await callBulkSmsBd({
    apiKey: settings.sms_api_key,
    senderId: settings.sender_id,
    number: mobile,
    message,
  });
  const status: "SENT" | "FAILED" = res.ok ? "SENT" : "FAILED";
  await supabaseAdmin
    .from("manager_payouts")
    .update({
      sms_status: status,
      sms_response: res.raw,
      sms_sent_at: new Date().toISOString(),
    })
    .eq("id", payoutId);
  return { status, response: res.raw };
}

export const recordPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        manager_id: z.string().uuid(),
        period_month: z.string().min(1), // YYYY-MM-01
        payment_method: z.enum(["BKASH", "BANK"]),
        account_info: z.string().optional(),
        reference_no: z.string().optional(),
        paid_at: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Find all PENDING earnings for this manager in this month
    const monthStart = data.period_month.slice(0, 7) + "-01";
    const next = new Date(monthStart);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const monthEnd = next.toISOString().slice(0, 10);

    const { data: earnings, error: eErr } = await supabaseAdmin
      .from("manager_earnings")
      .select("id, amount")
      .eq("manager_id", data.manager_id)
      .eq("status", "PENDING")
      .gte("billing_month", monthStart)
      .lt("billing_month", monthEnd);
    if (eErr) throw new Error(eErr.message);
    if (!earnings || earnings.length === 0) {
      throw new Error("No pending earnings for this manager in this month");
    }

    const total = earnings.reduce((s, r) => s + Number(r.amount || 0), 0);
    const amount = Math.round(total * 100) / 100;

    const { data: payout, error: pErr } = await supabaseAdmin
      .from("manager_payouts")
      .insert({
        manager_id: data.manager_id,
        period_month: monthStart,
        amount,
        payment_method: data.payment_method,
        account_info: data.account_info ?? null,
        reference_no: data.reference_no ?? null,
        paid_at: data.paid_at ?? new Date().toISOString().slice(0, 10),
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: uErr } = await supabaseAdmin
      .from("manager_earnings")
      .update({ status: "PAID", payout_id: payout.id })
      .in(
        "id",
        earnings.map((e) => e.id),
      );
    if (uErr) throw new Error(uErr.message);

    const sms = await sendPayoutSms(payout.id).catch((e: unknown) => ({
      status: "FAILED" as const,
      response: e instanceof Error ? e.message : String(e),
    }));

    return { ok: true, payout_id: payout.id, amount, sms_status: sms.status, sms_response: sms.response };
  });

// Per-manager, per-month breakdown of bill / paid / due. Admin only.
export const getManagerPayrollBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) return { rows: [] as Array<{ manager_id: string; manager_name: string; month: string; bill: number; paid: number; due: number }> };

    const [er, pr, profilesRes] = await Promise.all([
      supabaseAdmin.from("manager_earnings").select("manager_id, amount, billing_month, status"),
      supabaseAdmin.from("manager_payouts").select("manager_id, amount, period_month, paid_at"),
      supabaseAdmin.from("profiles").select("id, name, username"),
    ]);
    if (er.error) throw new Error(er.error.message);
    if (pr.error) throw new Error(pr.error.message);

    const nameMap = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Array<{ id: string; name: string | null; username: string | null }>) {
      nameMap.set(p.id, p.name || p.username || "Unknown");
    }

    type Agg = { bill: number; paid: number; due: number };
    const map = new Map<string, Agg>(); // key = manager_id|YYYY-MM

    const monthOf = (s: string | null | undefined) => (s ?? "").slice(0, 7);
    const ensure = (k: string) => {
      let v = map.get(k);
      if (!v) { v = { bill: 0, paid: 0, due: 0 }; map.set(k, v); }
      return v;
    };

    for (const e of (er.data ?? []) as Array<{ manager_id: string; amount: number | null; billing_month: string | null; status: string }>) {
      const m = monthOf(e.billing_month);
      if (!m || !e.manager_id) continue;
      const v = ensure(`${e.manager_id}|${m}`);
      const amt = Number(e.amount || 0);
      v.bill += amt;
      if (e.status === "PENDING") v.due += amt;
    }
    for (const p of (pr.data ?? []) as Array<{ manager_id: string; amount: number | null; period_month: string | null; paid_at: string | null }>) {
      const m = monthOf(p.period_month ?? p.paid_at);
      if (!m || !p.manager_id) continue;
      const v = ensure(`${p.manager_id}|${m}`);
      v.paid += Number(p.amount || 0);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = Array.from(map.entries()).map(([k, v]) => {
      const [manager_id, month] = k.split("|");
      return {
        manager_id,
        manager_name: nameMap.get(manager_id) || "Unknown",
        month,
        bill: round(v.bill),
        paid: round(v.paid),
        due: round(v.due),
      };
    });
    // Sort newest month first, then manager name
    rows.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.manager_name.localeCompare(b.manager_name)));
    return { rows };
  });



export const resendPayoutSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return await sendPayoutSms(data.id);
  });

// Aggregated payroll summary. Admin: across all managers. Manager: own only.
export const getPayrollSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { month?: number; year?: number } | null) => {
    const m = Number(input?.month);
    const y = Number(input?.year);
    return {
      month: Number.isFinite(m) && m >= 1 && m <= 12 ? Math.trunc(m) : 0,
      year: Number.isFinite(y) && y > 1900 ? Math.trunc(y) : 0,
    };
  })
  .handler(async ({ context, data }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    let eq = supabaseAdmin
      .from("manager_earnings")
      .select("amount, status, billing_month");
    let pq = supabaseAdmin.from("manager_payouts").select("amount, period_month, paid_at");
    if (!isAdmin) {
      eq = eq.eq("manager_id", context.userId);
      pq = pq.eq("manager_id", context.userId);
    }
    const [er, pr] = await Promise.all([eq, pq]);
    if (er.error) throw new Error(er.error.message);
    if (pr.error) throw new Error(pr.error.message);
    const earnings = (er.data ?? []) as Array<{
      amount: number | null;
      status: string;
      billing_month: string | null;
    }>;
    const payouts = (pr.data ?? []) as Array<{ amount: number | null; period_month: string | null; paid_at: string | null }>;
    const round = (n: number) => Math.round(n * 100) / 100;
    const monthOf = (r: { billing_month: string | null }) => (r.billing_month ?? "").slice(0, 7);

    const total_bill = round(earnings.reduce((s, r) => s + Number(r.amount || 0), 0));
    const pendingRows = earnings.filter((r) => r.status === "PENDING");
    const pending = round(pendingRows.reduce((s, r) => s + Number(r.amount || 0), 0));

    // Selected month (falls back to current month).
    const now = new Date();
    const selY = data.year > 0 ? data.year : now.getUTCFullYear();
    const selM = data.month > 0 ? data.month : now.getUTCMonth() + 1;
    const curMonth = `${selY}-${String(selM).padStart(2, "0")}`;

    const current_month_pending = round(
      pendingRows.filter((r) => monthOf(r) === curMonth).reduce((s, r) => s + Number(r.amount || 0), 0),
    );
    const current_month_bill = round(
      earnings.filter((r) => monthOf(r) === curMonth).reduce((s, r) => s + Number(r.amount || 0), 0),
    );
    const total_paid = round(payouts.reduce((s, r) => s + Number(r.amount || 0), 0));
    const current_month_paid = round(
      payouts
        .filter((r) => {
          const m = (r.period_month ?? r.paid_at ?? "").slice(0, 7);
          return m === curMonth;
        })
        .reduce((s, r) => s + Number(r.amount || 0), 0),
    );
    return {
      total_bill,
      current_month_bill,
      total_paid,
      current_month_paid,
      pending,
      current_month_pending,
      scope: isAdmin ? ("all" as const) : ("self" as const),
    };

  });


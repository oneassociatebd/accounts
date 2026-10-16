import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { materializeManagerEarnings } from "@/lib/payroll.functions";
import { renderSmsTemplate } from "@/lib/sms-templates.functions";

const BULKSMSBD_ENDPOINT = "https://bulksmsbd.net/api/smsapi";

// ---------- helpers ----------
async function getUserRole(userId: string): Promise<"admin" | "manager" | null> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  return null;
}

async function getManagerCustomerIds(userId: string): Promise<string[]> {
  // SECURITY: Scope strictly to current customer_managers assignments.
  // Access must be lost on unassignment; do NOT include area-based or
  // creator-based customers here.
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("customer_id")
    .eq("manager_id", userId);
  return Array.from(new Set((data ?? []).map((r: any) => r.customer_id)));
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

async function buildVatSmsMessage(taxPeriod: string, submissionId: string, senderRole: string, companyName: string): Promise<string> {
  const fallback =
    `আপনার ${taxPeriod} মাসের ভ্যাট রিটার্ণ অনলাইনে দাখিল করা হয়েছে। সাবমিশন আইডি-${submissionId}।\n\n` +
    `${senderRole}\n${companyName}`;
  return renderSmsTemplate(
    "vat_submission",
    { tax_period: taxPeriod, submission_id: submissionId, sender_role: senderRole, company_name: companyName },
    fallback,
  );
}

// "Jul 2026" -> "2026-07-01"
function periodToDate(period: string): string | null {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m = period.trim().match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mm = months[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[2]}-${mm}-01`;
}

async function callBulkSmsBd(apiKey: string, senderId: string, number: string, message: string) {
  // Use "unicode" type so Bangla characters are transmitted correctly (text = GSM-7 ASCII only)
  const isUnicode = Array.from(message).some((char) => char.charCodeAt(0) > 127);
  const params = new URLSearchParams({ api_key: apiKey, type: isUnicode ? "unicode" : "text", number, senderid: senderId, message });
  try {
    const res = await fetch(`${BULKSMSBD_ENDPOINT}?${params.toString()}`);
    const text = await res.text();
    let ok = res.ok;
    let friendly = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") ok = j.response_code === 202;
    } catch {}
    return { ok, raw: friendly.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, raw: `Network error: ${e?.message || String(e)}` };
  }
}

async function writeAudit(userId: string, action: string, submissionId: string | null, reference: string | null, details?: any) {
  await supabaseAdmin.from("vat_audit_logs").insert({
    user_id: userId,
    action,
    submission_id: submissionId,
    reference,
    details: details ?? null,
  });
}

async function getCustomerMap(customerIds: string[], columns = "id, company_name, name, mobile, alternative_mobile, address, bin_number") {
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {} as Record<string, any>;
  const { data, error } = await supabaseAdmin.from("customers").select(columns).in("id", uniqueIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c: any) => [c.id, c])) as Record<string, any>;
}

async function sendVatSms(submissionId: string, sentBy: string): Promise<{ status: "SENT" | "FAILED"; response: string }> {
  const { data: sub } = await supabaseAdmin
    .from("vat_submissions")
    .select("id, tax_period, submission_id, customer_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return { status: "FAILED", response: "Submission not found" };
  const customerMap = await getCustomerMap([(sub as any).customer_id], "id, mobile, alternative_mobile");
  const cust = customerMap[(sub as any).customer_id];
  const mobile = normalizeBdMobile(cust?.mobile) || normalizeBdMobile(cust?.alternative_mobile);

  const senderRole = await resolveSenderRoleLabel(sentBy);
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("sms_api_key, sender_id, company_name")
    .limit(1).maybeSingle();
  const companyName = settings?.company_name || "One Associate";
  const message = await buildVatSmsMessage(sub.tax_period, sub.submission_id, senderRole, companyName);

  if (!mobile) {
    await supabaseAdmin.from("vat_sms_logs").insert({
      submission_id: submissionId, recipient_mobile: cust?.mobile || "", message,
      status: "FAILED", provider_response: "No valid mobile number", sent_by: sentBy,
    });
    return { status: "FAILED", response: "No valid mobile number" };
  }
  if (!settings?.sms_api_key || !settings?.sender_id) {
    await supabaseAdmin.from("vat_sms_logs").insert({
      submission_id: submissionId, recipient_mobile: mobile, message,
      status: "FAILED", provider_response: "SMS API key or sender ID not configured", sent_by: sentBy,
    });
    return { status: "FAILED", response: "SMS not configured" };
  }
  const result = await callBulkSmsBd(settings.sms_api_key, settings.sender_id, mobile, message);
  const status = result.ok ? "SENT" : "FAILED";
  await supabaseAdmin.from("vat_sms_logs").insert({
    submission_id: submissionId, recipient_mobile: mobile, message,
    status, provider_response: result.raw, sent_by: sentBy,
  });
  return { status, response: result.raw };
}

// =================== Server Functions ===================

// Search clients by BIN / company name / mobile
export const searchVatClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().max(100).default("") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    let q = supabaseAdmin
      .from("customers")
      .select("id, company_name, name, mobile, address, bin_number")
      .eq("is_active", true)
      .limit(20);
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }
    if (data.query) {
      const s = data.query.replace(/[%,]/g, "");
      q = q.or(`company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,bin_number.ilike.%${s}%`);
    }
    const { data: rows, error } = await q.order("company_name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// List submissions (with status filter)
export const listVatSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      status: z.enum(["DRAFT", "FINALIZED", "ALL"]).default("ALL"),
      search: z.string().max(100).optional().default(""),
      month: z.string().regex(/^\d{4}-\d{2}$/).or(z.literal("")).optional().default(""),
      reference_id: z.string().uuid().or(z.literal("")).optional().default(""),
      bill_status: z.enum(["ALL", "WITH", "WITHOUT"]).default("ALL"),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const NIL_UUID = "00000000-0000-0000-0000-000000000000";
    let q = supabaseAdmin
      .from("vat_submissions")
      .select("id, customer_id, tax_period, tax_period_date, submission_id, remarks, status, submission_date, finalized_at, finalized_by, created_by, created_at")
      .order("created_at", { ascending: false });
    if (data.status !== "ALL") q = q.eq("status", data.status);

    // Month filter (tax_period_date is stored as first-of-month)
    if (data.month) q = q.eq("tax_period_date", `${data.month}-01`);

    // Manager scope: include scoped customers OR submissions they created themselves
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      const idsList = ids.length ? ids.join(",") : NIL_UUID;
      q = q.or(`customer_id.in.(${idsList}),created_by.eq.${context.userId}`);
    }

    // Reference filter — pre-resolve customer IDs with that reference
    if (data.reference_id) {
      const { data: refCust } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("reference_id", data.reference_id)
        .limit(5000);
      const refIds = (refCust ?? []).map((c: any) => c.id);
      if (!refIds.length) return [];
      q = q.in("customer_id", refIds);
    }

    // Push search to DB (covers submission_id, tax_period, and customer fields)
    const s = (data.search || "").trim().replace(/[%,()]/g, "");
    if (s) {
      const { data: matchCust } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(`company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,bin_number.ilike.%${s}%`)
        .limit(200);
      const custIds = (matchCust ?? []).map((c: any) => c.id);
      const custList = custIds.length ? custIds.join(",") : NIL_UUID;
      q = q.or(`submission_id.ilike.%${s}%,tax_period.ilike.%${s}%,customer_id.in.(${custList})`);
    }

    const { data: rows, error } = await q.limit(200);
    if (error) throw new Error(error.message);
    const result = rows ?? [];

    // Fetch customers, profiles, and bill-existence checks in parallel
    const userIds = Array.from(new Set(result.flatMap((r: any) => [r.created_by, r.finalized_by].filter(Boolean))));
    const custIdsForBills = Array.from(new Set(result.map((r: any) => r.customer_id).filter(Boolean)));
    const monthDates = Array.from(new Set(result.map((r: any) => r.tax_period_date).filter(Boolean)));

    const [custMap, profsRes, billsRes] = await Promise.all([
      getCustomerMap(
        result.map((r: any) => r.customer_id),
        "id, company_name, name, mobile, bin_number",
      ),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      custIdsForBills.length && monthDates.length
        ? supabaseAdmin
            .from("bills")
            .select("customer_id, billing_month")
            .in("customer_id", custIdsForBills)
            .in("billing_month", monthDates)
            .neq("status", "CANCELLED")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap: Record<string, string> = Object.fromEntries(
      ((profsRes as any).data ?? []).map((p: any) => [p.id, p.name || ""]),
    );
    const billKeys = new Set<string>();
    for (const b of ((billsRes as any).data ?? [])) {
      billKeys.add(`${b.customer_id}|${String(b.billing_month).slice(0, 10)}`);
    }

    const mapped = result.map((r: any) => ({
      ...r,
      customer: custMap[r.customer_id] || null,
      created_by_name: userMap[r.created_by] || "",
      finalized_by_name: userMap[r.finalized_by] || "",
      has_bill: r.tax_period_date
        ? billKeys.has(`${r.customer_id}|${String(r.tax_period_date).slice(0, 10)}`)
        : false,
    }));

    if (data.bill_status === "WITH") return mapped.filter((r: any) => r.has_bill);
    if (data.bill_status === "WITHOUT") return mapped.filter((r: any) => !r.has_bill);
    return mapped;

  });

export const getVatSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: row, error } = await supabaseAdmin
      .from("vat_submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Submission not found");
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(row.customer_id)) throw new Error("Forbidden");
    }
    const customerMap = await getCustomerMap([row.customer_id]);
    // Get SMS logs for this submission
    const { data: smsLogs } = await supabaseAdmin
      .from("vat_sms_logs").select("*").eq("submission_id", data.id).order("sent_at", { ascending: false });
    return { ...row, customer: customerMap[row.customer_id] || null, sms_logs: smsLogs ?? [] };
  });

const submissionInputSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.string().uuid(),
  tax_period: z.string().trim().min(1).max(20),
  submission_id: z.string().trim().min(1).max(50),
  remarks: z.string().max(2000).optional().nullable(),
});

export const saveVatDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submissionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const periodDate = periodToDate(data.tax_period);
    if (!periodDate) throw new Error("Invalid tax period format (use e.g. 'Jul 2026')");

    // Manager scope check
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(data.customer_id)) throw new Error("Forbidden: customer not in your scope");
    }

    if (data.id) {
      // Update existing draft (cannot edit finalized via saveDraft)
      const { data: existing } = await supabaseAdmin
        .from("vat_submissions").select("status, created_by").eq("id", data.id).maybeSingle();
      if (!existing) throw new Error("Submission not found");
      if (role === "manager" && existing.created_by !== context.userId) {
        throw new Error("Forbidden: only the creator can edit this draft");
      }
      const { error } = await supabaseAdmin
        .from("vat_submissions")
        .update({
          customer_id: data.customer_id,
          tax_period: data.tax_period,
          tax_period_date: periodDate,
          submission_id: data.submission_id,
          remarks: data.remarks ?? null,
        })
        .eq("id", data.id);
      if (error) {
        if (error.message.includes("vat_submissions_unique_customer_period"))
          throw new Error("A submission already exists for this client and tax period.");
        throw new Error(error.message);
      }
      await writeAudit(context.userId, "Draft Updated", data.id, data.submission_id);
      return { id: data.id };
    }

    // Insert new draft
    const { data: inserted, error } = await supabaseAdmin
      .from("vat_submissions")
      .insert({
        customer_id: data.customer_id,
        tax_period: data.tax_period,
        tax_period_date: periodDate,
        submission_id: data.submission_id,
        remarks: data.remarks ?? null,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.message.includes("vat_submissions_unique_customer_period"))
        throw new Error("A submission already exists for this client and tax period.");
      throw new Error(error.message);
    }
    await writeAudit(context.userId, "Draft Created", inserted.id, data.submission_id);
    return { id: inserted.id };
  });

export const finalizeVatSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    submissionInputSchema.extend({ id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const periodDate = periodToDate(data.tax_period);
    if (!periodDate) throw new Error("Invalid tax period format (use e.g. 'Jul 2026')");
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(data.customer_id)) throw new Error("Forbidden");
    }

    let subId = data.id;
    const today = new Date().toISOString().slice(0, 10);
    if (subId) {
      const { error } = await supabaseAdmin
        .from("vat_submissions")
        .update({
          customer_id: data.customer_id,
          tax_period: data.tax_period,
          tax_period_date: periodDate,
          submission_id: data.submission_id,
          remarks: data.remarks ?? null,
          status: "FINALIZED",
          submission_date: today,
          finalized_at: new Date().toISOString(),
          finalized_by: context.userId,
        })
        .eq("id", subId);
      if (error) {
        if (error.message.includes("vat_submissions_unique_customer_period"))
          throw new Error("A submission already exists for this client and tax period.");
        throw new Error(error.message);
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("vat_submissions")
        .insert({
          customer_id: data.customer_id,
          tax_period: data.tax_period,
          tax_period_date: periodDate,
          submission_id: data.submission_id,
          remarks: data.remarks ?? null,
          status: "FINALIZED",
          submission_date: today,
          finalized_at: new Date().toISOString(),
          finalized_by: context.userId,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) {
        if (error.message.includes("vat_submissions_unique_customer_period"))
          throw new Error("A submission already exists for this client and tax period.");
        throw new Error(error.message);
      }
      subId = inserted.id;
    }
    await writeAudit(context.userId, "Submission Finalized", subId!, data.submission_id);
    // Materialize manager earnings for any finalized bills matching this
    // customer + tax_period. Idempotent via UNIQUE(bill_item_id).
    try {
      const { data: matchingBills } = await supabaseAdmin
        .from("bills")
        .select("id")
        .eq("customer_id", data.customer_id)
        .eq("billing_month", periodDate)
        .eq("status", "FINALIZED");
      for (const b of matchingBills ?? []) {
        await materializeManagerEarnings(b.id);
      }
    } catch {
      // Don't fail finalize if earnings materialization hiccups
    }
    // Fire SMS
    const sms = await sendVatSms(subId!, context.userId);
    return { id: subId, sms_status: sms.status, sms_response: sms.response };
  });


export const deleteVatSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: row } = await supabaseAdmin
      .from("vat_submissions").select("status, created_by, submission_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Submission not found");
    if (role === "manager") {
      if (row.status !== "DRAFT") throw new Error("Managers cannot delete finalized submissions");
      if (row.created_by !== context.userId) throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin.from("vat_submissions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context.userId, "Draft Deleted", null, row.submission_id);
    return { ok: true };
  });

export const resendVatSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: row } = await supabaseAdmin
      .from("vat_submissions").select("status, customer_id, submission_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Submission not found");
    if (row.status !== "FINALIZED") throw new Error("Only finalized submissions can resend SMS");
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(row.customer_id)) throw new Error("Forbidden");
    }
    const sms = await sendVatSms(data.id, context.userId);
    await writeAudit(context.userId, "SMS Resent", data.id, row.submission_id, { result: sms.status });
    return sms;
  });

export const listVatSmsLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().min(1).max(500).default(200) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: rows, error } = await supabaseAdmin
      .from("vat_sms_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const result = rows ?? [];
    const submissionIds = Array.from(new Set(result.map((r: any) => r.submission_id).filter(Boolean)));
    let submissionMap: Record<string, any> = {};
    if (submissionIds.length > 0) {
      const { data: submissions, error: subError } = await supabaseAdmin
        .from("vat_submissions")
        .select("id, tax_period, submission_id, customer_id, created_by")
        .in("id", submissionIds);
      if (subError) throw new Error(subError.message);
      const customerMap = await getCustomerMap((submissions ?? []).map((s: any) => s.customer_id), "id, company_name, name");
      submissionMap = Object.fromEntries(
        (submissions ?? []).map((s: any) => [s.id, { ...s, customer: customerMap[s.customer_id] || null }]),
      );
    }

    let enriched = result.map((r: any) => ({ ...r, submission: submissionMap[r.submission_id] || null }));
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      enriched = enriched.filter((r: any) =>
        r.submission && (r.submission.created_by === context.userId || ids.includes(r.submission.customer_id))
      );
    }
    return enriched;
  });

export const listVatAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().min(1).max(500).default(200) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    let q = supabaseAdmin
      .from("vat_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (role === "manager") q = q.eq("user_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name").in("id", userIds);
      userMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name || ""]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, user_name: userMap[r.user_id] || "" }));
  });

export const getVatDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tax_period?: string } | undefined) =>
    z.object({ tax_period: z.string().trim().max(20).optional() }).parse(d ?? {})
  )
  .handler(async ({ context, data }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = yesterday.toISOString();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const period = data.tax_period;
    // Compute previous tax_period string (e.g. "May 2026" -> "Apr 2026")
    const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let prevPeriod: string | undefined;
    if (period) {
      const [mm, yy] = period.split(" ");
      const idx = MN.indexOf(mm);
      if (idx >= 0 && yy) {
        const pIdx = idx === 0 ? 11 : idx - 1;
        const pYear = idx === 0 ? Number(yy) - 1 : Number(yy);
        prevPeriod = `${MN[pIdx]} ${pYear}`;
      }
    }

    let customerScope: string[] | null = null;
    if (role === "manager") customerScope = await getManagerCustomerIds(context.userId);

    const periodCount = async (status: "DRAFT" | "FINALIZED", opts: { today?: boolean } = {}) => {
      let q = supabaseAdmin.from("vat_submissions").select("id", { count: "exact", head: true }).eq("status", status);
      if (period) q = q.eq("tax_period", period);
      if (opts.today) q = q.gte("finalized_at", todayStart);
      if (customerScope !== null) {
        if (customerScope.length === 0) return 0;
        q = q.in("customer_id", customerScope);
      }
      const { count } = await q;
      return count ?? 0;
    };

    // Total active clients in scope
    let cq = supabaseAdmin.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true);
    if (customerScope !== null) {
      if (customerScope.length === 0) {
        return {
          totalClients: 0, nonFilers: 0, prevNonFilers: 0,
          todayDrafts: 0, todayFinal: 0, yesterdayFinal: 0,
          monthDrafts: 0, monthFinal: 0, prevMonthDrafts: 0, prevMonthFinal: 0,
          submittedForPeriod: 0, pendingClients: 0, completionRate: 0,
          activity: [], recent: [], topManagers: [],
        };
      }
      cq = cq.in("id", customerScope);
    }
    const { count: totalClientsCount } = await cq;
    const totalClients = totalClientsCount ?? 0;

    const prevPeriodCount = async (status: "DRAFT" | "FINALIZED") => {
      if (!prevPeriod) return 0;
      let q = supabaseAdmin.from("vat_submissions").select("id", { count: "exact", head: true })
        .eq("status", status).eq("tax_period", prevPeriod);
      if (customerScope !== null) {
        if (customerScope.length === 0) return 0;
        q = q.in("customer_id", customerScope);
      }
      const { count } = await q;
      return count ?? 0;
    };

    const [monthDrafts, monthFinal, todayFinal, todayDrafts, yesterdayFinal, prevMonthDrafts, prevMonthFinal] = await Promise.all([
      periodCount("DRAFT"),
      periodCount("FINALIZED"),
      periodCount("FINALIZED", { today: true }),
      (async () => {
        let q = supabaseAdmin.from("vat_submissions").select("id", { count: "exact", head: true })
          .eq("status", "DRAFT").gte("created_at", todayStart);
        if (period) q = q.eq("tax_period", period);
        if (customerScope !== null) q = q.in("customer_id", customerScope);
        const { count } = await q;
        return count ?? 0;
      })(),
      (async () => {
        let q = supabaseAdmin.from("vat_submissions").select("id", { count: "exact", head: true })
          .eq("status", "FINALIZED").gte("finalized_at", yesterdayStart).lt("finalized_at", todayStart);
        if (period) q = q.eq("tax_period", period);
        if (customerScope !== null) q = q.in("customer_id", customerScope);
        const { count } = await q;
        return count ?? 0;
      })(),
      prevPeriodCount("DRAFT"),
      prevPeriodCount("FINALIZED"),
    ]);

    const submittedForPeriod = monthFinal;
    const nonFilers = Math.max(0, totalClients - submittedForPeriod);
    const prevNonFilers = Math.max(0, totalClients - prevMonthFinal);
    const pendingClients = nonFilers;
    const completionRate = totalClients > 0 ? Math.round((submittedForPeriod / totalClients) * 1000) / 10 : 0;

    // Recent FINALIZED submissions (last 5) for the period
    let rq = supabaseAdmin
      .from("vat_submissions")
      .select("id, customer_id, tax_period, submission_id, status, submission_date, finalized_at, finalized_by, created_by")
      .eq("status", "FINALIZED")
      .order("finalized_at", { ascending: false }).limit(5);
    if (period) rq = rq.eq("tax_period", period);
    if (customerScope !== null) rq = rq.in("customer_id", customerScope);
    const { data: recent } = await rq;
    const recentRows = recent ?? [];
    const recentCustomerMap = await getCustomerMap(
      recentRows.map((r: any) => r.customer_id),
      "id, company_name, name, bin_number",
    );

    // Top managers (by FINALIZED submissions in period)
    let tq = supabaseAdmin.from("vat_submissions").select("finalized_by").eq("status", "FINALIZED");
    if (period) tq = tq.eq("tax_period", period);
    if (customerScope !== null) tq = tq.in("customer_id", customerScope);
    const { data: tRows } = await tq;
    const mgrCounts: Record<string, number> = {};
    (tRows ?? []).forEach((r: any) => {
      if (r.finalized_by) mgrCounts[r.finalized_by] = (mgrCounts[r.finalized_by] ?? 0) + 1;
    });
    const topPairs = Object.entries(mgrCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Resolve profile names (top managers + recent finalized_by)
    const profileIds = Array.from(new Set([
      ...topPairs.map(([id]) => id),
      ...recentRows.map((r: any) => r.finalized_by).filter(Boolean),
    ]));
    let profMap: Record<string, string> = {};
    if (profileIds.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name").in("id", profileIds);
      profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name || "Unknown"]));
    }
    const topManagers = topPairs.map(([id, count]) => ({ userId: id, name: profMap[id] || "Unknown", count }));

    // Monthly activity — last 12 months of FINALIZED submissions
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const activityStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    let aq = supabaseAdmin
      .from("vat_submissions")
      .select("finalized_at")
      .eq("status", "FINALIZED")
      .gte("finalized_at", activityStart.toISOString());
    if (customerScope !== null) aq = aq.in("customer_id", customerScope);
    const { data: actRows } = await aq;
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      buckets[`${d.getFullYear()}-${d.getMonth()}`] = 0;
    }
    (actRows ?? []).forEach((r: any) => {
      if (!r.finalized_at) return;
      const d = new Date(r.finalized_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key in buckets) buckets[key] += 1;
    });
    const activity = Object.entries(buckets).map(([k, count]) => {
      const [y, m] = k.split("-").map(Number);
      return { label: `${MONTH_NAMES[m]} ${String(y).slice(2)}`, count };
    });

    return {
      totalClients, nonFilers, prevNonFilers,
      todayDrafts, todayFinal, yesterdayFinal,
      monthDrafts, monthFinal, prevMonthDrafts, prevMonthFinal,
      submittedForPeriod, pendingClients, completionRate,
      activity,
      recent: recentRows.map((r: any) => ({
        ...r,
        customer: recentCustomerMap[r.customer_id] || null,
        finalized_by_name: profMap[r.finalized_by] || "",
      })),
      topManagers,
    };
  });


export const getVatFilingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tax_period?: string } | undefined) =>
    z.object({ tax_period: z.string().trim().max(20).optional() }).parse(d ?? {})
  )
  .handler(async ({ context, data }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");

    let customerScope: string[] | null = null;
    if (role === "manager") customerScope = await getManagerCustomerIds(context.userId);

    // Total clients in scope
    let cq = supabaseAdmin.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true);
    if (customerScope !== null) {
      if (customerScope.length === 0) return { totalClients: 0, totalSubmitted: 0, nonFilers: 0 };
      cq = cq.in("id", customerScope);
    }
    const { count: totalClients } = await cq;

    // Distinct customers with at least one finalized submission (optionally for a specific tax period)
    let sq = supabaseAdmin.from("vat_submissions").select("customer_id").eq("status", "FINALIZED");
    if (data.tax_period) sq = sq.eq("tax_period", data.tax_period);
    if (customerScope !== null) {
      if (customerScope.length === 0) return { totalClients: totalClients ?? 0, totalSubmitted: 0, nonFilers: totalClients ?? 0 };
      sq = sq.in("customer_id", customerScope);
    }
    const { data: subRows } = await sq;
    const submittedSet = new Set((subRows ?? []).map((r: any) => r.customer_id));
    const totalSubmitted = submittedSet.size;

    return {
      totalClients: totalClients ?? 0,
      totalSubmitted,
      nonFilers: Math.max(0, (totalClients ?? 0) - totalSubmitted),
    };
  });

// List non-filer clients (active customers without FINALIZED submission for the given tax_period)
export const listVatNonFilers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tax_period?: string } | undefined) =>
    z.object({ tax_period: z.string().trim().max(20).optional() }).parse(d ?? {})
  )
  .handler(async ({ context, data }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");

    let customerScope: string[] | null = null;
    if (role === "manager") customerScope = await getManagerCustomerIds(context.userId);

    let cq = supabaseAdmin
      .from("customers")
      .select("id, company_name, name, mobile, alternative_mobile, address, bin_number")
      .eq("is_active", true);
    if (customerScope !== null) {
      if (customerScope.length === 0) return [];
      cq = cq.in("id", customerScope);
    }
    const { data: customers, error } = await cq.order("company_name", { ascending: true });
    if (error) throw new Error(error.message);

    let submittedSet = new Set<string>();
    if (data.tax_period) {
      let sq = supabaseAdmin
        .from("vat_submissions")
        .select("customer_id")
        .eq("status", "FINALIZED")
        .eq("tax_period", data.tax_period);
      if (customerScope !== null) sq = sq.in("customer_id", customerScope);
      const { data: subRows } = await sq;
      submittedSet = new Set((subRows ?? []).map((r: any) => r.customer_id));
    }

    return (customers ?? []).filter((c: any) => !submittedSet.has(c.id));
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
  if (roles.includes("manager") && !roles.includes("admin")) return "ম্যানেজার";
  return "অ্যাডমিন";
}

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

function formatBoeDateBangla(d: string): string {
  // input YYYY-MM-DD -> "12 জানুয়ারি 2026"
  const BN_MONTHS = [
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
  ];
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${day} ${BN_MONTHS[m - 1]} ${y}`;
}

async function callBulkSmsBd(apiKey: string, senderId: string, number: string, message: string) {
  const isUnicode = Array.from(message).some((c) => c.charCodeAt(0) > 127);
  const params = new URLSearchParams({
    api_key: apiKey, type: isUnicode ? "unicode" : "text",
    number, senderid: senderId, message,
  });
  try {
    const res = await fetch(`${BULKSMSBD_ENDPOINT}?${params.toString()}`);
    const text = await res.text();
    let ok = res.ok;
    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") ok = j.response_code === 202;
    } catch {}
    return { ok, raw: text.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, raw: `Network error: ${e?.message || String(e)}` };
  }
}

async function getCustomerMap(customerIds: string[], columns = "id, company_name, name, mobile, alternative_mobile, address, bin_number, reference_id") {
  const uniq = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniq.length === 0) return {} as Record<string, any>;
  const { data, error } = await supabaseAdmin.from("customers").select(columns).in("id", uniq);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c: any) => [c.id, c])) as Record<string, any>;
}

async function getReferenceMap(refIds: string[]) {
  const uniq = Array.from(new Set(refIds.filter(Boolean)));
  if (uniq.length === 0) return {} as Record<string, any>;
  const { data } = await supabaseAdmin.from("references").select("id, reference_name, mobile_number, whatsapp_number").in("id", uniq);
  return Object.fromEntries((data ?? []).map((r: any) => [r.id, r])) as Record<string, any>;
}

// Generates next sequential submission ID: M43-{YYYY}-{NNNNNN}
async function generateSubmissionId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `M43-${year}-`;
  const { data } = await supabaseAdmin
    .from("mushak_4_3_submissions")
    .select("submission_id")
    .like("submission_id", `${prefix}%`)
    .order("submission_id", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const tail = (data[0] as any).submission_id.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

async function sendMushakSms(submissionId: string, sentBy: string): Promise<{ status: "SENT" | "FAILED"; response: string }> {
  const { data: sub } = await supabaseAdmin
    .from("mushak_4_3_submissions")
    .select("id, submission_id, customer_id, item_name, boe_date")
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
  const companyName = settings?.company_name || "ওয়ান এসোসিয়েট";

  const fallback =
    `আপনার প্রতিষ্ঠানের বিপরীতে ${formatBoeDateBangla((sub as any).boe_date)} তারিখে আনিত ${(sub as any).item_name} এর মূল্য ঘোষণা দাখিল করা হয়েছে। সাবমিশন আইডি ${(sub as any).submission_id}।\n\n` +
    `${senderRole}\n${companyName}`;
  const message = await renderSmsTemplate(
    "mushak_submission",
    {
      boe_date: formatBoeDateBangla((sub as any).boe_date),
      item_name: (sub as any).item_name,
      submission_id: (sub as any).submission_id,
      sender_role: senderRole,
      company_name: companyName,
    },
    fallback,
  );

  if (!mobile) return { status: "FAILED", response: "No valid mobile number" };
  if (!settings?.sms_api_key || !settings?.sender_id) {
    return { status: "FAILED", response: "SMS not configured" };
  }
  const result = await callBulkSmsBd(settings.sms_api_key, settings.sender_id, mobile, message);
  const status = result.ok ? "SENT" : "FAILED";
  if (status === "SENT") {
    await supabaseAdmin.from("mushak_4_3_submissions").update({ sms_sent: true }).eq("id", submissionId);
  }
  return { status, response: result.raw };
}

// =================== Item Master ===================

export const listMushakItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ only_active: z.boolean().default(false) }).parse(input ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    let q = supabaseAdmin.from("mushak_4_3_items").select("*").order("item_name", { ascending: true });
    if (data.only_active) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createMushakItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ item_name: z.string().trim().min(1).max(100) }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") throw new Error("Forbidden: admin only");
    const { error } = await supabaseAdmin.from("mushak_4_3_items").insert({ item_name: data.item_name });
    if (error) {
      if (error.message.includes("mushak_4_3_items_item_name_key"))
        throw new Error("An item with this name already exists.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateMushakItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      item_name: z.string().trim().min(1).max(100).optional(),
      is_active: z.boolean().optional(),
    }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") throw new Error("Forbidden: admin only");
    const patch: any = {};
    if (data.item_name !== undefined) patch.item_name = data.item_name;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    const { error } = await supabaseAdmin.from("mushak_4_3_items").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMushakItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") throw new Error("Forbidden: admin only");
    const { error } = await supabaseAdmin.from("mushak_4_3_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================== Client search (reused for Mushak) ===================

export const searchMushakClients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().max(100).default("") }).parse(input ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    let q = supabaseAdmin
      .from("customers")
      .select("id, company_name, name, mobile, address, bin_number, reference_id")
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
    const refIds = Array.from(new Set((rows ?? []).map((r: any) => r.reference_id).filter(Boolean) as string[]));
    const refMap = await getReferenceMap(refIds);
    return (rows ?? []).map((r: any) => ({
      ...r,
      reference_name: r.reference_id ? (refMap[r.reference_id]?.reference_name ?? null) : null,
    }));
  });

// =================== Submissions ===================

const submissionInputSchema = z.object({
  id: z.string().uuid().optional(),
  submission_id: z.string().trim().min(1).max(50),
  customer_id: z.string().uuid(),
  reference_id: z.string().uuid().optional().nullable(),
  tax_period: z.string().trim().min(1).max(20),
  submission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  item_name: z.string().trim().min(1).max(100),
  boe_no: z.string().trim().min(1).max(100),
  boe_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remarks: z.string().max(2000).optional().nullable(),
});

export const listMushakSubmissions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      status: z.enum(["DRAFT", "FINALIZED", "ALL"]).default("ALL"),
      search: z.string().max(100).optional().default(""),
      customer_id: z.string().uuid().optional(),
      reference_id: z.string().uuid().optional(),
      tax_period: z.string().max(20).optional(),
      boe_from: z.string().optional(),
      boe_to: z.string().optional(),
      sub_from: z.string().optional(),
      sub_to: z.string().optional(),
    }).parse(input ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const NIL = "00000000-0000-0000-0000-000000000000";

    let q = supabaseAdmin
      .from("mushak_4_3_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.status !== "ALL") q = q.eq("status", data.status);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.reference_id) q = q.eq("reference_id", data.reference_id);
    if (data.tax_period) q = q.eq("tax_period", data.tax_period);
    if (data.boe_from) q = q.gte("boe_date", data.boe_from);
    if (data.boe_to) q = q.lte("boe_date", data.boe_to);
    if (data.sub_from) q = q.gte("submission_date", data.sub_from);
    if (data.sub_to) q = q.lte("submission_date", data.sub_to);

    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      const list = ids.length ? ids.join(",") : NIL;
      q = q.or(`customer_id.in.(${list}),created_by.eq.${context.userId}`);
    }

    const s = (data.search || "").trim().replace(/[%,()]/g, "");
    if (s) {
      const { data: matchCust } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(`company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,bin_number.ilike.%${s}%`)
        .limit(200);
      const custIds = (matchCust ?? []).map((c: any) => c.id);
      const custList = custIds.length ? custIds.join(",") : NIL;
      q = q.or(`submission_id.ilike.%${s}%,boe_no.ilike.%${s}%,item_name.ilike.%${s}%,customer_id.in.(${custList})`);
    }

    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const result = rows ?? [];

    const custMap = await getCustomerMap(result.map((r: any) => r.customer_id), "id, company_name, name, mobile, bin_number, reference_id");
    const refIds = Array.from(new Set(result.map((r: any) => r.reference_id).filter(Boolean) as string[]));
    const refMap = await getReferenceMap(refIds);

    const userIds = Array.from(new Set(result.flatMap((r: any) => [r.created_by, r.finalized_by].filter(Boolean))));
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name").in("id", userIds);
      userMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name || ""]));
    }

    return result.map((r: any) => ({
      ...r,
      customer: custMap[r.customer_id] || null,
      reference: r.reference_id ? refMap[r.reference_id] || null : null,
      created_by_name: userMap[r.created_by] || "",
      finalized_by_name: userMap[r.finalized_by] || "",
    }));
  });

export const getMushakSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: row, error } = await supabaseAdmin
      .from("mushak_4_3_submissions").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Submission not found");
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(row.customer_id) && row.created_by !== context.userId) {
        throw new Error("Forbidden");
      }
    }
    const custMap = await getCustomerMap([row.customer_id]);
    const refMap = row.reference_id ? await getReferenceMap([row.reference_id]) : {};
    return {
      ...row,
      customer: custMap[row.customer_id] || null,
      reference: row.reference_id ? refMap[row.reference_id] || null : null,
    };
  });

export const saveMushakDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submissionInputSchema.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const periodDate = periodToDate(data.tax_period);
    if (!periodDate) throw new Error("Invalid tax period format (use e.g. 'Jul 2026')");

    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(data.customer_id)) throw new Error("Forbidden: customer not in your scope");
    }

    if (data.id) {
      const { data: existing } = await supabaseAdmin
        .from("mushak_4_3_submissions").select("status, created_by").eq("id", data.id).maybeSingle();
      if (!existing) throw new Error("Submission not found");
      if (role === "manager" && existing.created_by !== context.userId) {
        throw new Error("Forbidden: only the creator can edit this draft");
      }
      const { error } = await supabaseAdmin.from("mushak_4_3_submissions")
        .update({
          submission_id: data.submission_id,
          customer_id: data.customer_id,
          reference_id: data.reference_id ?? null,
          tax_period: data.tax_period,
          tax_period_date: periodDate,
          submission_date: data.submission_date,
          item_name: data.item_name,
          boe_no: data.boe_no,
          boe_date: data.boe_date,
          remarks: data.remarks ?? null,
          updated_by: context.userId,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, submission_id: data.submission_id };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("mushak_4_3_submissions")
      .insert({
        submission_id: data.submission_id,
        customer_id: data.customer_id,
        reference_id: data.reference_id ?? null,
        tax_period: data.tax_period,
        tax_period_date: periodDate,
        submission_date: data.submission_date,
        item_name: data.item_name,
        boe_no: data.boe_no,
        boe_date: data.boe_date,
        remarks: data.remarks ?? null,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id, submission_id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, submission_id: inserted.submission_id };
  });

export const finalizeMushakSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submissionInputSchema.parse(input))
  .middleware([requireSupabaseAuth])
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
    if (subId) {
      const { error } = await supabaseAdmin.from("mushak_4_3_submissions").update({
        submission_id: data.submission_id,
        customer_id: data.customer_id,
        reference_id: data.reference_id ?? null,
        tax_period: data.tax_period,
        tax_period_date: periodDate,
        submission_date: data.submission_date,
        item_name: data.item_name,
        boe_no: data.boe_no,
        boe_date: data.boe_date,
        remarks: data.remarks ?? null,
        status: "FINALIZED",
        finalized_at: new Date().toISOString(),
        finalized_by: context.userId,
        updated_by: context.userId,
      }).eq("id", subId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabaseAdmin.from("mushak_4_3_submissions")
        .insert({
          submission_id: data.submission_id,
          customer_id: data.customer_id,
          reference_id: data.reference_id ?? null,
          tax_period: data.tax_period,
          tax_period_date: periodDate,
          submission_date: data.submission_date,
          item_name: data.item_name,
          boe_no: data.boe_no,
          boe_date: data.boe_date,
          remarks: data.remarks ?? null,
          status: "FINALIZED",
          created_by: context.userId,
          finalized_at: new Date().toISOString(),
          finalized_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      subId = inserted.id;
    }
    const sms = await sendMushakSms(subId, context.userId).catch((e) => ({ status: "FAILED" as const, response: String(e?.message || e) }));
    return { id: subId, sms };
  });

export const deleteMushakSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") throw new Error("Forbidden: admin only");
    const { error } = await supabaseAdmin.from("mushak_4_3_submissions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMushakSubmissionSms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: row } = await supabaseAdmin
      .from("mushak_4_3_submissions").select("customer_id, created_by").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Submission not found");
    if (role === "manager") {
      const ids = await getManagerCustomerIds(context.userId);
      if (!ids.includes(row.customer_id) && row.created_by !== context.userId) {
        throw new Error("Forbidden");
      }
    }
    return await sendMushakSms(data.id, context.userId);
  });

// =================== Dashboard ===================

export const getMushakDashboardStats = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getUserRole(context.userId);
    if (!role) throw new Error("Forbidden");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    let scope: string[] | null = null;
    if (role === "manager") scope = await getManagerCustomerIds(context.userId);

    const count = async (build: (q: any) => any) => {
      let q = supabaseAdmin.from("mushak_4_3_submissions").select("id", { count: "exact", head: true });
      if (scope !== null) {
        if (scope.length === 0) return 0;
        q = q.in("customer_id", scope);
      }
      q = build(q);
      const { count } = await q;
      return count ?? 0;
    };

    const [draft, finalized, monthSubs, todaySubs] = await Promise.all([
      count((q) => q.eq("status", "DRAFT")),
      count((q) => q.eq("status", "FINALIZED")),
      count((q) => q.gte("created_at", monthStart)),
      count((q) => q.gte("created_at", todayStart)),
    ]);

    return { draft, finalized, monthSubs, todaySubs };
  });

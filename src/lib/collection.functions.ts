import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const PAYMENT_METHODS = ["CASH", "BKASH", "NAGAD", "ROCKET", "BANK", "CHEQUE", "OTHER"] as const;

async function hasRole(userId: string, role: "admin" | "manager") {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

async function getManagerCustomerIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("customer_id")
    .eq("manager_id", userId);
  return (data ?? []).map((r) => r.customer_id);
}

async function assertCustomerAccess(userId: string, customerId: string) {
  if (await hasRole(userId, "admin")) return;
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("id")
    .eq("customer_id", customerId)
    .eq("manager_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not assigned to this customer");
}

async function getCustomerBalance(customerId: string, excludeCollectionId?: string) {
  const { data: cust } = await supabaseAdmin
    .from("customers")
    .select("opening_balance_amount")
    .eq("id", customerId)
    .maybeSingle();
  if (!cust) throw new Error("Customer not found");

  const { data: bills } = await supabaseAdmin
    .from("bills")
    .select("subtotal, discount_amount")
    .eq("customer_id", customerId)
    .eq("status", "FINALIZED");

  let collQ = supabaseAdmin
    .from("collections")
    .select("id, amount")
    .eq("customer_id", customerId)
    .eq("status", "ACTIVE");
  if (excludeCollectionId) collQ = collQ.neq("id", excludeCollectionId);
  const { data: collections } = await collQ;

  let balance = Number(cust.opening_balance_amount || 0);
  for (const b of bills ?? []) {
    balance += Number(b.discount_amount || 0) - Number(b.subtotal || 0);
  }
  for (const c of collections ?? []) {
    balance += Number(c.amount || 0);
  }
  return r2(balance);
}

async function generateReceiptNo(): Promise<string> {
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("id, memo_prefix, starting_memo_number, last_memo_number, last_memo_year")
    .limit(1)
    .maybeSingle();
  if (!settings) throw new Error("Company settings not configured");

  const prefix = settings.memo_prefix || "RCV-";
  const startFrom = Number(settings.starting_memo_number || 1);
  const year = new Date().getFullYear();
  const sameYear = settings.last_memo_year === year;
  const base = sameYear
    ? Number(settings.last_memo_number || 0)
    : Math.max(0, startFrom - 1);
  const next = base + 1;

  await supabaseAdmin
    .from("company_settings")
    .update({ last_memo_number: next, last_memo_year: year })
    .eq("id", settings.id);

  return `${prefix}${String(next).padStart(6, "0")}/${year}`;
}

function parseReceiptNo(no: string) {
  const m = String(no).match(/(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const yr = parseInt(m[2], 10);
  if (!Number.isFinite(num) || !Number.isFinite(yr)) return null;
  return { num, yr };
}

async function isLatestCollection(receiptNo: string): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("memo_prefix")
    .limit(1)
    .maybeSingle();
  const prefix = settings?.memo_prefix || "RCV-";
  const parsed = parseReceiptNo(receiptNo);
  if (!parsed) return false;
  const { data: rows } = await supabaseAdmin
    .from("collections")
    .select("receipt_no")
    .like("receipt_no", `${prefix}%/${parsed.yr}`);
  let maxNum = 0;
  for (const r of rows ?? []) {
    const p = parseReceiptNo(r.receipt_no);
    if (p && p.num > maxNum) maxNum = p.num;
  }
  return parsed.num === maxNum;
}

// Recompute previous_balance for every FINALIZED bill of a customer by
// chronologically replaying bills and ACTIVE collections.
// previous_balance = running balance (advance positive / due negative) BEFORE that bill.
async function recomputeBillPreviousBalances(customerId: string) {
  const [{ data: cust }, { data: bills }, { data: colls }] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("opening_balance_amount")
      .eq("id", customerId)
      .maybeSingle(),
    supabaseAdmin
      .from("bills")
      .select("id, bill_date, subtotal, discount_amount, grand_total, previous_balance, created_at")
      .eq("customer_id", customerId)
      .eq("status", "FINALIZED"),
    supabaseAdmin
      .from("collections")
      .select("id, collection_date, amount, created_at")
      .eq("customer_id", customerId)
      .eq("status", "ACTIVE"),
  ]);
  if (!cust) return;

  type Ev =
    | {
        kind: "bill";
        date: string;
        created: string;
        id: string;
        subtotal: number;
        discount: number;
        grand: number;
        prev: number;
      }
    | { kind: "coll"; date: string; created: string; amount: number };
  const events: Ev[] = [];
  for (const b of bills ?? []) {
    events.push({
      kind: "bill",
      date: String(b.bill_date),
      created: String(b.created_at ?? ""),
      id: b.id,
      subtotal: Number(b.subtotal || 0),
      discount: Number(b.discount_amount || 0),
      grand: Number(b.grand_total || 0),
      prev: Number(b.previous_balance || 0),
    });
  }
  for (const c of colls ?? []) {
    events.push({
      kind: "coll",
      date: String(c.collection_date),
      created: String(c.created_at ?? ""),
      amount: Number(c.amount || 0),
    });
  }
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "coll" ? -1 : 1;
    return a.created < b.created ? -1 : 1;
  });

  let running = Number(cust.opening_balance_amount || 0);
  const updates: Array<{ id: string; previous_balance: number; grand_total: number }> = [];
  for (const ev of events) {
    if (ev.kind === "coll") {
      running += ev.amount;
    } else {
      const newPrev = r2(running);
      const previousDue = newPrev < 0 ? -newPrev : 0;
      const previousAdvance = newPrev > 0 ? newPrev : 0;
      const newGrand = r2(Math.max(0, previousDue + ev.subtotal - ev.discount - previousAdvance));
      if (Math.abs(newPrev - ev.prev) > 0.009 || Math.abs(newGrand - ev.grand) > 0.009) {
        updates.push({ id: ev.id, previous_balance: newPrev, grand_total: newGrand });
      }
      running += ev.discount - ev.subtotal;
    }
  }
  for (const u of updates) {
    await supabaseAdmin
      .from("bills")
      .update({ previous_balance: u.previous_balance, grand_total: u.grand_total })
      .eq("id", u.id);
  }
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(s + "T00:00:00Z").getTime()), "Invalid date");

const allocationInput = z.object({
  bill_id: z.string().uuid(),
  amount: z.number().positive(),
});

const collectionCore = z.object({
  customer_id: z.string().uuid(),
  collection_date: isoDate.refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    return d.getTime() <= today.getTime();
  }, "Collection date cannot be in the future"),
  amount: z.number().positive().max(99999999),
  payment_method: z.enum(PAYMENT_METHODS),
  reference_no: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  collected_by: z.string().uuid().optional().nullable(),
  bank_account_id: z.string().uuid().optional().nullable(),
  allocations: z.array(allocationInput).max(50).optional().default([]),
});

export const listBankAccountsForCollection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, name, bank_name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- lookups ----------
export const searchCustomersForCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = data.q.replace(/[%,]/g, "");
    const isAdmin = await hasRole(context.userId, "admin");
    let q = supabaseAdmin
      .from("customers")
      .select(
        "id, company_name, name, bin_number, mobile, is_active, area:areas(area_name)",
      )
      .or(`company_name.ilike.%${s}%,bin_number.ilike.%${s}%,mobile.ilike.%${s}%,name.ilike.%${s}%`)
      .limit(15);
    if (!isAdmin) {
      const ids = await getManagerCustomerIds(context.userId);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCustomerForCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      exclude_collection_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCustomerAccess(context.userId, data.id);
    const { data: cust, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, company_name, name, bin_number, mobile, address, is_active, area:areas(area_name), ref:references(reference_name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cust) throw new Error("Customer not found");
    const balance = await getCustomerBalance(data.id, data.exclude_collection_id);
    return { customer: cust, current_balance: balance };
  });

export const listOpenBillsForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customer_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCustomerAccess(context.userId, data.customer_id);
    const { data: bills } = await supabaseAdmin
      .from("bills")
      .select("id, bill_no, bill_date, billing_month, subtotal, discount_amount")
      .eq("customer_id", data.customer_id)
      .eq("status", "FINALIZED")
      .order("billing_month", { ascending: true });

    const billIds = (bills ?? []).map((b) => b.id);
    let allocByBill: Record<string, number> = {};
    if (billIds.length > 0) {
      const { data: allocs } = await supabaseAdmin
        .from("collection_allocations")
        .select("bill_id, amount, collection:collections!inner(status)")
        .in("bill_id", billIds);
      for (const a of allocs ?? []) {
        const status = (a.collection as { status?: string } | null)?.status;
        if (status !== "ACTIVE") continue;
        allocByBill[a.bill_id] = (allocByBill[a.bill_id] || 0) + Number(a.amount || 0);
      }
    }

    return (bills ?? [])
      .map((b) => {
        const due = r2(Number(b.subtotal || 0) - Number(b.discount_amount || 0));
        const paid = r2(allocByBill[b.id] || 0);
        const remaining = r2(due - paid);
        return {
          id: b.id,
          bill_no: b.bill_no,
          bill_date: b.bill_date,
          billing_month: b.billing_month,
          due,
          paid,
          remaining,
        };
      })
      .filter((b) => b.remaining > 0.009);
  });

// ---------- create ----------
export const createCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => collectionCore.parse(input))
  .handler(async ({ data, context }) => {
    const { data: cust } = await supabaseAdmin
      .from("customers")
      .select("id, is_active")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (!cust) throw new Error("Customer not found");

    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) {
      const { data: mgr } = await supabaseAdmin
        .from("customer_managers")
        .select("id")
        .eq("customer_id", data.customer_id)
        .eq("manager_id", context.userId)
        .maybeSingle();
      if (!mgr) throw new Error("You are not assigned to this customer");
    }

    // Validate allocations sum <= amount
    const allocSum = (data.allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
    if (allocSum > data.amount + 0.009) {
      throw new Error("Total allocation amount cannot exceed collection amount");
    }

    const receiptNo = await generateReceiptNo();
    const { data: row, error } = await supabaseAdmin
      .from("collections")
      .insert({
        receipt_no: receiptNo,
        customer_id: data.customer_id,
        collection_date: data.collection_date,
        amount: r2(data.amount),
        payment_method: data.payment_method,
        reference_no: data.reference_no || null,
        notes: data.notes || null,
        collected_by: data.collected_by || context.userId,
        bank_account_id: data.payment_method === "BANK" ? (data.bank_account_id ?? null) : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.allocations && data.allocations.length > 0) {
      const rows = data.allocations.map((a) => ({
        collection_id: row.id,
        bill_id: a.bill_id,
        amount: r2(a.amount),
      }));
      const { error: aErr } = await supabaseAdmin
        .from("collection_allocations")
        .insert(rows);
      if (aErr) {
        await supabaseAdmin.from("collections").delete().eq("id", row.id);
        throw new Error(aErr.message);
      }
    }

    await recomputeBillPreviousBalances(data.customer_id);
    return { id: row.id, receipt_no: receiptNo };
  });

// ---------- update (last only, admin only) ----------
export const updateCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    collectionCore.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) throw new Error("Only admin can edit collections");

    const { data: existing } = await supabaseAdmin
      .from("collections")
      .select("id, status, receipt_no")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Collection not found");
    if (existing.status === "CANCELLED") throw new Error("Cancelled collections cannot be edited");
    if (!(await isLatestCollection(existing.receipt_no))) {
      throw new Error("Only the most recent collection can be edited");
    }

    const allocSum = (data.allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
    if (allocSum > data.amount + 0.009) {
      throw new Error("Total allocation amount cannot exceed collection amount");
    }

    const { error } = await supabaseAdmin
      .from("collections")
      .update({
        customer_id: data.customer_id,
        collection_date: data.collection_date,
        amount: r2(data.amount),
        payment_method: data.payment_method,
        reference_no: data.reference_no || null,
        notes: data.notes || null,
        collected_by: data.collected_by || null,
        bank_account_id: data.payment_method === "BANK" ? (data.bank_account_id ?? null) : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("collection_allocations").delete().eq("collection_id", data.id);
    if (data.allocations && data.allocations.length > 0) {
      const rows = data.allocations.map((a) => ({
        collection_id: data.id,
        bill_id: a.bill_id,
        amount: r2(a.amount),
      }));
      const { error: aErr } = await supabaseAdmin
        .from("collection_allocations")
        .insert(rows);
      if (aErr) throw new Error(aErr.message);
    }

    await recomputeBillPreviousBalances(data.customer_id);
    return { ok: true };
  });

// ---------- cancel (last only, admin only) ----------
export const cancelCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) throw new Error("Only admin can cancel collections");

    const { data: existing } = await supabaseAdmin
      .from("collections")
      .select("status, receipt_no")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Collection not found");
    if (existing.status === "CANCELLED") throw new Error("Already cancelled");
    if (!(await isLatestCollection(existing.receipt_no))) {
      throw new Error("Only the most recent collection can be cancelled");
    }

    const { data: existingFull } = await supabaseAdmin
      .from("collections")
      .select("customer_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("collections")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existingFull?.customer_id) await recomputeBillPreviousBalances(existingFull.customer_id);
    return { ok: true };
  });

// ---------- delete (last only, admin only) ----------
export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) throw new Error("Only admin can delete collections");

    const { data: existing } = await supabaseAdmin
      .from("collections")
      .select("id, receipt_no, customer_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Collection not found");
    if (!(await isLatestCollection(existing.receipt_no))) {
      throw new Error("Only the most recent collection can be deleted");
    }

    const parsed = parseReceiptNo(existing.receipt_no);
    if (!parsed) throw new Error("Cannot parse receipt number");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("id, memo_prefix, starting_memo_number, last_memo_year")
      .limit(1)
      .maybeSingle();

    await supabaseAdmin.from("collection_allocations").delete().eq("collection_id", data.id);
    const { error } = await supabaseAdmin.from("collections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    // Rebuild counter for current tracked year
    if (settings) {
      const prefix = settings.memo_prefix || "RCV-";
      const startFrom = Number(settings.starting_memo_number || 1);
      const trackedYear = settings.last_memo_year ?? new Date().getFullYear();
      const { data: remaining } = await supabaseAdmin
        .from("collections")
        .select("receipt_no")
        .like("receipt_no", `${prefix}%/${trackedYear}`);
      let newMax = startFrom - 1;
      for (const r of remaining ?? []) {
        const p = parseReceiptNo(r.receipt_no);
        if (p && p.num > newMax) newMax = p.num;
      }
      await supabaseAdmin
        .from("company_settings")
        .update({ last_memo_number: Math.max(0, newMax) })
        .eq("id", settings.id);
    }

    await recomputeBillPreviousBalances(existing.customer_id);
    return { ok: true };
  });

// ---------- list / get ----------
export const listCollections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      search: z.string().optional(),
      status: z.enum(["all", "ACTIVE", "CANCELLED"]).optional().default("all"),
      payment_method: z.string().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      area_id: z.string().uuid().nullable().optional(),
      customer_id: z.string().uuid().nullable().optional(),
      page: z.number().int().min(1).optional().default(1),
      page_size: z.number().int().min(1).max(200).optional().default(20),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const page = data.page ?? 1;
    const pageSize = data.page_size ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const isAdmin = await hasRole(context.userId, "admin");
    let managerCustomerIds: string[] | null = null;
    if (!isAdmin) {
      managerCustomerIds = await getManagerCustomerIds(context.userId);
      if (managerCustomerIds.length === 0) {
        return { rows: [], total: 0, page, page_size: pageSize };
      }
      if (data.customer_id && !managerCustomerIds.includes(data.customer_id)) {
        return { rows: [], total: 0, page, page_size: pageSize };
      }
    }


    let q = supabaseAdmin
      .from("collections")
      .select(
        "id, receipt_no, collection_date, amount, payment_method, reference_no, status, created_at, customer:customers(id, company_name, name, bin_number, area_id, area:areas(area_name)), collector:profiles!collections_collected_by_fkey(id, name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.payment_method && data.payment_method !== "all")
      q = q.eq("payment_method", data.payment_method);
    if (data.from_date) q = q.gte("collection_date", data.from_date);
    if (data.to_date) q = q.lte("collection_date", data.to_date);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (managerCustomerIds) q = q.in("customer_id", managerCustomerIds);
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[%,]/g, "");
      // Find matching customers by name/company/mobile/bin
      const { data: matchedCustomers } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(
          `company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,bin_number.ilike.%${s}%`,
        )
        .limit(500);
      const customerIds = (matchedCustomers ?? []).map((c) => c.id);
      const orParts = [`receipt_no.ilike.%${s}%`, `reference_no.ilike.%${s}%`];
      if (customerIds.length > 0) {
        orParts.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      q = q.or(orParts.join(","));
    }

    q = q.range(from, to);
    const { data: rows, error, count } = await q;
    if (error) {
      // Fallback if profiles FK not set up — retry without collector join
      let q2 = supabaseAdmin
        .from("collections")
        .select(
          "id, receipt_no, collection_date, amount, payment_method, reference_no, status, created_at, customer:customers(id, company_name, name, bin_number, area_id, area:areas(area_name))",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (data.status && data.status !== "all") q2 = q2.eq("status", data.status);
      if (data.payment_method && data.payment_method !== "all")
        q2 = q2.eq("payment_method", data.payment_method);
      if (data.from_date) q2 = q2.gte("collection_date", data.from_date);
      if (data.to_date) q2 = q2.lte("collection_date", data.to_date);
      if (data.customer_id) q2 = q2.eq("customer_id", data.customer_id);
      if (managerCustomerIds) q2 = q2.in("customer_id", managerCustomerIds);
      if (data.search?.trim()) {
        const s = data.search.trim().replace(/[%,]/g, "");
        const { data: matchedCustomers } = await supabaseAdmin
          .from("customers")
          .select("id")
          .or(
            `company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,bin_number.ilike.%${s}%`,
          )
          .limit(500);
        const customerIds = (matchedCustomers ?? []).map((c) => c.id);
        const orParts = [`receipt_no.ilike.%${s}%`, `reference_no.ilike.%${s}%`];
        if (customerIds.length > 0) {
          orParts.push(`customer_id.in.(${customerIds.join(",")})`);
        }
        q2 = q2.or(orParts.join(","));
      }
      q2 = q2.range(from, to);
      const res2 = await q2;
      if (res2.error) throw new Error(res2.error.message);
      let filtered = res2.data ?? [];
      if (data.area_id) filtered = filtered.filter((r) => r.customer?.area_id === data.area_id);
      return { rows: filtered, total: res2.count ?? 0, page, page_size: pageSize };
    }


    let filtered = rows ?? [];
    if (data.area_id) filtered = filtered.filter((r) => r.customer?.area_id === data.area_id);
    return { rows: filtered, total: count ?? 0, page, page_size: pageSize };
  });

export const getCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    let finalRow: any = null;
    const { data: row, error } = await supabaseAdmin
      .from("collections")
      .select(
        "*, customer:customers(id, company_name, name, bin_number, mobile, address, area:areas(area_name)), collector:profiles!collections_collected_by_fkey(id, name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      const { data: row2, error: e2 } = await supabaseAdmin
        .from("collections")
        .select(
          "*, customer:customers(id, company_name, name, bin_number, mobile, address, area:areas(area_name))",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (e2) throw new Error(e2.message);
      if (!row2) throw new Error("Collection not found");
      finalRow = row2;
    } else {
      if (!row) throw new Error("Collection not found");
      finalRow = row;
    }
    await assertCustomerAccess(context.userId, finalRow.customer_id);

    const { data: allocs } = await supabaseAdmin
      .from("collection_allocations")
      .select("id, bill_id, amount, bill:bills(bill_no, billing_month)")
      .eq("collection_id", data.id);

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, address, phone, email, logo_url, bin_number, memo_prefix, print_page_size, print_orientation, print_margin_top, print_margin_bottom, print_margin_left, print_margin_right, print_show_logo, print_show_header, print_show_footer, print_signature_line, print_signature_label, print_signature_url, invoice_footer_text")
      .limit(1)
      .maybeSingle();

    return {
      collection: finalRow,
      allocations: allocs ?? [],
      company,
      is_latest: await isLatestCollection(finalRow.receipt_no),
    };
  });

export const listCollectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) {
      // Managers can only pick themselves as collector.
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .eq("id", context.userId)
        .eq("is_active", true);
      return data ?? [];
    }
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  });

// Receipt data for thermal-print page (includes previous-due math)
export const getReceiptData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    let finalRow: any = null;
    const { data: row, error } = await supabaseAdmin
      .from("collections")
      .select(
        "id, receipt_no, collection_date, amount, payment_method, reference_no, notes, status, customer:customers(id, company_name, name, bin_number, mobile, address, area:areas(area_name)), collector:profiles!collections_collected_by_fkey(id, name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      const { data: row2, error: e2 } = await supabaseAdmin
        .from("collections")
        .select(
          "id, receipt_no, collection_date, amount, payment_method, reference_no, notes, status, customer:customers(id, company_name, name, bin_number, mobile, address, area:areas(area_name))",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (e2) throw new Error(e2.message);
      finalRow = row2;
    } else {
      finalRow = row;
    }
    if (!finalRow) throw new Error("Receipt not found");
    await assertCustomerAccess(context.userId, finalRow.customer.id);

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, address, phone, email, bin_number")
      .limit(1)
      .maybeSingle();

    // Signed balance excluding this collection (+ advance, - due)
    const prevSigned = await getCustomerBalance(finalRow.customer.id, finalRow.id);
    const amount = Number(finalRow.amount || 0);
    const isActive = finalRow.status === "ACTIVE";
    const afterSigned = isActive ? r2(prevSigned + amount) : r2(prevSigned);

    return {
      collection: finalRow,
      company,
      previous_due: r2(-prevSigned), // + = due, - = advance
      paid_amount: r2(amount),
      balance: r2(-afterSigned),     // + = due remaining, - = advance
    };
  });

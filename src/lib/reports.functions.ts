import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function assignedCustomerIds(managerId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("customer_id")
    .eq("manager_id", managerId);
  return (data ?? []).map((r: any) => r.customer_id as string);
}

const dateRange = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  area_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
});

const billingInput = dateRange.extend({
  // "date" => filter by bill_date range; "month" => filter by billing_month (YYYY-MM)
  filter_by: z.enum(["date", "month"]).optional(),
  month: z.string().optional(), // YYYY-MM
  reference_id: z.string().uuid().optional(),
});

// ----------- Billing Report -----------
export const getBillingReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => billingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    let q = supabaseAdmin
      .from("bills")
      .select(
        "id, bill_no, bill_date, billing_month, previous_balance, subtotal, discount_amount, grand_total, status, customer:customers(id, name, company_name, mobile, address, bin_number, reference_id, area:areas(id, area_name), ref:references(id, reference_name))",
      )
      .neq("status", "CANCELLED")
      .order("bill_date", { ascending: false });

    if (data.filter_by === "month" && data.month) {
      const start = `${data.month}-01`;
      const [y, m] = data.month.split("-").map(Number);
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
      q = q.gte("billing_month", start).lt("billing_month", end);
    } else {
      if (data.from) q = q.gte("bill_date", data.from);
      if (data.to) q = q.lte("bill_date", data.to);
    }
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (!admin) q = q.eq("created_by", userId);

    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);

    let filtered = (rows ?? []) as any[];
    if (data.area_id) filtered = filtered.filter((b) => b.customer?.area?.id === data.area_id);
    if (data.reference_id) filtered = filtered.filter((b) => b.customer?.reference_id === data.reference_id);

    // Books of Accounts Maintenance amount per bill (from bill_items)
    const boaByBill = new Map<string, number>();
    const billIds = filtered.map((b) => b.id);
    if (billIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("bill_items")
        .select("bill_id, qty, service_item:service_items(item_name)")
        .in("bill_id", billIds);
      (items ?? []).forEach((it: any) => {
        const name = String(it.service_item?.item_name ?? "").toLowerCase();
        if (name.includes("books of accounts")) {
          boaByBill.set(it.bill_id, (boaByBill.get(it.bill_id) ?? 0) + Number(it.qty || 0));
        }
      });
    }

    const total_count = filtered.length;
    const total_subtotal = r2(filtered.reduce((s, b) => s + Number(b.subtotal || 0), 0));
    const total_discount = r2(filtered.reduce((s, b) => s + Number(b.discount_amount || 0), 0));
    const total_amount = r2(filtered.reduce((s, b) => s + Number(b.grand_total || 0), 0));
    const total_previous = r2(filtered.reduce((s, b) => s + Number(b.previous_balance || 0), 0));
    const total_payable = r2(total_subtotal - total_previous);
    const total_active_clients = new Set(filtered.map((b) => b.customer?.id).filter(Boolean)).size;
    const total_books_of_accounts = r2(
      Array.from(boaByBill.values()).reduce((s, v) => s + v, 0),
    );

    return {
      rows: filtered.map((b) => ({
        id: b.id,
        bill_no: b.bill_no,
        bill_date: b.bill_date,
        billing_month: b.billing_month,
        previous_balance: Number(b.previous_balance || 0),
        subtotal: Number(b.subtotal || 0),
        discount: Number(b.discount_amount || 0),
        grand_total: Number(b.grand_total || 0),
        books_of_accounts: r2(boaByBill.get(b.id) ?? 0),
        status: b.status,
        customer_name: b.customer?.company_name || b.customer?.name || "",
        mobile: b.customer?.mobile ?? "",
        address: b.customer?.address ?? "",
        bin_number: b.customer?.bin_number ?? "",
        area_name: b.customer?.area?.area_name ?? "",
        reference_name: b.customer?.ref?.reference_name ?? "",
      })),
      summary: { total_active_clients, total_count, total_subtotal, total_discount, total_amount, total_previous, total_payable, total_books_of_accounts },
    };
  });

// ----------- Collection Report -----------
const collectionInput = dateRange.extend({
  // "date" => filter by collection_date range; "month" => filter by month (YYYY-MM) of collection_date
  filter_by: z.enum(["date", "month"]).optional(),
  month: z.string().optional(), // YYYY-MM
  reference_id: z.string().uuid().optional(),
});

export const getCollectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => collectionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    let q = supabaseAdmin
      .from("collections")
      .select(
        "id, receipt_no, collection_date, amount, payment_method, status, customer:customers(id, name, mobile, reference_id, area:areas(id, area_name), ref:references(id, reference_name)), collector:profiles!collections_collected_by_fkey(id, name)",
      )
      .eq("status", "ACTIVE")
      .order("collection_date", { ascending: false });

    if (data.filter_by === "month" && data.month) {
      const start = `${data.month}-01`;
      const [y, m] = data.month.split("-").map(Number);
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
      q = q.gte("collection_date", start).lt("collection_date", end);
    } else {
      if (data.from) q = q.gte("collection_date", data.from);
      if (data.to) q = q.lte("collection_date", data.to);
    }
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (!admin) q = q.eq("created_by", userId);

    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);

    let filtered = (rows ?? []) as any[];
    if (data.area_id) filtered = filtered.filter((c) => c.customer?.area?.id === data.area_id);
    if (data.reference_id) filtered = filtered.filter((c) => c.customer?.reference_id === data.reference_id);

    const total_count = filtered.length;
    const total_amount = r2(filtered.reduce((s, c) => s + Number(c.amount || 0), 0));

    return {
      rows: filtered.map((c) => ({
        id: c.id,
        receipt_no: c.receipt_no,
        collection_date: c.collection_date,
        amount: Number(c.amount || 0),
        payment_method: c.payment_method,
        customer_name: c.customer?.name ?? "",
        mobile: c.customer?.mobile ?? "",
        area_name: c.customer?.area?.area_name ?? "",
        reference_name: c.customer?.ref?.reference_name ?? "",
        collected_by: c.collector?.name ?? "",
      })),
      summary: { total_count, total_amount },
    };
  });

// ----------- Collection By-Reference Summary (Bills / Paid / Balance upto date) -----------
const byRefSummaryInput = z.object({
  reference_id: z.string().uuid(),
  upto: z.string().optional(), // YYYY-MM-DD inclusive
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
});

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export const getCollectionByRefSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => byRefSummaryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    // Customers under this reference (visible to current user)
    let custQ = supabaseAdmin
      .from("customers")
      .select("id, opening_balance_amount")
      .eq("reference_id", data.reference_id);
    if (!admin) {
      const allowed = await assignedCustomerIds(userId);
      if (allowed.length === 0) {
        return {
          summary: { total_bills: 0, opening_amount: 0, opening_type: null, billing_amount: 0, paid_amount: 0, balance_amount: 0, balance_type: null },
        };
      }
      custQ = custQ.in("id", allowed);
    }
    const { data: customers, error: cErr } = await custQ;
    if (cErr) throw new Error(cErr.message);
    const custList = (customers ?? []) as Array<{ id: string; opening_balance_amount: number | null }>;
    if (custList.length === 0) {
      return {
        summary: { total_bills: 0, opening_amount: 0, opening_type: null, billing_amount: 0, paid_amount: 0, balance_amount: 0, balance_type: null },
      };
    }
    const ids = custList.map((c) => c.id);
    const staticOpening = r2(custList.reduce((s, c) => s + Number(c.opening_balance_amount || 0), 0));
    const monthStart = data.month ? `${data.month}-01` : undefined;
    const monthEnd = data.month ? lastDayOfMonth(data.month) : undefined;
    const periodEnd = data.upto || monthEnd;

    // When filtered by month (e.g. Jun 2026), displayed "Billing Amount" is the
    // PREVIOUS month's bills (e.g. May 2026). That billing is already baked into
    // the opening balance as of 01 Jun, so it must NOT be subtracted again in closing.
    let prevMonthStart: string | undefined;
    let prevMonthEnd: string | undefined;
    if (data.month) {
      const [y, m] = data.month.split("-").map(Number);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const prevYM = `${py}-${String(pm).padStart(2, "0")}`;
      prevMonthStart = `${prevYM}-01`;
      prevMonthEnd = lastDayOfMonth(prevYM);
    }

    let billsQ = supabaseAdmin
      .from("bills")
      .select("subtotal, discount_amount, status, bill_date, billing_month")
      .in("customer_id", ids)
      .eq("status", "FINALIZED");
    let collsQ = supabaseAdmin
      .from("collections")
      .select("amount, status, collection_date")
      .in("customer_id", ids)
      .eq("status", "ACTIVE");
    if (monthStart && monthEnd) {
      // Displayed bills = previous month's billing_month
      billsQ = billsQ.gte("billing_month", prevMonthStart!).lte("billing_month", prevMonthEnd!);
      collsQ = collsQ.gte("collection_date", monthStart).lte("collection_date", periodEnd as string);
    } else if (periodEnd) {
      billsQ = billsQ.lte("bill_date", periodEnd);
      collsQ = collsQ.lte("collection_date", periodEnd);
    }
    const [billsRes, collRes] = await Promise.all([billsQ, collsQ]);
    if (billsRes.error) throw new Error(billsRes.error.message);
    if (collRes.error) throw new Error(collRes.error.message);

    const bills = (billsRes.data ?? []) as Array<{ subtotal: number | null; discount_amount: number | null }>;
    const colls = (collRes.data ?? []) as Array<{ amount: number | null }>;

    let opening = staticOpening;
    if (monthStart) {
      const [prevBillsRes, prevCollsRes] = await Promise.all([
        supabaseAdmin
          .from("bills")
          .select("subtotal, discount_amount")
          .in("customer_id", ids)
          .eq("status", "FINALIZED")
          .lt("billing_month", monthStart),
        supabaseAdmin
          .from("collections")
          .select("amount")
          .in("customer_id", ids)
          .eq("status", "ACTIVE")
          .lt("collection_date", monthStart),
      ]);
      if (prevBillsRes.error) throw new Error(prevBillsRes.error.message);
      if (prevCollsRes.error) throw new Error(prevCollsRes.error.message);
      const prevBilling = r2(
        (prevBillsRes.data ?? []).reduce(
          (s, b) => s + Number(b.subtotal || 0) - Number(b.discount_amount || 0),
          0,
        ),
      );
      const prevPaid = r2((prevCollsRes.data ?? []).reduce((s, c) => s + Number(c.amount || 0), 0));
      opening = r2(staticOpening + prevPaid - prevBilling);
    }

    const total_bills = bills.length;
    const billing_amount = r2(
      bills.reduce((s, b) => s + Number(b.subtotal || 0) - Number(b.discount_amount || 0), 0),
    );
    const paid_amount = r2(colls.reduce((s, c) => s + Number(c.amount || 0), 0));

    // In month view: billing is informational (already in opening), so closing = opening + paid.
    // In non-month view: legacy behavior subtracts current-period billing.
    const closingSigned = monthStart
      ? r2(opening + paid_amount)
      : r2(opening + paid_amount - billing_amount);
    const balance_amount = r2(-closingSigned);
    const opening_type: "DUE" | "ADVANCE" | null = opening < 0 ? "DUE" : opening > 0 ? "ADVANCE" : null;
    const balance_type: "DUE" | "ADVANCE" | null = balance_amount > 0 ? "DUE" : balance_amount < 0 ? "ADVANCE" : null;

    return {
      summary: { total_bills, opening_amount: opening, opening_type, billing_amount, paid_amount, balance_amount, balance_type },
    };
  });


// ----------- Due Report -----------
const dueInput = z.object({
  area_id: z.string().uuid().optional(),
  reference_id: z.string().uuid().optional(),
  include_inactive: z.boolean().optional(),
});

export const getDueReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => dueInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    let custQ = supabaseAdmin
      .from("customers")
      .select(
        "id, name, mobile, is_active, opening_balance_amount, reference_id, area:areas(id, area_name), ref:references(id, reference_name)",
      )
      .order("name");

    if (!data.include_inactive) custQ = custQ.eq("is_active", true);
    if (data.area_id) custQ = custQ.eq("area_id", data.area_id);
    if (data.reference_id) custQ = custQ.eq("reference_id", data.reference_id);

    if (!admin) {
      const allowed = await assignedCustomerIds(userId);
      if (allowed.length === 0) return { rows: [], summary: { total_customers: 0, total_due: 0, total_advance: 0 } };
      custQ = custQ.in("id", allowed);
    }

    const { data: customers, error } = await custQ;
    if (error) throw new Error(error.message);
    const custList = (customers ?? []) as any[];
    if (custList.length === 0) return { rows: [], summary: { total_customers: 0, total_due: 0, total_advance: 0 } };

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

    // Latest bill per customer
    const lastBillByCust = new Map<string, { grand_total: number; bill_date: string }>();
    for (const b of (bills ?? []) as any[]) {
      if (!lastBillByCust.has(b.customer_id)) {
        lastBillByCust.set(b.customer_id, {
          grand_total: Number(b.grand_total || 0),
          bill_date: b.bill_date,
        });
      }
    }

    // Collections on/after latest bill date per customer
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

    const rows = custList
      .map((c) => {
        const last = lastBillByCust.get(c.id);
        if (!last) return null;
        const paidAfter = paidAfterLastByCust.get(c.id) ?? 0;
        const due = r2(last.grand_total - paidAfter);
        if (due <= 0) return null;
        return {
          id: c.id,
          customer_name: c.name,
          mobile: c.mobile ?? "",
          area_name: c.area?.area_name ?? "",
          reference_name: c.ref?.reference_name ?? "",
          is_active: c.is_active,
          billed: r2(last.grand_total),
          paid: r2(paidAfter),
          opening: r2(Number(c.opening_balance_amount || 0)),
          due,
          advance: 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    rows.sort((a, b) => b.due - a.due);

    const total_due = r2(rows.reduce((s: number, r: { due: number }) => s + r.due, 0));
    const total_advance = 0;

    return {
      rows,
      summary: { total_customers: rows.length, total_due, total_advance },
    };
  });

// ----------- Customer Report -----------
const customerInput = z.object({
  area_id: z.string().uuid().optional(),
  customer_type_id: z.string().uuid().optional(),
  reference_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

export const getCustomerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => customerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    let q = supabaseAdmin
      .from("customers")
      .select(
        "id, name, company_name, bin_number, vat_user_id, vat_password, mobile, email, address, is_active, monthly_fee, created_at, area:areas(id, area_name), type:customer_types(id, type_name), ref:references(id, reference_name)",
      )
      .order("name");

    if (data.area_id) q = q.eq("area_id", data.area_id);
    if (data.customer_type_id) q = q.eq("customer_type_id", data.customer_type_id);
    if (data.reference_id) q = q.eq("reference_id", data.reference_id);
    if (typeof data.is_active === "boolean") q = q.eq("is_active", data.is_active);

    if (!admin) {
      const allowed = await assignedCustomerIds(userId);
      if (allowed.length === 0) return { rows: [], summary: { total: 0, active: 0, inactive: 0 } };
      q = q.in("id", allowed);
    }

    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);

    const list = (rows ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      company_name: c.company_name ?? "",
      bin_number: c.bin_number ?? "",
      vat_user_id: c.vat_user_id ?? "",
      vat_password: c.vat_password ?? "",
      mobile: c.mobile ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      area_name: c.area?.area_name ?? "",
      type_name: c.type?.type_name ?? "",
      reference_name: c.ref?.reference_name ?? "",
      monthly_fee: Number(c.monthly_fee || 0),
      is_active: c.is_active,
      created_at: c.created_at,
    }));

    const active = list.filter((c) => c.is_active).length;
    return {
      rows: list,
      summary: { total: list.length, active, inactive: list.length - active },
    };
  });

// ----------- Missing Bills Report -----------
const missingBillsInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  area_id: z.string().uuid().optional(),
  reference_id: z.string().uuid().optional(),
});

export const getMissingBillsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => missingBillsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);

    const start = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    // Bills (non-cancelled) in the billing month
    let bq = supabaseAdmin
      .from("bills")
      .select("customer_id, created_by")
      .neq("status", "CANCELLED")
      .gte("billing_month", start)
      .lt("billing_month", end);
    if (!admin) bq = bq.eq("created_by", userId);
    const { data: billed, error: bErr } = await bq.limit(10000);
    if (bErr) throw new Error(bErr.message);
    const billedSet = new Set((billed ?? []).map((b: any) => b.customer_id as string));

    // Active customers
    let cq = supabaseAdmin
      .from("customers")
      .select(
        "id, name, company_name, mobile, address, monthly_fee, enabled_month, is_active, created_at, created_by, reference_id, area:areas(id, area_name), ref:references(id, reference_name)",
      )
      .eq("is_active", true);
    if (data.area_id) cq = cq.eq("area_id", data.area_id);
    if (data.reference_id) cq = cq.eq("reference_id", data.reference_id);

    if (!admin) {
      const assigned = await assignedCustomerIds(userId);
      const ids = Array.from(new Set(assigned));
      if (ids.length === 0) {
        return { rows: [], summary: { total_active: 0, billed: 0, missing: 0 } };
      }
      cq = cq.in("id", ids);
    }

    const { data: customers, error: cErr } = await cq.limit(10000);
    if (cErr) throw new Error(cErr.message);

    // Eligibility: customer must exist on/before the selected billing month.
    // Prefer enabled_month; fall back to created_at so customers don't appear
    // as "missing" for months before they were created.
    const eligible = (customers ?? []).filter((c: any) => {
      const ref = c.enabled_month
        ? String(c.enabled_month).slice(0, 10)
        : c.created_at
        ? String(c.created_at).slice(0, 10)
        : null;
      if (!ref) return true;
      return ref <= end; // created within or before the selected month
    });

    const missing = eligible.filter((c: any) => !billedSet.has(c.id));

    return {
      rows: missing.map((c: any) => ({
        id: c.id,
        customer_name: c.company_name || c.name || "",
        mobile: c.mobile ?? "",
        address: c.address ?? "",
        area_name: c.area?.area_name ?? "",
        reference_name: c.ref?.reference_name ?? "",
        monthly_fee: Number(c.monthly_fee || 0),
      })),
      summary: {
        total_active: eligible.length,
        billed: eligible.length - missing.length,
        missing: missing.length,
      },
    };
  });

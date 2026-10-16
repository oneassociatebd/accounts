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
  return (data ?? []).map((r: { customer_id: string }) => r.customer_id);
}

type CustomerLite = {
  id: string;
  name: string | null;
  company_name: string | null;
  opening_balance_amount: number | null;
  opening_balance_type: string | null;
};

type BillRow = { customer_id: string; subtotal: number | null; discount_amount: number | null; bill_date: string };
type CollRow = { customer_id: string; amount: number | null; collection_date: string };

/**
 * Compute balances for a given year for the provided customers.
 * Recurses backwards to fill missing prior-year snapshots if needed (lazy backfill).
 * Returns Map<customer_id, { opening, bills, collections, closing }>.
 */
async function computeYearBalances(
  year: number,
  customers: CustomerLite[],
  cache: Map<string, Map<number, { opening: number; bills: number; collections: number; closing: number }>> = new Map(),
): Promise<Map<string, { opening: number; bills: number; collections: number; closing: number }>> {
  const custIds = customers.map((c) => c.id);
  const result = new Map<string, { opening: number; bills: number; collections: number; closing: number }>();
  if (custIds.length === 0) return result;

  // Only use stored snapshots for fully closed prior years. For the current
  // (or future) year, snapshots may be stale (e.g. older filter rules), so
  // always recompute live.
  const nowYear = new Date().getFullYear();
  const useSnapshots = year < nowYear;
  const existingMap = new Map<string, { opening: number; bills: number; collections: number; closing: number }>();
  if (useSnapshots) {
    const { data: existing } = await supabaseAdmin
      .from("customer_yearly_balances")
      .select("customer_id, opening_due, total_bills, total_collections, closing_due")
      .eq("year", year)
      .in("customer_id", custIds);
    for (const r of (existing ?? []) as Array<{
      customer_id: string; opening_due: number; total_bills: number; total_collections: number; closing_due: number;
    }>) {
      existingMap.set(r.customer_id, {
        opening: Number(r.opening_due || 0),
        bills: Number(r.total_bills || 0),
        collections: Number(r.total_collections || 0),
        closing: Number(r.closing_due || 0),
      });
    }
  }


  // For customers without a snapshot, compute on the fly
  const missing = customers.filter((c) => !existingMap.has(c.id));
  let bills: BillRow[] = [];
  let colls: CollRow[] = [];
  if (missing.length > 0) {
    const missingIds = missing.map((c) => c.id);
    const yStart = `${year}-01-01`;
    const yEnd = `${year}-12-31`;
    const [bRes, cRes] = await Promise.all([
      supabaseAdmin
        .from("bills")
        .select("customer_id, subtotal, discount_amount, bill_date")
        .in("customer_id", missingIds)
        .gte("bill_date", yStart)
        .lte("bill_date", yEnd)
        .eq("status", "FINALIZED"),
      supabaseAdmin
        .from("collections")
        .select("customer_id, amount, collection_date")
        .in("customer_id", missingIds)
        .gte("collection_date", yStart)
        .lte("collection_date", yEnd)
        .eq("status", "ACTIVE"),
    ]);
    bills = (bRes.data ?? []) as BillRow[];
    colls = (cRes.data ?? []) as CollRow[];

    // Compute opening for missing customers. Current/future years must not rely
    // on stale prior-year snapshots; match Customer Ledger by deriving opening
    // from all finalized bills and active collections before the selected year.
    const prevClosing = new Map<string, number>();
    if (year >= nowYear) {
      const [prevBillsRes, prevCollsRes] = await Promise.all([
        supabaseAdmin
          .from("bills")
          .select("customer_id, subtotal, discount_amount, bill_date")
          .in("customer_id", missingIds)
          .lt("bill_date", yStart)
          .eq("status", "FINALIZED"),
        supabaseAdmin
          .from("collections")
          .select("customer_id, amount, collection_date")
          .in("customer_id", missingIds)
          .lt("collection_date", yStart)
          .eq("status", "ACTIVE"),
      ]);
      const prevBillsByCust = new Map<string, number>();
      const prevCollsByCust = new Map<string, number>();
      for (const b of (prevBillsRes.data ?? []) as BillRow[]) {
        const eff = Number(b.subtotal || 0) - Number(b.discount_amount || 0);
        prevBillsByCust.set(b.customer_id, (prevBillsByCust.get(b.customer_id) || 0) + eff);
      }
      for (const c of (prevCollsRes.data ?? []) as CollRow[]) {
        prevCollsByCust.set(c.customer_id, (prevCollsByCust.get(c.customer_id) || 0) + Number(c.amount || 0));
      }
      for (const c of missing) {
        const openingDue = -Number(c.opening_balance_amount || 0);
        prevClosing.set(c.id, r2(openingDue + (prevBillsByCust.get(c.id) || 0) - (prevCollsByCust.get(c.id) || 0)));
      }
    } else {
      const { data: prevSnap } = await supabaseAdmin
        .from("customer_yearly_balances")
        .select("customer_id, closing_due")
        .eq("year", year - 1)
        .in("customer_id", missing.map((c) => c.id));
      for (const r of (prevSnap ?? []) as Array<{ customer_id: string; closing_due: number }>) {
        prevClosing.set(r.customer_id, Number(r.closing_due || 0));
      }
    }

    const billsByCust = new Map<string, number>();
    const collsByCust = new Map<string, number>();
    for (const b of bills) {
      const eff = Number(b.subtotal || 0) - Number(b.discount_amount || 0);
      billsByCust.set(b.customer_id, (billsByCust.get(b.customer_id) || 0) + eff);
    }
    for (const c of colls) collsByCust.set(c.customer_id, (collsByCust.get(c.customer_id) || 0) + Number(c.amount || 0));

    for (const c of missing) {
      const fallbackOpening = -Number(c.opening_balance_amount || 0); // ADVANCE positive -> negative due
      const opening = prevClosing.has(c.id) ? (prevClosing.get(c.id) as number) : fallbackOpening;
      const b = billsByCust.get(c.id) || 0;
      const p = collsByCust.get(c.id) || 0;
      const closing = opening + b - p;
      existingMap.set(c.id, { opening: r2(opening), bills: r2(b), collections: r2(p), closing: r2(closing) });
    }
  }


  for (const c of customers) {
    result.set(c.id, existingMap.get(c.id) || { opening: 0, bills: 0, collections: 0, closing: 0 });
  }
  return result;
}

export type DashboardStats = {
  managers: { total: number; active: number; inactive: number; new_this_month: number; inactive_this_month: number };
  clients: {
    total: number;
    active: number;
    inactive: number;
    new_this_month: number;
    inactive_this_month: number;
  };
  finance: {
    selected_year: number;
    opening_due: number;
    year_bills: number;
    year_collections: number;
    year_discount: number;
    closing_due: number;
    // legacy compat
    total_bill: number;
    total_collection: number;
    total_due: number;
    total_discount: number;
    last_year_closing: number;
    last_year_label: string;
  };
  top_collection: Array<{ customer_id: string; name: string; amount: number }>;
  top_due: Array<{ customer_id: string; name: string; amount: number }>;
  monthly: Array<{ month: string; collection: number; bill: number; due: number }>;
  last_3_months: Array<{ month: string; bill: number; collection: number; bill_count: number; collection_count: number; bill_client_count: number; collection_client_count: number }>;
};

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { year?: number | string } | null) => {
    const raw = data?.year;
    const parsed = typeof raw === "number" ? raw : raw != null ? Number(raw) : NaN;
    return {
      year: Number.isFinite(parsed) && parsed > 1900 ? Math.trunc(parsed) : new Date().getFullYear(),
    };
  })
  .handler(async ({ context, data }): Promise<DashboardStats> => {
    const { userId } = context;
    const admin = await isAdmin(userId);
    const selectedYear = data.year;
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    // ---- Scope customers ----
    let custQ = supabaseAdmin
      .from("customers")
      .select("id, name, company_name, opening_balance_amount, opening_balance_type, is_active, created_at, disabled_at");
    if (!admin) {
      const ids = await assignedCustomerIds(userId);
      if (ids.length === 0) {
        return {
          managers: { total: 0, active: 0, inactive: 0, new_this_month: 0, inactive_this_month: 0 },
          clients: { total: 0, active: 0, inactive: 0, new_this_month: 0, inactive_this_month: 0 },
          finance: {
            selected_year: selectedYear,
            opening_due: 0, year_bills: 0, year_collections: 0, year_discount: 0, closing_due: 0,
            total_bill: 0, total_collection: 0, total_due: 0, total_discount: 0,
            last_year_closing: 0, last_year_label: String(selectedYear),
          },
          top_collection: [],
          top_due: [],
          monthly: [],
          last_3_months: [],
        };
      }
      custQ = custQ.in("id", ids);
    }
    const { data: customersRaw, error: cErr } = await custQ;
    if (cErr) throw new Error(cErr.message);
    const customers = (customersRaw ?? []) as Array<CustomerLite & {
      is_active: boolean;
      created_at: string;
      disabled_at: string | null;
    }>;
    const custIds = customers.map((c) => c.id);
    const custName = new Map(customers.map((c) => [c.id, c.company_name || c.name || "—"]));

    // ---- Managers (admin only) ----
    let managersTotals = { total: 0, active: 0, inactive: 0, new_this_month: 0, inactive_this_month: 0 };
    if (admin) {
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");
      const mgrIds = (roleRows ?? []).map((r: { user_id: string }) => r.user_id);
      if (mgrIds.length > 0) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, is_active, created_at, updated_at")
          .in("id", mgrIds);
        const list = (profs ?? []) as Array<{ id: string; is_active: boolean; created_at: string; updated_at: string }>;
        managersTotals = {
          total: list.length,
          active: list.filter((p) => p.is_active).length,
          inactive: list.filter((p) => !p.is_active).length,
          new_this_month: list.filter((p) => {
            const d = new Date(p.created_at);
            return d.getFullYear() === currYear && d.getMonth() === currMonth;
          }).length,
          inactive_this_month: list.filter((p) => {
            if (p.is_active) return false;
            const d = new Date(p.updated_at);
            return d.getFullYear() === currYear && d.getMonth() === currMonth;
          }).length,
        };
      }
    }

    // ---- Year-scoped bills + collections (for charts & discount) ----
    const yStart = `${selectedYear}-01-01`;
    const yEnd = `${selectedYear}-12-31`;
    const [billsRes, collRes] = await Promise.all([
      custIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabaseAdmin
            .from("bills")
            .select("customer_id, grand_total, discount_amount, bill_date, status")
            .in("customer_id", custIds)
            .gte("bill_date", yStart)
            .lte("bill_date", yEnd)
            .neq("status", "CANCELLED"),
      custIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabaseAdmin
            .from("collections")
            .select("customer_id, amount, collection_date, status")
            .in("customer_id", custIds)
            .gte("collection_date", yStart)
            .lte("collection_date", yEnd)
            .eq("status", "ACTIVE"),
    ]);
    if (billsRes.error) throw new Error(billsRes.error.message);
    if (collRes.error) throw new Error(collRes.error.message);
    const billsY = (billsRes.data ?? []) as Array<{
      customer_id: string; grand_total: number | null; discount_amount: number | null; bill_date: string;
    }>;
    const collsY = (collRes.data ?? []) as Array<{
      customer_id: string; amount: number | null; collection_date: string;
    }>;

    // ---- Year balances (uses snapshot table; falls back to live compute) ----
    const balances = await computeYearBalances(selectedYear, customers);

    let opening_due = 0;
    let year_bills = 0;
    let year_collections = 0;
    let closing_due = 0;
    const dueRows: Array<{ customer_id: string; name: string; amount: number }> = [];
    const collRows: Array<{ customer_id: string; name: string; amount: number }> = [];
    for (const c of customers) {
      const bal = balances.get(c.id) || { opening: 0, bills: 0, collections: 0, closing: 0 };
      opening_due += bal.opening;
      year_bills += bal.bills;
      year_collections += bal.collections;
      closing_due += bal.closing;
      collRows.push({ customer_id: c.id, name: custName.get(c.id) || "—", amount: r2(bal.collections) });
      dueRows.push({ customer_id: c.id, name: custName.get(c.id) || "—", amount: r2(Math.max(0, bal.closing)) });
    }
    opening_due = r2(opening_due);
    year_bills = r2(year_bills);
    year_collections = r2(year_collections);
    closing_due = r2(closing_due);

    const year_discount = r2(billsY.reduce((s, b) => s + Number(b.discount_amount || 0), 0));

    const top_collection = collRows
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const top_due = dueRows
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // ---- Monthly trend (12 months of selected year) ----
    const months: string[] = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`${selectedYear}-${String(m).padStart(2, "0")}`);
    }
    const billMonth = new Map<string, number>();
    const collMonth = new Map<string, number>();
    for (const b of billsY) {
      const k = (b.bill_date || "").slice(0, 7);
      if (k) billMonth.set(k, (billMonth.get(k) || 0) + Number(b.grand_total || 0));
    }
    for (const c of collsY) {
      const k = (c.collection_date || "").slice(0, 7);
      if (k) collMonth.set(k, (collMonth.get(k) || 0) + Number(c.amount || 0));
    }
    const monthly = months.map((m) => {
      const bill = r2(billMonth.get(m) || 0);
      const collection = r2(collMonth.get(m) || 0);
      const due = r2(Math.max(0, bill - collection));
      return { month: m, bill, collection, due };
    });

    const clients = {
      total: customers.length,
      active: customers.filter((c) => c.is_active).length,
      inactive: customers.filter((c) => !c.is_active).length,
      new_this_month: customers.filter((c) => {
        const d = new Date(c.created_at);
        return d.getFullYear() === currYear && d.getMonth() === currMonth;
      }).length,
      inactive_this_month: customers.filter((c) => {
        if (!c.disabled_at) return false;
        const d = new Date(c.disabled_at);
        return d.getFullYear() === currYear && d.getMonth() === currMonth;
      }).length,
    };

    return {
      managers: managersTotals,
      clients,
      finance: {
        selected_year: selectedYear,
        opening_due,
        year_bills,
        year_collections,
        year_discount,
        closing_due,
        // legacy compatibility
        total_bill: year_bills,
        total_collection: year_collections,
        total_due: closing_due,
        total_discount: year_discount,
        last_year_closing: opening_due,
        last_year_label: String(selectedYear - 1),
      },
      top_collection,
      top_due,
      monthly,
      last_3_months: await (async () => {
        const keys: string[] = [];
        const base = new Date(currYear, currMonth, 1);
        for (let i = 11; i >= 0; i--) {
          const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
          keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        const first = new Date(keys[0] + "-01");
        const lastKey = keys[keys.length - 1];
        const lastDate = new Date(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)), 0);
        const startStr = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
        const endStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
        const bMap = new Map<string, number>();
        const cMap = new Map<string, number>();
        const bCount = new Map<string, number>();
        const cCount = new Map<string, number>();
        const bClients = new Map<string, Set<string>>();
        const cClients = new Map<string, Set<string>>();
        const activeIds = new Set(customers.filter((c) => c.is_active).map((c) => c.id));
        if (custIds.length > 0) {
          const [bRes, cRes] = await Promise.all([
            supabaseAdmin
              .from("bills")
              .select("bill_date, grand_total, customer_id")
              .in("customer_id", custIds)
              .gte("bill_date", startStr)
              .lte("bill_date", endStr)
              .neq("status", "CANCELLED"),
            supabaseAdmin
              .from("collections")
              .select("collection_date, amount, customer_id")
              .in("customer_id", custIds)
              .gte("collection_date", startStr)
              .lte("collection_date", endStr)
              .eq("status", "ACTIVE"),
          ]);
          for (const b of (bRes.data ?? []) as Array<{ bill_date: string; grand_total: number | null; customer_id: string }>) {
            const k = (b.bill_date || "").slice(0, 7);
            if (k) {
              bMap.set(k, (bMap.get(k) || 0) + Number(b.grand_total || 0));
              bCount.set(k, (bCount.get(k) || 0) + 1);
              if (activeIds.has(b.customer_id)) {
                if (!bClients.has(k)) bClients.set(k, new Set());
                bClients.get(k)!.add(b.customer_id);
              }
            }
          }
          for (const c of (cRes.data ?? []) as Array<{ collection_date: string; amount: number | null; customer_id: string }>) {
            const k = (c.collection_date || "").slice(0, 7);
            if (k) {
              cMap.set(k, (cMap.get(k) || 0) + Number(c.amount || 0));
              cCount.set(k, (cCount.get(k) || 0) + 1);
              if (activeIds.has(c.customer_id)) {
                if (!cClients.has(k)) cClients.set(k, new Set());
                cClients.get(k)!.add(c.customer_id);
              }
            }
          }
        }
        return keys.map((k) => ({
          month: k,
          bill: r2(bMap.get(k) || 0),
          collection: r2(cMap.get(k) || 0),
          bill_count: bCount.get(k) || 0,
          collection_count: cCount.get(k) || 0,
          bill_client_count: bClients.get(k)?.size || 0,
          collection_client_count: cClients.get(k)?.size || 0,
        }));
      })(),
    };
  });

/**
 * Lightweight server fn: returns only Managers + Clients counts.
 * Used by the dashboard so the user-overview cards render fast,
 * independent of the heavy finance/balances queries.
 */
export const getDashboardUserCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    const emptyGroup = { total: 0, active: 0, inactive: 0, new_this_month: 0, inactive_this_month: 0 };

    // Customers scoped to role
    let custQ = supabaseAdmin
      .from("customers")
      .select("id, is_active, created_at, disabled_at");
    if (!admin) {
      const ids = await assignedCustomerIds(userId);
      if (ids.length === 0) {
        return { managers: { ...emptyGroup }, clients: { ...emptyGroup } };
      }
      custQ = custQ.in("id", ids);
    }

    // Managers (admin only) — fetch in parallel with customers
    const mgrPromise = (async () => {
      if (!admin) return { ...emptyGroup };
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");
      const mgrIds = (roleRows ?? []).map((r: { user_id: string }) => r.user_id);
      if (mgrIds.length === 0) return { ...emptyGroup };
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, is_active, created_at, updated_at")
        .in("id", mgrIds);
      const list = (profs ?? []) as Array<{ id: string; is_active: boolean; created_at: string; updated_at: string }>;
      return {
        total: list.length,
        active: list.filter((p) => p.is_active).length,
        inactive: list.filter((p) => !p.is_active).length,
        new_this_month: list.filter((p) => {
          const d = new Date(p.created_at);
          return d.getFullYear() === currYear && d.getMonth() === currMonth;
        }).length,
        inactive_this_month: list.filter((p) => {
          if (p.is_active) return false;
          const d = new Date(p.updated_at);
          return d.getFullYear() === currYear && d.getMonth() === currMonth;
        }).length,
      };
    })();

    const [{ data: customersRaw, error: cErr }, managers] = await Promise.all([custQ, mgrPromise]);
    if (cErr) throw new Error(cErr.message);
    const customers = (customersRaw ?? []) as Array<{
      id: string; is_active: boolean; created_at: string; disabled_at: string | null;
    }>;

    const clients = {
      total: customers.length,
      active: customers.filter((c) => c.is_active).length,
      inactive: customers.filter((c) => !c.is_active).length,
      new_this_month: customers.filter((c) => {
        const d = new Date(c.created_at);
        return d.getFullYear() === currYear && d.getMonth() === currMonth;
      }).length,
      inactive_this_month: customers.filter((c) => {
        if (!c.disabled_at) return false;
        const d = new Date(c.disabled_at);
        return d.getFullYear() === currYear && d.getMonth() === currMonth;
      }).length,
    };

    return { managers, clients };
  });



/**
 * Admin-only: persist year-end snapshot rows into customer_yearly_balances for the given year.
 * Computes opening from previous year's snapshot (or from customers.opening_balance_amount fallback),
 * sums bills & collections within the year, writes closing = opening + bills − collections.
 */
export const closeYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { year: number }) => ({ year: Number(data.year) }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!(await isAdmin(userId))) {
      throw new Error("Only admin can close the year");
    }
    const year = data.year;
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new Error("Invalid year");
    }

    const { data: customersRaw, error: cErr } = await supabaseAdmin
      .from("customers")
      .select("id, name, company_name, opening_balance_amount, opening_balance_type");
    if (cErr) throw new Error(cErr.message);
    const customers = (customersRaw ?? []) as CustomerLite[];

    const balances = await computeYearBalances(year, customers);
    const rows = customers.map((c) => {
      const b = balances.get(c.id) || { opening: 0, bills: 0, collections: 0, closing: 0 };
      return {
        customer_id: c.id,
        year,
        opening_due: r2(b.opening),
        total_bills: r2(b.bills),
        total_collections: r2(b.collections),
        closing_due: r2(b.closing),
        closed_at: new Date().toISOString(),
        closed_by: userId,
      };
    });

    if (rows.length === 0) return { ok: true, count: 0 };

    const { error: upErr } = await supabaseAdmin
      .from("customer_yearly_balances")
      .upsert(rows, { onConflict: "customer_id,year" });
    if (upErr) throw new Error(upErr.message);

    return { ok: true, count: rows.length, year };
  });

export type TableSize = { table_name: string; size_bytes: number; row_count: number };
export type StorageFile = { name: string; bucket_id: string; size_bytes: number; updated_at: string | null };
export type SizeDetails = {
  bytes: number;
  db_bytes: number;
  storage_bytes: number;
  tables: TableSize[];
  files: StorageFile[];
};

/**
 * Admin-only: returns database, storage size + per-table and per-file breakdown.
 */
export const getDatabaseSize = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SizeDetails> => {
    const { userId } = context;
    if (!(await isAdmin(userId))) {
      throw new Error("Only admin can view database size");
    }
    const [dbRes, stRes, tblRes, fileRes] = await Promise.all([
      supabaseAdmin.rpc("get_db_size"),
      supabaseAdmin.rpc("get_storage_size"),
      supabaseAdmin.rpc("get_table_sizes"),
      supabaseAdmin.rpc("get_storage_files"),
    ]);
    if (dbRes.error) {
      console.error("[getDatabaseSize:db]", dbRes.error);
      throw new Error("Failed to read database size");
    }
    if (stRes.error) console.error("[getDatabaseSize:storage]", stRes.error);
    if (tblRes.error) console.error("[getDatabaseSize:tables]", tblRes.error);
    if (fileRes.error) console.error("[getDatabaseSize:files]", fileRes.error);

    const db_bytes = Number(dbRes.data ?? 0);
    const storage_bytes = Number(stRes.data ?? 0);
    const tables: TableSize[] = (tblRes.data ?? []).map((r: any) => ({
      table_name: String(r.table_name),
      size_bytes: Number(r.size_bytes ?? 0),
      row_count: Number(r.row_count ?? 0),
    }));
    const files: StorageFile[] = (fileRes.data ?? []).map((r: any) => ({
      name: String(r.name),
      bucket_id: String(r.bucket_id),
      size_bytes: Number(r.size_bytes ?? 0),
      updated_at: r.updated_at ?? null,
    }));
    return { bytes: db_bytes + storage_bytes, db_bytes, storage_bytes, tables, files };
  });

export type OnlineUser = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: "admin" | "manager" | null;
  last_sign_in_at: string | null;
};

/**
 * Admin-only: returns users considered "online" — those whose last sign-in
 * falls within the configured session timeout window (default 30 min).
 */
export const getOnlineUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number; users: OnlineUser[]; window_minutes: number }> => {
    const { userId } = context;
    if (!(await isAdmin(userId))) {
      return { count: 0, users: [], window_minutes: 30 };
    }

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("session_timeout_minutes")
      .limit(1)
      .maybeSingle();
    const windowMin = Math.max(1, Number(settings?.session_timeout_minutes ?? 30));
    const cutoff = Date.now() - windowMin * 60 * 1000;

    // Page through auth users (admin API)
    const all: Array<{ id: string; email?: string | null; last_sign_in_at?: string | null }> = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        all.push({ id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at });
      }
      if (users.length < 200) break;
    }

    const online = all.filter((u) => {
      if (!u.last_sign_in_at) return false;
      return new Date(u.last_sign_in_at).getTime() >= cutoff;
    });
    if (online.length === 0) return { count: 0, users: [], window_minutes: windowMin };

    const ids = online.map((u) => u.id);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, username, email, is_active").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role as "admin" | "manager"]));

    const users: OnlineUser[] = online
      .map((u) => {
        const p = profMap.get(u.id) as { name?: string; username?: string; email?: string; is_active?: boolean } | undefined;
        if (p && p.is_active === false) return null;
        return {
          id: u.id,
          name: p?.name || p?.username || u.email || "—",
          username: p?.username ?? null,
          email: p?.email ?? u.email ?? null,
          role: roleMap.get(u.id) ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      })
      .filter((x): x is OnlineUser => x !== null)
      .sort((a, b) => (b.last_sign_in_at || "").localeCompare(a.last_sign_in_at || ""));

    return { count: users.length, users, window_minutes: windowMin };
  });

// Dynamically enumerate every base table in the public schema so backups
// always cover all tables — including any added in the future.
async function listPublicTables(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("get_table_sizes");
  if (error) throw new Error(`Failed to list tables: ${error.message}`);
  const names = ((data ?? []) as Array<{ table_name: string }>)
    .map((r) => r.table_name)
    .sort();
  if (names.length === 0) throw new Error("No tables found to back up");
  return names;
}

export const exportDatabaseBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    if (!(await isAdmin(userId))) throw new Error("Forbidden: admin only");

    const tables = await listPublicTables();
    const dump: Record<string, any[]> = {};
    for (const table of tables as string[]) {
      const client = supabaseAdmin.from(table as never) as any;
      const rows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      // paginate to avoid hitting row limits / memory spikes
      for (;;) {
        const { data, error } = await client
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`Failed to export ${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      dump[table] = rows;
    }

    return {
      exported_at: new Date().toISOString(),
      table_count: tables.length,
      tables: dump,
    };
  });

const ImportSchema = z.object({ tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))) });

export const importDatabaseBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden: admin only");
    const result: Record<string, number> = {};
    // Accept any table present in the backup file, as long as it exists
    // in the public schema — so future tables restore without code changes.
    const publicTables = new Set(await listPublicTables());
    for (const table of Object.keys(data.tables)) {
      if (!publicTables.has(table)) {
        throw new Error(`Unknown table in backup file: ${table}`);
      }
      const rows = data.tables[table];
      if (!rows || rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        // Restore through the security-definer function so business-guard
        // triggers (e.g. immutability rules) don't block same-value restores.
        const { error } = await supabaseAdmin.rpc("restore_backup_chunk", {
          p_table: table,
          p_rows: chunk,
        });
        if (error) throw new Error(`Failed to import ${table}: ${error.message}`);
      }
      result[table] = rows.length;
    }
    return { imported: result };
  });

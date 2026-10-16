import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Whitelist of safe error messages we are willing to surface to the client.
 * Anything else (DB internals, RLS error codes, network stack) is logged
 * server-side and replaced with a generic message to avoid info leakage.
 */
const SAFE_MESSAGES = new Set([
  "Not authorized for this customer",
  "Only admins can view reference statements",
  "Customer not found",
  "Reference not found",
]);

function toSafeError(err: unknown, fallback: string): Error {
  console.error("[ledger.functions]", err);
  const msg = err instanceof Error ? err.message : String(err);
  if (SAFE_MESSAGES.has(msg)) return new Error(msg);
  return new Error(fallback);
}

async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function isCustomerAllowed(userId: string, customerId: string) {
  if (await isAdmin(userId)) return true;
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("customer_id")
    .eq("manager_id", userId)
    .eq("customer_id", customerId)
    .maybeSingle();
  return !!data;
}

export const searchLedgerCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = data.q.replace(/[%,]/g, "");
    const { userId } = context;
    const admin = await isAdmin(userId);

    let q = supabaseAdmin
      .from("customers")
      .select(
        "id, company_name, name, bin_number, mobile, is_active, area:areas(area_name)",
      )
      .or(
        `company_name.ilike.%${s}%,bin_number.ilike.%${s}%,mobile.ilike.%${s}%,name.ilike.%${s}%`,
      )
      .limit(15);

    if (!admin) {
      const { data: rows } = await supabaseAdmin
        .from("customer_managers")
        .select("customer_id")
        .eq("manager_id", userId);
      const ids = (rows ?? []).map((r: any) => r.customer_id);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }
    const { data: list, error } = await q;
    if (error) throw new Error(error.message);
    return list ?? [];
  });

export const getCustomerLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customer_id: z.string().uuid(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
    const { userId } = context;
    if (!(await isCustomerAllowed(userId, data.customer_id))) {
      throw new Error("Not authorized for this customer");
    }

    const { data: cust, error: cErr } = await supabaseAdmin
      .from("customers")
      .select(
        "id, name, company_name, bin_number, mobile, address, opening_balance_amount, opening_balance_type, is_active, area:areas(area_name), ref:references(reference_name)",
      )
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cust) throw new Error("Customer not found");

    const [billsRes, collRes] = await Promise.all([
      supabaseAdmin
        .from("bills")
        .select("id, bill_no, bill_date, subtotal, discount_amount, grand_total, billing_month")
        .eq("customer_id", data.customer_id)
        .eq("status", "FINALIZED")
        .order("bill_date", { ascending: true }),
      supabaseAdmin
        .from("collections")
        .select("id, receipt_no, collection_date, amount, payment_method, reference_no, notes")
        .eq("customer_id", data.customer_id)
        .eq("status", "ACTIVE")
        .order("collection_date", { ascending: true }),
    ]);
    if (billsRes.error) throw new Error(billsRes.error.message);
    if (collRes.error) throw new Error(collRes.error.message);

    const allBills = (billsRes.data ?? []) as any[];
    const allColl = (collRes.data ?? []) as any[];

    type Entry = {
      date: string;
      type: "OPENING" | "BILL" | "COLLECTION";
      ref_no: string;
      description: string;
      debit: number; // charges (increase due)
      credit: number; // payments / discounts (decrease due)
      balance: number; // running, positive=ADVANCE, negative=DUE
    };

    const openingStatic = Number(cust.opening_balance_amount || 0);

    // Build full chronological entries to compute running balance.
    const all: Entry[] = [];
    for (const b of allBills) {
      all.push({
        date: String(b.bill_date),
        type: "BILL",
        ref_no: b.bill_no,
        description: b.billing_month ? `Bill (${String(b.billing_month).slice(0, 7)})` : "Bill",
        debit: r2(Number(b.subtotal || 0)),
        credit: r2(Number(b.discount_amount || 0)),
        balance: 0,
      });
    }
    for (const c of allColl) {
      all.push({
        date: String(c.collection_date),
        type: "COLLECTION",
        ref_no: c.receipt_no,
        description: `Collection (${c.payment_method}${c.reference_no ? ` • ${c.reference_no}` : ""})`,
        debit: 0,
        credit: r2(Number(c.amount || 0)),
        balance: 0,
      });
    }
    // Sort by date asc, then collections after bills on same date
    all.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type === b.type) return 0;
      return a.type === "BILL" ? -1 : 1;
    });

    let bal = openingStatic;
    for (const e of all) {
      bal += e.credit - e.debit;
      e.balance = r2(bal);
    }

    // Compute opening as of `from` (sum before from-date)
    let openingAsOf = openingStatic;
    const fromDate = data.from || "";
    const toDate = data.to || "";

    const before: Entry[] = [];
    const within: Entry[] = [];
    for (const e of all) {
      if (fromDate && e.date < fromDate) before.push(e);
      else if (toDate && e.date > toDate) {
        /* after — skip */
      } else within.push(e);
    }
    for (const e of before) openingAsOf += e.credit - e.debit;
    openingAsOf = r2(openingAsOf);

    // Recompute running balance within window starting from openingAsOf
    let rb = openingAsOf;
    const rows: Entry[] = within.map((e) => {
      rb += e.credit - e.debit;
      return { ...e, balance: r2(rb) };
    });

    const totalDebit = r2(rows.reduce((s, e) => s + e.debit, 0));
    const totalCredit = r2(rows.reduce((s, e) => s + e.credit, 0));
    const closing = r2(openingAsOf + totalCredit - totalDebit);

    return {
      customer: {
        id: cust.id,
        name: cust.company_name || cust.name,
        contact_name: cust.name,
        bin_number: cust.bin_number,
        mobile: cust.mobile,
        address: cust.address,
        area_name: (cust as any).area?.area_name ?? "",
        reference_name: (cust as any).ref?.reference_name ?? "",
        is_active: cust.is_active,
      },
      opening_balance: openingAsOf,
      rows,
      totals: { debit: totalDebit, credit: totalCredit },
      closing_balance: closing,
      static_opening: r2(openingStatic),
    };
    } catch (err) {
      throw toSafeError(err, "Failed to load customer ledger");
    }
  });

export const getStatementCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("company_settings")
      .select(
        "company_name, address, phone, email, website, logo_url, bin_number, vat_registration_no, trade_license_no, bank_name, bank_account_number, bank_branch, print_signature_url, print_signature_label, print_signature_line, invoice_footer_text",
      )
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

export const searchReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) {
      throw new Error("Forbidden: admin only");
    }
    const s = data.q.replace(/[%,]/g, "");
    const { data: list, error } = await supabaseAdmin
      .from("references")
      .select("id, reference_name, mobile_number, whatsapp_number, is_active")
      .eq("is_active", true)
      .or(
        `reference_name.ilike.%${s}%,mobile_number.ilike.%${s}%,whatsapp_number.ilike.%${s}%`,
      )
      .order("reference_name", { ascending: true })
      .limit(15);
    if (error) throw new Error(error.message);
    return list ?? [];
  });

export const getReferenceStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reference_id: z.string().uuid(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
    const { userId } = context;
    if (!(await isAdmin(userId))) {
      throw new Error("Only admins can view reference statements");
    }

    const { data: ref, error: rErr } = await supabaseAdmin
      .from("references")
      .select("id, reference_name, mobile_number, whatsapp_number")
      .eq("id", data.reference_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!ref) throw new Error("Reference not found");

    const { data: custs, error: cErr } = await supabaseAdmin
      .from("customers")
      .select("id, opening_balance_amount")
      .eq("reference_id", data.reference_id);
    if (cErr) throw new Error(cErr.message);

    const ids = (custs ?? []).map((c: any) => c.id);
    const staticOpening = r2(
      (custs ?? []).reduce(
        (s: number, c: any) => s + Number(c.opening_balance_amount || 0),
        0,
      ),
    );

    if (ids.length === 0) {
      return {
        reference: {
          id: ref.id,
          name: ref.reference_name,
          mobile_number: ref.mobile_number ?? "",
          whatsapp_number: ref.whatsapp_number ?? "",
          customer_count: 0,
        },
        opening_balance: 0,
        totals: { debit: 0, credit: 0 },
        closing_balance: 0,
        rows: [],
      };
    }

    const [billsRes, collRes] = await Promise.all([
      supabaseAdmin
        .from("bills")
        .select("bill_date, billing_month, subtotal, discount_amount")
        .in("customer_id", ids)
        .eq("status", "FINALIZED"),
      supabaseAdmin
        .from("collections")
        .select("collection_date, amount")
        .in("customer_id", ids)
        .eq("status", "ACTIVE"),
    ]);
    if (billsRes.error) throw new Error(billsRes.error.message);
    if (collRes.error) throw new Error(collRes.error.message);

    const fromDate = data.from || "";
    const toDate = data.to || "";

    let beforeDebit = 0;
    let beforeCredit = 0;

    const monthly = new Map<string, { debit: number; credit: number }>();
    const bump = (key: string, deb: number, cre: number) => {
      const cur = monthly.get(key) ?? { debit: 0, credit: 0 };
      cur.debit += deb;
      cur.credit += cre;
      monthly.set(key, cur);
    };

    for (const b of billsRes.data ?? []) {
      const bm = String((b as any).billing_month || (b as any).bill_date);
      const bmKey = bm.slice(0, 7); // YYYY-MM
      const deb = r2(Number((b as any).subtotal || 0));
      const cre = r2(Number((b as any).discount_amount || 0));
      // Use billing_month for window filtering so it matches the grouping key.
      // Compare YYYY-MM against the from/to month prefix to stay consistent.
      const fromKey = fromDate ? fromDate.slice(0, 7) : "";
      const toKey = toDate ? toDate.slice(0, 7) : "";
      if (fromKey && bmKey < fromKey) {
        beforeDebit += deb;
        beforeCredit += cre;
      } else if (toKey && bmKey > toKey) {
        /* skip */
      } else {
        bump(bmKey, deb, cre);
      }
    }
    for (const c of collRes.data ?? []) {
      const d = String((c as any).collection_date);
      const cre = r2(Number((c as any).amount || 0));
      if (fromDate && d < fromDate) {
        beforeCredit += cre;
      } else if (toDate && d > toDate) {
        /* skip */
      } else {
        bump(d.slice(0, 7), 0, cre);
      }
    }

    const opening = r2(staticOpening + beforeCredit - beforeDebit);

    const months = Array.from(monthly.keys()).sort();
    let running = opening;
    let winDebit = 0;
    let winCredit = 0;
    const rows = months.map((m) => {
      const agg = monthly.get(m)!;
      const deb = r2(agg.debit);
      const cre = r2(agg.credit);
      running = r2(running + cre - deb);
      winDebit += deb;
      winCredit += cre;
      return { month: m, debit: deb, credit: cre, balance: running };
    });

    const totalDebit = r2(winDebit);
    const totalCredit = r2(winCredit);
    const closing = r2(opening + totalCredit - totalDebit);

    return {
      reference: {
        id: ref.id,
        name: ref.reference_name,
        mobile_number: ref.mobile_number ?? "",
        whatsapp_number: ref.whatsapp_number ?? "",
        customer_count: ids.length,
      },
      opening_balance: opening,
      totals: { debit: totalDebit, credit: totalCredit },
      closing_balance: closing,
      rows,
    };
    } catch (err) {
      throw toSafeError(err, "Failed to load reference statement");
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { autoSendBillSms } from "./whatsapp.functions";
import { materializeManagerEarnings } from "./payroll.functions";

// Best-effort SMS send on finalize. Never throws.
async function autoSendWhatsAppIfEnabled(billId: string, userId: string | null) {
  await autoSendBillSms(billId, userId);
}

// Best-effort manager-earnings materialization. Never throws.
async function autoCreateManagerEarnings(billId: string) {
  try {
    await materializeManagerEarnings(billId);
  } catch (e) {
    console.warn("[payroll] failed to materialize earnings for bill", billId, e);
  }
}


// Round to 2 decimals to avoid floating-point precision errors in totals.
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;



// ---------- helpers ----------
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

async function getCustomerTypeId(customerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("customer_type_id")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.customer_type_id ?? null;
}

async function getLatestRate(serviceItemId: string, asOf: string, customerTypeId: string | null) {
  // Use Importer ID as the primary fallback if no type provided
  const targetType = customerTypeId || 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54';
  
  const { data, error } = await supabaseAdmin
    .from("service_rates")
    .select("regular_rate, minimum_charge, effective_from")
    .eq("service_item_id", serviceItemId)
    .eq("customer_type_id", targetType)
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  
  if (data) return data;

  // Final safety fallback to any rate for this item if targetType specific rate not found
  const { data: fallback, error: fErr } = await supabaseAdmin
    .from("service_rates")
    .select("regular_rate, minimum_charge, effective_from")
    .eq("service_item_id", serviceItemId)
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  return fallback;
}

// Batched: fetch all rates for the given items in one query, then resolve
// best match per item (specific customer type -> Importer fallback -> any).
async function computeBillLinesBatched(
  items: { service_item_id: string; qty: number }[],
  asOf: string,
  customerTypeId: string | null,
) {
  const targetType = customerTypeId || 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54';
  const serviceItemIds = items.map((i) => i.service_item_id);
  const { data: allRates, error } = await supabaseAdmin
    .from("service_rates")
    .select("service_item_id, regular_rate, minimum_charge, effective_from, customer_type_id")
    .in("service_item_id", serviceItemIds)
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);

  const ratesByItem = new Map<string, any[]>();
  for (const r of allRates || []) {
    if (!ratesByItem.has(r.service_item_id)) ratesByItem.set(r.service_item_id, []);
    ratesByItem.get(r.service_item_id)!.push(r);
  }

  return items.map((it) => {
    const itemRates = ratesByItem.get(it.service_item_id) || [];
    let rate = itemRates.find((r) => r.customer_type_id === targetType);
    if (!rate && targetType !== 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54') {
      rate = itemRates.find((r) => r.customer_type_id === 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54');
    }
    if (!rate) rate = itemRates[0];
    if (!rate) throw new Error("No active rate found for one of the service items");
    const rateVal = r2(Number(rate.regular_rate || 0));
    const minVal = r2(Number(rate.minimum_charge || 0));
    const qty = r2(it.qty);
    const calc = r2(qty * rateVal);
    const final = r2(Math.max(calc, minVal));
    return {
      service_item_id: it.service_item_id,
      qty,
      rate_used: rateVal,
      minimum_charge_used: minVal,
      calculated_amount: calc,
      final_amount: final,
    };
  });
}

// Customer running balance. Positive = ADVANCE, Negative = DUE.
// Computed from scratch: opening_balance + Σ(finalized bills: discount - subtotal)
//                                          + Σ(active collections: amount)
// `excludeBillId` skips a bill being edited so its own values aren't double-counted.
async function getRunningBalance(customerId: string, excludeBillId?: string, excludeCollectionId?: string) {
  // Use a single RPC call to compute balance on the server side if possible, 
  // or use promise.all for these independent queries.
  let billsQuery = supabaseAdmin
    .from("bills")
    .select("id, subtotal, discount_amount")
    .eq("customer_id", customerId)
    .eq("status", "FINALIZED");
  if (excludeBillId) billsQuery = billsQuery.neq("id", excludeBillId);

  let collsQuery = supabaseAdmin
    .from("collections")
    .select("id, amount")
    .eq("customer_id", customerId)
    .eq("status", "ACTIVE");
  if (excludeCollectionId) collsQuery = collsQuery.neq("id", excludeCollectionId);

  const [custRes, billsRes, collsRes] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("opening_balance_amount, is_active, enabled_month")
      .eq("id", customerId)
      .maybeSingle(),
    billsQuery,
    collsQuery,
  ]);

  if (custRes.error) throw new Error(custRes.error.message);
  if (!custRes.data) throw new Error("Customer not found");
  if (billsRes.error) throw new Error(billsRes.error.message);
  if (collsRes.error) throw new Error(collsRes.error.message);

  let balance = Number(custRes.data.opening_balance_amount || 0);
  for (const b of billsRes.data ?? []) {
    balance += Number(b.discount_amount || 0) - Number(b.subtotal || 0);
  }
  for (const c of collsRes.data ?? []) {
    balance += Number(c.amount || 0);
  }
  return { balance, customer: custRes.data };
}


async function generateBillNo(): Promise<string> {
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("id, invoice_prefix, starting_invoice_number, last_invoice_number, last_invoice_year")
    .limit(1)
    .maybeSingle();
  if (!settings) throw new Error("Company settings not configured");

  const prefix = settings.invoice_prefix || "INV-";
  const startFrom = Number(settings.starting_invoice_number || 1);
  const year = new Date().getFullYear();

  // Persistent counter — never reuses a number even after deletes.
  // Resets to starting_invoice_number when the year changes.
  const sameYear = (settings as { last_invoice_year: number | null }).last_invoice_year === year;
  const base = sameYear
    ? Number((settings as { last_invoice_number: number | null }).last_invoice_number || 0)
    : Math.max(0, startFrom - 1);
  const next = base + 1;

  const { error: uErr } = await supabaseAdmin
    .from("company_settings")
    .update({ last_invoice_number: next, last_invoice_year: year })
    .eq("id", settings.id);
  if (uErr) throw new Error(uErr.message);

  return `${prefix}${String(next).padStart(6, "0")}/${year}`;
}

// ---------- schemas ----------
const billItemInput = z.object({
  service_item_id: z.string().uuid(),
  qty: z.number({ invalid_type_error: "Quantity must be a number" })
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity is too large")
    .refine((v) => Number.isFinite(v), "Quantity must be a finite number"),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((s) => !Number.isNaN(new Date(s + "T00:00:00Z").getTime()), "Invalid date");

const billCoreInput = z.object({
  customer_id: z.string().uuid(),
  bill_date: isoDate.refine((s) => {
    // Must not be in the future (allow today)
    const d = new Date(s + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    return d.getTime() <= today.getTime();
  }, "Bill date cannot be in the future"),
  billing_month: isoDate.refine((s) => s.endsWith("-01"), "Billing month must be the first day of the month (YYYY-MM-01)"),
  discount_amount: z.number().min(0).max(99999999).default(0),
  status: z.enum(["DRAFT", "FINALIZED"]).default("DRAFT"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  items: z.array(billItemInput).min(1, "At least one item required").max(200, "Too many items"),
});

// ---------- public helpers ----------
export const searchCustomersForBill = createServerFn({ method: "POST" })
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
        "id, company_name, name, bin_number, mobile, is_active, enabled_month, opening_balance_amount, area:areas(area_name), ref:references(reference_name), customer_type:customer_types(type_name)",
      )
      .or(`company_name.ilike.%${s}%,bin_number.ilike.%${s}%,mobile.ilike.%${s}%`)
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

export const getCustomerForBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCustomerAccess(context.userId, data.id);
    const [custRes, balRes] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select(
          "id, company_name, name, bin_number, mobile, address, is_active, enabled_month, opening_balance_amount, area:areas(area_name), ref:references(reference_name), customer_type:customer_types(type_name)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      getRunningBalance(data.id),
    ]);
    if (custRes.error) throw new Error(custRes.error.message);
    if (!custRes.data) throw new Error("Customer not found");
    return { customer: custRes.data, current_balance: balRes.balance };
  });

export const listServiceItemsForBill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customer_id: z.string().uuid().optional() }).optional().default({}).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    let excludeBooks = false;
    if (data?.customer_id) {
      const { data: cust } = await supabaseAdmin
        .from("customers")
        .select("vat_service_type")
        .eq("id", data.customer_id)
        .maybeSingle();
      if ((cust as any)?.vat_service_type === "ONLY_RETURN") excludeBooks = true;
    }
    let q = supabaseAdmin
      .from("service_items")
      .select("id, item_name")
      .eq("is_active", true)
      .order("item_name");
    if (excludeBooks) q = q.not("item_name", "ilike", "Books Of Accounts Maintenance");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- preview calculation (no DB write) ----------
export const previewBillTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      customer_id: z.string().uuid(),
      bill_date: z.string().min(1),
      discount_amount: z.number().min(0).default(0),
      items: z.array(billItemInput),
      exclude_bill_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCustomerAccess(context.userId, data.customer_id);
    const { balance } = await getRunningBalance(data.customer_id, data.exclude_bill_id);
    const previousDue = balance < 0 ? -balance : 0; // due (positive number)
    const previousAdvance = balance > 0 ? balance : 0;
    const customerTypeId = await getCustomerTypeId(data.customer_id);

    // Fetch all rates for this customer type in one go to avoid N+1 queries
    const targetType = customerTypeId || 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54';
    const serviceItemIds = data.items.map(it => it.service_item_id);
    
    // Efficiently fetch latest rates for all items including possible fallbacks
    // and those for specific customer types in one go.
    const { data: allRates, error } = await supabaseAdmin
      .from("service_rates")
      .select("service_item_id, regular_rate, minimum_charge, effective_from, customer_type_id")
      .in("service_item_id", serviceItemIds)
      .lte("effective_from", data.bill_date)
      .order("effective_from", { ascending: false });

    if (error) throw new Error(error.message);

    // Group rates by service item to find the best match for each
    const ratesByItem = new Map<string, any[]>();
    for (const r of allRates || []) {
      if (!ratesByItem.has(r.service_item_id)) {
        ratesByItem.set(r.service_item_id, []);
      }
      ratesByItem.get(r.service_item_id)!.push(r);
    }

    const lines: Array<{
      service_item_id: string;
      qty: number;
      rate_used: number;
      minimum_charge_used: number;
      calculated_amount: number;
      final_amount: number;
    }> = [];

    for (const it of data.items) {
      const itemRates = ratesByItem.get(it.service_item_id) || [];
      
      // 1. Try to find the latest rate for the specific customer type
      let rate = itemRates.find(r => r.customer_type_id === targetType);
      
      // 2. Fallback to the latest rate for the 'Importer' type if primary failed
      if (!rate && targetType !== 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54') {
        rate = itemRates.find(r => r.customer_type_id === 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54');
      }
      
      // 3. Last resort fallback: use the absolute latest rate for this item (as of bill_date)
      if (!rate) {
        rate = itemRates[0];
      }


      const rateVal = r2(Number(rate?.regular_rate || 0));
      const minVal = r2(Number(rate?.minimum_charge || 0));
      const qty = r2(it.qty);
      const calc = r2(qty * rateVal);
      const final = r2(Math.max(calc, minVal));
      lines.push({
        service_item_id: it.service_item_id,
        qty,
        rate_used: rateVal,
        minimum_charge_used: minVal,
        calculated_amount: calc,
        final_amount: final,
      });
    }

    const subtotal = r2(lines.reduce((s, l) => s + l.final_amount, 0));
    const discount = r2(Math.min(data.discount_amount, subtotal + previousDue));
    const grandTotal = r2(previousDue + subtotal - discount - previousAdvance);
    return {
      previous_balance: r2(balance),
      previous_due: r2(previousDue),
      previous_advance: r2(previousAdvance),
      subtotal,
      discount,
      grand_total: r2(Math.max(0, grandTotal)),
      lines,
    };
  });


// ---------- create ----------
export const createBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => billCoreInput.parse(input))
  .handler(async ({ data, context }) => {
    // Customer validation
    const { data: cust, error: cErr } = await supabaseAdmin
      .from("customers")
      .select("id, is_active, enabled_month, opening_balance_amount")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cust) throw new Error("Customer not found");
    if (!cust.is_active) throw new Error("Disabled customers cannot be billed");

    // NOTE: enabled_month vs billing_month check disabled to allow backdated entries.

    // Manager permission: must be admin OR assigned to customer
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

    // Block duplicate billing month for same customer (any non-cancelled bill)
    {
      const { data: dupMonth } = await supabaseAdmin
        .from("bills")
        .select("bill_no, status")
        .eq("customer_id", data.customer_id)
        .eq("billing_month", data.billing_month)
        .neq("status", "CANCELLED")
        .limit(1);
      if (dupMonth && dupMonth.length > 0) {
        throw new Error(
          `This customer already has a bill (${dupMonth[0].bill_no}) for the selected billing month.`,
        );
      }
    }

    // Require a FINALIZED VAT submission (with submission_id) for this customer + month
    {
      const { data: vat } = await supabaseAdmin
        .from("vat_submissions")
        .select("submission_id")
        .eq("customer_id", data.customer_id)
        .eq("tax_period_date", data.billing_month)
        .eq("status", "FINALIZED")
        .not("submission_id", "is", null)
        .limit(1);
      if (!vat || vat.length === 0) {
        throw new Error(
          "No finalized VAT submission (with Submission ID) found for this customer and billing month. Finalize the VAT submission first.",
        );
      }
    }

    // Block finalization if customer has existing draft bills
    if (data.status === "FINALIZED") {
      const { data: drafts } = await supabaseAdmin
        .from("bills")
        .select("bill_no")
        .eq("customer_id", data.customer_id)
        .eq("status", "DRAFT")
        .limit(1);
      if (drafts && drafts.length > 0) {
        throw new Error(
          `This customer has a draft bill (${drafts[0].bill_no}). Finalize, cancel, or delete it before creating a new finalized bill.`,
        );
      }
    }


    // Compute totals
    const preview = await (async () => {
      const { balance } = await getRunningBalance(data.customer_id);
      const previousDue = balance < 0 ? -balance : 0;
      const previousAdvance = balance > 0 ? balance : 0;
      const customerTypeId = await getCustomerTypeId(data.customer_id);
      const lines = await computeBillLinesBatched(data.items, data.bill_date, customerTypeId);
      const subtotal = r2(lines.reduce((s, l) => s + l.final_amount, 0));
      const discount = r2(Math.min(data.discount_amount, subtotal + previousDue));
      const grandTotal = r2(Math.max(0, previousDue + subtotal - discount - previousAdvance));
      return { balance: r2(balance), subtotal, discount, grandTotal, lines };
    })();


    const billNo = await generateBillNo();
    const { data: bill, error: bErr } = await supabaseAdmin
      .from("bills")
      .insert({
        bill_no: billNo,
        customer_id: data.customer_id,
        bill_date: data.bill_date,
        billing_month: data.billing_month,
        previous_balance: preview.balance,
        subtotal: preview.subtotal,
        discount_amount: preview.discount,
        grand_total: preview.grandTotal,
        status: data.status,
        notes: data.notes || null,
        created_by: context.userId,
        finalized_at: data.status === "FINALIZED" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    const itemRows = preview.lines.map((l, idx) => ({
      bill_id: bill.id,
      service_item_id: l.service_item_id,
      position: idx + 1,
      qty: l.qty,
      rate_used: l.rate_used,
      minimum_charge_used: l.minimum_charge_used,
      calculated_amount: l.calculated_amount,
      final_amount: l.final_amount,
    }));
    const { error: iErr } = await supabaseAdmin.from("bill_items").insert(itemRows);
    if (iErr) {
      await supabaseAdmin.from("bills").delete().eq("id", bill.id);
      throw new Error(iErr.message);
    }

    if (data.status === "FINALIZED") {
      await Promise.all([
        autoSendWhatsAppIfEnabled(bill.id, context.userId).catch((e) => console.warn("[sms] failed", e)),
        autoCreateManagerEarnings(bill.id),
      ]);
    }

    return { id: bill.id, bill_no: billNo };
  });


// ---------- update (latest bill only) ----------
const parseBillNoForEdit = (no: string) => {
  const m = String(no).match(/(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const yr = parseInt(m[2], 10);
  if (!Number.isFinite(num) || !Number.isFinite(yr)) return null;
  return { num, yr };
};

async function isLatestBill(billNo: string): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("invoice_prefix")
    .limit(1)
    .maybeSingle();
  const prefix = settings?.invoice_prefix || "INV-";
  const parsed = parseBillNoForEdit(billNo);
  if (!parsed) return false;
  const { data: yearBills } = await supabaseAdmin
    .from("bills")
    .select("bill_no")
    .like("bill_no", `${prefix}%/${parsed.yr}`);
  let maxNum = 0;
  for (const r of yearBills ?? []) {
    const p = parseBillNoForEdit(r.bill_no);
    if (p && p.num > maxNum) maxNum = p.num;
  }
  return parsed.num === maxNum;
}

export const updateBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    billCoreInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: eErr } = await supabaseAdmin
      .from("bills")
      .select("id, status, created_by, customer_id, bill_no")
      .eq("id", data.id)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!existing) throw new Error("Bill not found");

    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin && existing.created_by !== context.userId) {
      throw new Error("You can only edit your own bills");
    }

    // Block duplicate billing month (any non-cancelled bill, excluding self)
    {
      const { data: dupMonth } = await supabaseAdmin
        .from("bills")
        .select("bill_no")
        .eq("customer_id", existing.customer_id)
        .eq("billing_month", data.billing_month)
        .neq("status", "CANCELLED")
        .neq("id", data.id)
        .limit(1);
      if (dupMonth && dupMonth.length > 0) {
        throw new Error(
          `This customer already has a bill (${dupMonth[0].bill_no}) for the selected billing month.`,
        );
    }

    // Require a FINALIZED VAT submission (with submission_id) for this customer + month
    {
      const { data: vat } = await supabaseAdmin
        .from("vat_submissions")
        .select("submission_id")
        .eq("customer_id", existing.customer_id)
        .eq("tax_period_date", data.billing_month)
        .eq("status", "FINALIZED")
        .not("submission_id", "is", null)
        .limit(1);
      if (!vat || vat.length === 0) {
        throw new Error(
          "No finalized VAT submission (with Submission ID) found for this customer and billing month. Finalize the VAT submission first.",
        );
      }
    }
    }

    // If transitioning to FINALIZED, ensure no other draft for this customer
    if (data.status === "FINALIZED") {
      const { data: otherDrafts } = await supabaseAdmin
        .from("bills")
        .select("bill_no")
        .eq("customer_id", existing.customer_id)
        .eq("status", "DRAFT")
        .neq("id", data.id)
        .limit(1);
      if (otherDrafts && otherDrafts.length > 0) {
        throw new Error(
          `This customer has another draft bill (${otherDrafts[0].bill_no}). Resolve it before finalizing.`,
        );
      }
    }

    if (existing.status === "CANCELLED") throw new Error("Cancelled bills cannot be edited");

    // Only the most recent bill of its year is editable.
    if (!(await isLatestBill(existing.bill_no))) {
      throw new Error("Only the most recent bill can be edited");
    }

    // Re-compute
    const { balance } = await getRunningBalance(existing.customer_id, data.id);
    const previousDue = balance < 0 ? -balance : 0;
    const previousAdvance = balance > 0 ? balance : 0;
    const customerTypeId = await getCustomerTypeId(existing.customer_id);
    const lines = await computeBillLinesBatched(data.items, data.bill_date, customerTypeId);
    const subtotal = r2(lines.reduce((s, l) => s + l.final_amount, 0));
    const discount = r2(Math.min(data.discount_amount, subtotal + previousDue));
    const grandTotal = r2(Math.max(0, previousDue + subtotal - discount - previousAdvance));


    const { error: uErr } = await supabaseAdmin
      .from("bills")
      .update({
        bill_date: data.bill_date,
        billing_month: data.billing_month,
        previous_balance: r2(balance),
        subtotal,
        discount_amount: discount,
        grand_total: grandTotal,
        status: data.status,
        notes: data.notes || null,
        finalized_at: data.status === "FINALIZED" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await supabaseAdmin.from("bill_items").delete().eq("bill_id", data.id);
    const itemRows = lines.map((l, idx) => ({
      bill_id: data.id,
      service_item_id: l.service_item_id,
      position: idx + 1,
      qty: l.qty,
      rate_used: l.rate_used,
      minimum_charge_used: l.minimum_charge_used,
      calculated_amount: l.calculated_amount,
      final_amount: l.final_amount,
    }));
    const { error: iErr } = await supabaseAdmin.from("bill_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    // Auto-send WhatsApp when an update transitions an existing draft to FINALIZED.
    if (data.status === "FINALIZED" && existing.status !== "FINALIZED") {
      await Promise.all([
        autoSendWhatsAppIfEnabled(data.id, context.userId).catch((e) => console.warn("[sms] failed", e)),
        autoCreateManagerEarnings(data.id),
      ]);
    }


    return { ok: true };
  });

// ---------- status changes ----------
export const finalizeBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin
      .from("bills")
      .select("status, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Bill not found");
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin && existing.created_by !== context.userId) {
      throw new Error("Forbidden");
    }
    if (existing.status !== "DRAFT") throw new Error("Only draft bills can be finalized");

    // Block if another draft or duplicate billing month exists for the same customer
    const { data: billRow } = await supabaseAdmin
      .from("bills")
      .select("customer_id, billing_month")
      .eq("id", data.id)
      .maybeSingle();
    if (billRow) {
      const { data: otherDrafts } = await supabaseAdmin
        .from("bills")
        .select("bill_no")
        .eq("customer_id", billRow.customer_id)
        .eq("status", "DRAFT")
        .neq("id", data.id)
        .limit(1);
      if (otherDrafts && otherDrafts.length > 0) {
        throw new Error(
          `This customer has another draft bill (${otherDrafts[0].bill_no}). Resolve it before finalizing.`,
        );
      }
      const { data: dupMonth } = await supabaseAdmin
        .from("bills")
        .select("bill_no")
        .eq("customer_id", billRow.customer_id)
        .eq("billing_month", billRow.billing_month)
        .neq("status", "CANCELLED")
        .neq("id", data.id)
        .limit(1);
      if (dupMonth && dupMonth.length > 0) {
        throw new Error(
          `This customer already has a bill (${dupMonth[0].bill_no}) for the selected billing month.`,
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("bills")
      .update({ status: "FINALIZED", finalized_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await Promise.all([
      autoSendWhatsAppIfEnabled(data.id, context.userId).catch((e) => console.warn("[sms] failed", e)),
      autoCreateManagerEarnings(data.id),
    ]);
    return { ok: true };
  });


export const cancelBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    const { data: existing } = await supabaseAdmin
      .from("bills")
      .select("status, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Bill not found");
    if (!isAdmin && existing.created_by !== context.userId) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("bills")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- list / get ----------
export const listBills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      search: z.string().optional(),
      status: z.enum(["all", "DRAFT", "FINALIZED", "CANCELLED"]).optional().default("all"),
      include_drafts: z.boolean().optional().default(false),
      billing_month: z.string().optional(),
      reference_id: z.string().uuid().nullable().optional(),
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
      .from("bills")
      .select(
        "id, bill_no, bill_date, billing_month, previous_balance, subtotal, discount_amount, grand_total, status, customer:customers(id, company_name, name, bin_number, area_id, reference_id, area:areas(area_name), ref:references(reference_name))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (data.status && data.status !== "all") {
      q = q.eq("status", data.status);
    } else if (!data.include_drafts) {
      // Default: hide drafts from the main list.
      q = q.neq("status", "DRAFT");
    }
    if (data.billing_month) q = q.eq("billing_month", data.billing_month);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (managerCustomerIds) q = q.in("customer_id", managerCustomerIds);
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[%,]/g, "");
      // Find matching customers by name/company/mobile
      const { data: matchedCustomers } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(
          `company_name.ilike.%${s}%,name.ilike.%${s}%,mobile.ilike.%${s}%,alternative_mobile.ilike.%${s}%`,
        )
        .limit(500);
      const customerIds = (matchedCustomers ?? []).map((c) => c.id);
      const orParts = [`bill_no.ilike.%${s}%`];
      if (customerIds.length > 0) {
        orParts.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      q = q.or(orParts.join(","));
    }

    q = q.range(from, to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.reference_id) {
      filtered = filtered.filter((r) => r.customer?.reference_id === data.reference_id);
    }
    if (data.area_id) {
      filtered = filtered.filter((r) => r.customer?.area_id === data.area_id);
    }
    return { rows: filtered, total: count ?? 0, page, page_size: pageSize };
  });

export const getBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bill, error } = await supabaseAdmin
      .from("bills")
      .select(
        "*, customer:customers(id, company_name, name, bin_number, mobile, address, area:areas(area_name), ref:references(reference_name))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bill) throw new Error("Bill not found");
    await assertCustomerAccess(context.userId, bill.customer_id);

    const { data: items, error: iErr } = await supabaseAdmin
      .from("bill_items")
      .select("*, service:service_items(item_name)")
      .eq("bill_id", data.id)
      .order("position");
    if (iErr) throw new Error(iErr.message);

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, address, phone, email, logo_url, bin_number, bank_name, bank_account_number, bank_branch, payment_link_expiry_days, invoice_footer_text, invoice_terms, print_page_size, print_orientation, print_margin_top, print_margin_bottom, print_margin_left, print_margin_right, print_show_logo, print_show_header, print_show_footer, print_copies, print_signature_line, print_signature_label, print_signature_url")
      .limit(1)
      .maybeSingle();

    return { bill, items: items ?? [], company, is_latest: await isLatestBill(bill.bill_no) };
  });


export const deleteBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin) throw new Error("Only admin can delete bills");

    // Load the bill being deleted to determine its invoice number/year.
    const { data: target, error: tErr } = await supabaseAdmin
      .from("bills")
      .select("id, bill_no")
      .eq("id", data.id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target) throw new Error("Bill not found");

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("id, invoice_prefix, starting_invoice_number, last_invoice_year")
      .limit(1)
      .maybeSingle();
    if (!settings) throw new Error("Company settings not configured");

    const prefix = settings.invoice_prefix || "INV-";
    const startFrom = Number(settings.starting_invoice_number || 1);

    const parseBillNo = (no: string) => {
      const m = String(no).match(/(\d+)\/(\d+)$/);
      if (!m) return null;
      const num = parseInt(m[1], 10);
      const yr = parseInt(m[2], 10);
      if (!Number.isFinite(num) || !Number.isFinite(yr)) return null;
      return { num, yr };
    };

    const parsed = parseBillNo(target.bill_no);
    if (!parsed) throw new Error("Cannot parse invoice number");

    // Enforce LIFO delete order: only the highest invoice number for that
    // year may be deleted. Newer bills must be removed first.
    const { data: yearBills, error: yErr } = await supabaseAdmin
      .from("bills")
      .select("bill_no")
      .like("bill_no", `${prefix}%/${parsed.yr}`);
    if (yErr) throw new Error(yErr.message);

    let maxNum = startFrom - 1;
    for (const r of yearBills ?? []) {
      const p = parseBillNo(r.bill_no);
      if (p && p.num > maxNum) maxNum = p.num;
    }
    if (parsed.num !== maxNum) {
      throw new Error(
        `Only the latest bill of the year can be deleted. Delete bill ${prefix}${String(maxNum).padStart(6, "0")}/${parsed.yr} first.`,
      );
    }

    // Delete the bill
    const { error } = await supabaseAdmin.from("bills").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    // Rebuild the persistent counter from remaining bills for the current
    // tracked year so the next generated invoice reuses the freed slot.
    const trackedYear =
      (settings as { last_invoice_year: number | null }).last_invoice_year ??
      new Date().getFullYear();
    const { data: remaining } = await supabaseAdmin
      .from("bills")
      .select("bill_no")
      .like("bill_no", `${prefix}%/${trackedYear}`);

    let newMax = startFrom - 1;
    for (const r of remaining ?? []) {
      const p = parseBillNo(r.bill_no);
      if (p && p.num > newMax) newMax = p.num;
    }
    await supabaseAdmin
      .from("company_settings")
      .update({ last_invoice_number: Math.max(0, newMax) })
      .eq("id", settings.id);

    return { ok: true };
  });

export const listFinalizedVatMonths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customer_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("vat_submissions")
      .select("tax_period_date, submission_id")
      .eq("customer_id", data.customer_id)
      .eq("status", "FINALIZED")
      .not("submission_id", "is", null)
      .order("tax_period_date", { ascending: false });
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const out: { billing_month: string; submission_id: string }[] = [];
    for (const r of rows ?? []) {
      const m = String(r.tax_period_date);
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({ billing_month: m, submission_id: String(r.submission_id) });
    }
    return out;
  });

export const getBillMonthSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      customer_id: z.string().uuid(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const monthStart = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const nextMonthStart = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    const [vatRes, mushakRes] = await Promise.all([
      supabaseAdmin
        .from("vat_submissions")
        .select("submission_id, submission_date, tax_period")
        .eq("customer_id", data.customer_id)
        .eq("status", "FINALIZED")
        .eq("tax_period_date", monthStart)
        .order("submission_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("mushak_4_3_submissions")
        .select("submission_id, item_name, boe_date, submission_date")
        .eq("customer_id", data.customer_id)
        .eq("status", "FINALIZED")
        .gte("submission_date", monthStart)
        .lt("submission_date", nextMonthStart)
        .order("submission_date", { ascending: false }),
    ]);

    if (vatRes.error) throw new Error(vatRes.error.message);
    if (mushakRes.error) throw new Error(mushakRes.error.message);

    return {
      vat: vatRes.data
        ? {
            submission_id: String((vatRes.data as any).submission_id),
            submission_date: (vatRes.data as any).submission_date as string | null,
            tax_period: (vatRes.data as any).tax_period as string,
          }
        : null,
      mushak: ((mushakRes.data ?? []) as any[]).map((r) => ({
        submission_id: String(r.submission_id),
        item_name: String(r.item_name ?? ""),
        boe_date: r.boe_date as string,
        submission_date: r.submission_date as string,
      })),
    };
  });




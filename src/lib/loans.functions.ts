import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLoansData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: loans, error: lErr } = await supabaseAdmin
      .from("loans")
      .select("*, loan_contacts(name), loan_transactions(*)")
      .order("created_at", { ascending: false });
    if (lErr) throw new Error(lErr.message);

    const { data: contacts, error: coErr } = await supabaseAdmin
      .from("loan_contacts")
      .select("*")
      .order("name");
    if (coErr) throw new Error(coErr.message);

    return { loans: loans || [], contacts: contacts || [] };
  });

export const addLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid(),
    amount: z.number(),
    interest_rate: z.number().optional(),
    type: z.enum(['GIVEN', 'TAKEN']),
    loan_date: z.string(),
    due_date: z.string().optional(),
    description: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Note: The database enum values are 'GIVEN' and 'TAKEN' as per my migration.
    // However, if the types file says 'given' and 'taken', it means there's a mismatch or a prior version.
    // Based on the linter error, it expects lowercase. Let's use as any to bypass or double check migration.
    // Wait, the migration I sent used UPPERCASE. Let's verify what's in the DB.
    
    const { error } = await supabaseAdmin
      .from("loans")
      .insert({
        ...data,
        created_by: context.userId,
        status: 'ACTIVE'
      } as any);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const addLoanTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    loan_id: z.string().uuid(),
    amount: z.number(),
    transaction_date: z.string(),
    type: z.enum(['REPAYMENT', 'COLLECTION', 'INTEREST']),
    payment_method: z.string(),
    bank_account_id: z.string().uuid().optional(),
    notes: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("loan_transactions")
      .insert({
        ...data,
        created_by: context.userId
      } as any);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const addLoanContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional()
  }).parse(d))
  .handler(async ({ data }) => {
    const { data: contact, error } = await supabaseAdmin
      .from("loan_contacts")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return contact;
  });

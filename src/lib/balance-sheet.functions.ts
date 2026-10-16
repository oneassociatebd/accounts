import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getLoanContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("loan_contacts").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const addLoanContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string(),
    phone: z.string().optional(),
    address: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: contact, error } = await supabaseAdmin
      .from("loan_contacts")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return contact;
  });

export const addLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid(),
    amount: z.number(),
    type: z.enum(['given', 'taken']),
    loan_date: z.string(),
    due_date: z.string().optional(),
    description: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("loans")
      .insert({
        ...data,
        status: 'ACTIVE',
        created_by: context.userId
      });
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("loans")
      .select("*, loan_contacts(name), loan_transactions(*)")
      .order("loan_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const updateLoanDueDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    loan_id: z.string().uuid(),
    due_date: z.string().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("loans")
      .update({ due_date: data.due_date || null })
      .eq("id", data.loan_id);
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
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("loan_transactions")
      .insert({
        ...data,
        created_by: context.userId
      });
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getBalanceSheetData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    month: z.number().optional(),
    year: z.number().optional()
  }).optional().parse(d))
  .handler(async ({ data: filter, context }) => {
    await assertAdmin(context.userId);
    const month = filter?.month || 0;
    const year = filter?.year || 0;

    let startDate: string | undefined;
    let endDate: string | undefined;

    if (year > 0) {
      if (month > 0) {
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      } else {
        startDate = `${year}-01-01`;
        endDate = `${year + 1}-01-01`;
      }
    }

    // 1. Income (Bill Collections + Others Income)
    let billsQuery = supabaseAdmin
      .from("bills")
      .select("grand_total, created_at")
      .eq("status", "FINALIZED");
    
    if (startDate && endDate) {
      billsQuery = billsQuery.gte("created_at", startDate).lt("created_at", endDate);
    }
    
    const { data: bills, error: bErr } = await billsQuery;
    if (bErr) throw new Error(bErr.message);
    const totalIncomeFromBills = r2(bills.reduce((sum, b) => sum + (b.grand_total || 0), 0));

    // 2. Others Income
    let othersIncomeQuery = supabaseAdmin
      .from("others_income")
      .select("*, income_sources(name)");
    
    if (startDate && endDate) {
      othersIncomeQuery = othersIncomeQuery.gte("income_date", startDate).lt("income_date", endDate);
    }
    
    const { data: othersIncome, error: oiErr } = await othersIncomeQuery;
    if (oiErr) throw new Error(oiErr.message);
    const totalOthersIncome = r2(othersIncome.reduce((sum, oi) => sum + (oi.amount || 0), 0));

    // 3. Bill Collections
    let collectionsQuery = supabaseAdmin
      .from("collections")
      .select("amount, payment_method, bank_account_id, created_at")
      .eq("status", "ACTIVE");

    if (startDate && endDate) {
      collectionsQuery = collectionsQuery.gte("created_at", startDate).lt("created_at", endDate);
    }

    const { data: collections, error: cErr } = await collectionsQuery;
    if (cErr) throw new Error(cErr.message);
    const totalCollections = r2(collections.reduce((sum, c) => sum + (c.amount || 0), 0));

    // Total Income = Bill Collections + Others Income
    const totalIncome = r2(totalCollections + totalOthersIncome);

    // 4. Expenses
    let expensesQuery = supabaseAdmin
      .from("expenses")
      .select("amount, payment_method, bank_account_id, category_id, expense_categories(name), expense_date");

    if (startDate && endDate) {
      expensesQuery = expensesQuery.gte("expense_date", startDate).lt("expense_date", endDate);
    }

    const { data: expenses, error: eErr } = await expensesQuery;
    if (eErr) throw new Error(eErr.message);
    const totalExpenses = r2(expenses.reduce((sum, e) => sum + (e.amount || 0), 0));

    // 5. Bank Accounts & Balances (ALWAYS ALL TIME for current balance)
    const { data: allCollections } = await supabaseAdmin.from("collections").select("amount, bank_account_id, payment_method").eq("status", "ACTIVE");
    const { data: allOthersIncome } = await supabaseAdmin.from("others_income").select("amount, bank_account_id, payment_method");
    const { data: allExpenses } = await supabaseAdmin.from("expenses").select("amount, bank_account_id, payment_method");
    
    const { data: accounts, error: aErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("*");
    if (aErr) throw new Error(aErr.message);

    const bankBalances = accounts.map(acc => {
      const accCollections = (allCollections || [])
        .filter(c => c.bank_account_id === acc.id && c.payment_method === 'BANK')
        .reduce((sum, c) => sum + (c.amount || 0), 0);
      
      const accOthersIncome = (allOthersIncome || [])
        .filter(oi => oi.bank_account_id === acc.id && oi.payment_method === 'BANK')
        .reduce((sum, oi) => sum + (oi.amount || 0), 0);

      const accExpenses = (allExpenses || [])
        .filter(e => e.bank_account_id === acc.id && e.payment_method === 'BANK')
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      
      return {
        ...acc,
        current_balance: r2(Number(acc.initial_balance || 0) + accCollections + accOthersIncome - accExpenses)
      };
    });

    // 6. Cash Balance (Hand) (ALWAYS ALL TIME)
    const cashCollections = (allCollections || [])
      .filter(c => c.payment_method === 'CASH')
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    
    const cashOthersIncome = (allOthersIncome || [])
      .filter(oi => oi.payment_method === 'CASH')
      .reduce((sum, oi) => sum + (oi.amount || 0), 0);

    const cashExpenses = (allExpenses || [])
      .filter(e => e.payment_method === 'CASH')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const cashBalance = r2(cashCollections + cashOthersIncome - cashExpenses);

    // 7. Net Profit/Balance
    const netBalance = r2(totalIncome - totalExpenses);

    return {
      summary: {
        totalIncome,
        totalIncomeFromBills,
        totalOthersIncome,
        totalCollections,
        totalExpenses,
        netBalance,
        cashBalance
      },
      bankBalances,
      expensesByCategory: expenses.reduce((acc: any, e) => {
        const catName = (e as any).expense_categories?.name || 'Uncategorized';
        acc[catName] = r2((acc[catName] || 0) + (e.amount || 0));
        return acc;
      }, {}),
      othersIncomeList: othersIncome
    };
  });

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    expense_date: z.string(),
    category_id: z.string().uuid(),
    amount: z.number(),
    payment_method: z.string(),
    bank_account_id: z.string().uuid().optional(),
    notes: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("expenses")
      .insert({
        ...data,
        created_by: context.userId
      });
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    expense_date: z.string(),
    category_id: z.string().uuid(),
    amount: z.number(),
    payment_method: z.string(),
    bank_account_id: z.string().uuid().nullable().optional(),
    notes: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("expenses")
      .update({
        ...rest,
        bank_account_id: rest.payment_method === "BANK" ? rest.bank_account_id ?? null : null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const addOthersIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    income_date: z.string(),
    source: z.string().optional(),
    source_id: z.string().uuid().optional(),
    amount: z.number(),
    payment_method: z.string(),
    bank_account_id: z.string().uuid().optional(),
    notes: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("others_income")
      .insert({
        income_date: data.income_date,
        source: data.source || '',
        source_id: data.source_id,
        amount: data.amount,
        payment_method: data.payment_method,
        bank_account_id: data.bank_account_id,
        notes: data.notes,
        created_by: context.userId
      });
    if (error) throw new Error(error.message);
    return { success: true };
  });

const dateFilterSchema = z.object({
  month: z.number().optional(),
  year: z.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}).optional();

function dateRange(month?: number, year?: number, from?: string, to?: string) {
  if (from || to) {
    // end-exclusive: bump 'to' by 1 day
    let end: string | undefined;
    if (to) {
      const d = new Date(to + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      end = d.toISOString().slice(0, 10);
    }
    return { start: from, end };
  }
  const m = month || 0;
  const y = year || 0;
  if (y > 0) {
    if (m > 0) {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      return { start, end: `${ny}-${String(nm).padStart(2, '0')}-01` };
    }
    return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  }
  return { start: undefined as string | undefined, end: undefined as string | undefined };
}

export const getExpensesList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { start, end } = dateRange(data?.month, data?.year, data?.from, data?.to);
    let q = supabaseAdmin
      .from("expenses")
      .select("*, expense_categories(name), bank_accounts(name, bank_name)")
      .order("expense_date", { ascending: false });
    if (start) q = q.gte("expense_date", start);
    if (end) q = q.lt("expense_date", end);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const getOthersIncomeList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { start, end } = dateRange(data?.month, data?.year, data?.from, data?.to);
    let q = supabaseAdmin
      .from("others_income")
      .select("*, income_sources(name), bank_accounts(name, bank_name)")
      .order("income_date", { ascending: false });
    if (start) q = q.gte("income_date", start);
    if (end) q = q.lt("income_date", end);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const getIncomeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("income_sources").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const addIncomeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string(),
    description: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: source, error } = await supabaseAdmin
      .from("income_sources")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return source;
  });

export const getExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("expense_categories").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const addExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: category, error } = await supabaseAdmin
      .from("expense_categories")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return category;
  });

export const getBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("bank_accounts").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const addBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string(),
    bank_name: z.string().optional(),
    branch_name: z.string().optional(),
    account_number: z.string().optional(),
    initial_balance: z.number()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bank_accounts").insert(data);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const updateBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string(),
    bank_name: z.string().optional().nullable(),
    branch_name: z.string().optional().nullable(),
    account_number: z.string().optional().nullable(),
    initial_balance: z.number()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin.from("bank_accounts").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Block delete if account is referenced in any transactions
    const tables = ["collections", "expenses", "others_income", "loan_transactions"] as const;
    for (const t of tables) {
      const { count } = await supabaseAdmin
        .from(t)
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", data.id);
      if ((count ?? 0) > 0) {
        throw new Error(`Cannot delete: account is used in ${t} (${count} record${count === 1 ? "" : "s"}).`);
      }
    }
    const { error } = await supabaseAdmin.from("bank_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export type CompanyLedgerEntry = {
  date: string;
  type: 'BILL_COLLECTION' | 'OTHERS_INCOME' | 'EXPENSE' | 'LOAN_REPAYMENT' | 'LOAN_COLLECTION' | 'LOAN_INTEREST' | 'LOAN_GIVEN' | 'LOAN_TAKEN';
  reference: string;
  description: string;
  payment_method: string;
  bank_account: string;
  debit: number;
  credit: number;
};

export const getCompanyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = data?.from || undefined;
    const to = data?.to || undefined;

    let colQ = supabaseAdmin
      .from("collections")
      .select("collection_date, receipt_no, amount, payment_method, notes, bank_accounts(name, bank_name), customers(name, company_name)")
      .eq("status", "ACTIVE");
    if (from) colQ = colQ.gte("collection_date", from);
    if (to) colQ = colQ.lte("collection_date", to);

    let oiQ = supabaseAdmin
      .from("others_income")
      .select("income_date, source, amount, payment_method, notes, bank_accounts(name, bank_name), income_sources(name)");
    if (from) oiQ = oiQ.gte("income_date", from);
    if (to) oiQ = oiQ.lte("income_date", to);

    let exQ = supabaseAdmin
      .from("expenses")
      .select("expense_date, amount, payment_method, notes, bank_accounts(name, bank_name), expense_categories(name)");
    if (from) exQ = exQ.gte("expense_date", from);
    if (to) exQ = exQ.lte("expense_date", to);

    let ltQ = supabaseAdmin
      .from("loan_transactions")
      .select("transaction_date, amount, type, payment_method, notes, bank_accounts(name, bank_name), loans(type, loan_contacts(name))");
    if (from) ltQ = ltQ.gte("transaction_date", from);
    if (to) ltQ = ltQ.lte("transaction_date", to);

    let loanQ = supabaseAdmin
      .from("loans")
      .select("loan_date, amount, type, description, loan_contacts(name)");
    if (from) loanQ = loanQ.gte("loan_date", from);
    if (to) loanQ = loanQ.lte("loan_date", to);

    const [colRes, oiRes, exRes, ltRes, loanRes, openingRes] = await Promise.all([
      colQ, oiQ, exQ, ltQ, loanQ,
      from
        ? Promise.all([
            supabaseAdmin.from("collections").select("amount").eq("status", "ACTIVE").lt("collection_date", from),
            supabaseAdmin.from("others_income").select("amount").lt("income_date", from),
            supabaseAdmin.from("expenses").select("amount").lt("expense_date", from),
            supabaseAdmin.from("loan_transactions").select("amount, type").lt("transaction_date", from),
            supabaseAdmin.from("loans").select("amount, type").lt("loan_date", from),
          ])
        : Promise.resolve(null),
    ]);

    if (colRes.error) throw new Error(colRes.error.message);
    if (oiRes.error) throw new Error(oiRes.error.message);
    if (exRes.error) throw new Error(exRes.error.message);
    if (ltRes.error) throw new Error(ltRes.error.message);
    if (loanRes.error) throw new Error(loanRes.error.message);

    const entries: CompanyLedgerEntry[] = [];

    for (const c of (colRes.data ?? []) as any[]) {
      const cust = c.customers?.company_name || c.customers?.name || "Customer";
      entries.push({
        date: c.collection_date,
        type: 'BILL_COLLECTION',
        reference: c.receipt_no || "",
        description: `Bill Collection — ${cust}`,
        payment_method: c.payment_method || "",
        bank_account: c.bank_accounts ? `${c.bank_accounts.name}${c.bank_accounts.bank_name ? ` (${c.bank_accounts.bank_name})` : ''}` : "",
        debit: 0,
        credit: r2(Number(c.amount || 0)),
      });
    }
    for (const oi of (oiRes.data ?? []) as any[]) {
      entries.push({
        date: oi.income_date,
        type: 'OTHERS_INCOME',
        reference: "",
        description: `Others Income — ${oi.income_sources?.name || oi.source || "Other"}`,
        payment_method: oi.payment_method || "",
        bank_account: oi.bank_accounts ? `${oi.bank_accounts.name}${oi.bank_accounts.bank_name ? ` (${oi.bank_accounts.bank_name})` : ''}` : "",
        debit: 0,
        credit: r2(Number(oi.amount || 0)),
      });
    }
    for (const e of (exRes.data ?? []) as any[]) {
      entries.push({
        date: e.expense_date,
        type: 'EXPENSE',
        reference: "",
        description: `Expense — ${e.expense_categories?.name || "Uncategorized"}${e.notes ? ` (${e.notes})` : ''}`,
        payment_method: e.payment_method || "",
        bank_account: e.bank_accounts ? `${e.bank_accounts.name}${e.bank_accounts.bank_name ? ` (${e.bank_accounts.bank_name})` : ''}` : "",
        debit: r2(Number(e.amount || 0)),
        credit: 0,
      });
    }
    for (const lt of (ltRes.data ?? []) as any[]) {
      const contact = lt.loans?.loan_contacts?.name || "Loan";
      const isCredit = lt.type === 'COLLECTION';
      const isInterest = lt.type === 'INTEREST';
      entries.push({
        date: lt.transaction_date,
        type: isCredit ? 'LOAN_COLLECTION' : isInterest ? 'LOAN_INTEREST' : 'LOAN_REPAYMENT',
        reference: "",
        description: `Loan ${lt.type === 'COLLECTION' ? 'Receipt' : lt.type === 'INTEREST' ? 'Interest' : 'Repayment'} — ${contact}`,
        payment_method: lt.payment_method || "",
        bank_account: lt.bank_accounts ? `${lt.bank_accounts.name}${lt.bank_accounts.bank_name ? ` (${lt.bank_accounts.bank_name})` : ''}` : "",
        debit: isCredit ? 0 : r2(Number(lt.amount || 0)),
        credit: isCredit ? r2(Number(lt.amount || 0)) : 0,
      });
    }

    for (const ln of (loanRes.data ?? []) as any[]) {
      const contact = ln.loan_contacts?.name || "Loan";
      const isTaken = ln.type === 'taken';
      entries.push({
        date: ln.loan_date,
        type: isTaken ? 'LOAN_TAKEN' : 'LOAN_GIVEN',
        reference: "",
        description: `Loan ${isTaken ? 'Taken' : 'Given'} — ${contact}${ln.description ? ` (${ln.description})` : ''}`,
        payment_method: "",
        bank_account: "",
        debit: isTaken ? 0 : r2(Number(ln.amount || 0)),
        credit: isTaken ? r2(Number(ln.amount || 0)) : 0,
      });
    }

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let opening = 0;
    if (openingRes) {
      const [oc, ooi, oex, olt, oln] = openingRes;
      opening += ((oc.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      opening += ((ooi.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      opening -= ((oex.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      for (const lt of ((olt.data ?? []) as any[])) {
        const amt = Number(lt.amount || 0);
        if (lt.type === 'COLLECTION') opening += amt;
        else opening -= amt;
      }
      for (const ln of ((oln.data ?? []) as any[])) {
        const amt = Number(ln.amount || 0);
        if (ln.type === 'taken') opening += amt;
        else opening -= amt;
      }
    }

    const totals = entries.reduce(
      (acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }),
      { debit: 0, credit: 0 },
    );

    return {
      opening: r2(opening),
      entries,
      totals: { debit: r2(totals.debit), credit: r2(totals.credit) },
      closing: r2(opening + totals.credit - totals.debit),
    };
  });

export const getCompanyNetPosition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [colAll, oiAll, exAll, ltAll, loanAll, billsAll, custAll] = await Promise.all([
      supabaseAdmin.from("collections").select("amount").eq("status", "ACTIVE"),
      supabaseAdmin.from("others_income").select("amount"),
      supabaseAdmin.from("expenses").select("amount"),
      supabaseAdmin.from("loan_transactions").select("amount, type, loans(type)"),
      supabaseAdmin.from("loans").select("amount, type"),
      supabaseAdmin.from("bills").select("grand_total, status"),
      supabaseAdmin.from("customers").select("opening_balance_amount, opening_balance_type"),
    ]);

    const sum = (rows: any[] | null | undefined, key = "amount") =>
      (rows ?? []).reduce((s, r) => s + Number(r?.[key] || 0), 0);

    const totalCollections = sum(colAll.data);
    const totalOthersIncome = sum(oiAll.data);
    const totalExpenses = sum(exAll.data);

    // Loans master
    let loansGiven = 0, loansTaken = 0;
    for (const l of (loanAll.data ?? []) as any[]) {
      const amt = Number(l.amount || 0);
      if (l.type === 'given') loansGiven += amt;
      else if (l.type === 'taken') loansTaken += amt;
    }

    // Loan transactions split by parent loan type
    let givenCollected = 0, givenInterest = 0; // money coming back from loans we gave
    let takenRepaid = 0, takenInterest = 0;    // money we paid back on loans we took
    for (const t of (ltAll.data ?? []) as any[]) {
      const amt = Number(t.amount || 0);
      const parentType = t.loans?.type;
      if (parentType === 'given') {
        if (t.type === 'COLLECTION') givenCollected += amt;
        else if (t.type === 'INTEREST') givenInterest += amt;
      } else if (parentType === 'taken') {
        if (t.type === 'REPAYMENT') takenRepaid += amt;
        else if (t.type === 'INTEREST') takenInterest += amt;
      }
    }

    // Cash in hand (signed cash flow across all time)
    const cashIn = totalCollections + totalOthersIncome + loansTaken + givenCollected + givenInterest;
    const cashOut = totalExpenses + loansGiven + takenRepaid + takenInterest;
    const cashInHand = cashIn - cashOut;

    // Customers Due
    const billsTotal = ((billsAll.data ?? []) as any[])
      .filter((b) => b.status !== 'CANCELLED')
      .reduce((s, b) => s + Number(b.grand_total || 0), 0);
    const openingCust = ((custAll.data ?? []) as any[])
      .reduce((s, c) => {
        const a = Number(c.opening_balance_amount || 0);
        return s + (c.opening_balance_type === 'DUE' ? -a : a);
      }, 0);
    const customersDue = billsTotal - totalCollections - openingCust;

    const loansReceivable = loansGiven - givenCollected; // principal still owed to us
    const loansPayable = loansTaken - takenRepaid;        // principal we still owe

    const netWorth = cashInHand + customersDue + loansReceivable - loansPayable;

    return {
      cashInHand: r2(cashInHand),
      customersDue: r2(customersDue),
      loansReceivable: r2(loansReceivable),
      loansPayable: r2(loansPayable),
      netWorth: r2(netWorth),
    };
  });


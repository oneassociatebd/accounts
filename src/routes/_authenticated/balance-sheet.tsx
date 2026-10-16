import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { CalendarRange } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  TrendingDown, Landmark, Plus, CircleDollarSign, HandCoins, History,
  ShieldAlert, PieChart, Receipt, Banknote, Trash2,
} from "lucide-react";
import {
  getExpensesList,
  getOthersIncomeList,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  addExpenseCategory,
  getBankAccounts,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
  addOthersIncome,
  getIncomeSources,
  addIncomeSource,
  getLoanContacts,
  addLoanContact,
  addLoan,
  getLoans,
  addLoanTransaction,
  getBalanceSheetData,
  updateLoanDueDate,
} from "@/lib/balance-sheet.functions";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/balance-sheet")({
  head: () => ({ meta: [{ title: "Accounts Overview | One" }] }),
  component: BalanceSheet,
});

const fmt = (n?: number | string | null) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BalanceSheet() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const effFrom = fromDate || toDate ? fromDate : firstOfMonth;
  const effTo = fromDate || toDate ? toDate : lastOfMonth;

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 p-4 text-center">
        <div className="bg-rose-100 p-3 rounded-full">
          <ShieldAlert className="h-12 w-12 text-rose-600" />
        </div>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">Admin access required.</p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const fetchExpenses = useServerFn(getExpensesList);
  const fetchIncomes = useServerFn(getOthersIncomeList);
  const fetchLoans = useServerFn(getLoans);
  const fetchBanks = useServerFn(getBankAccounts);
  const fetchCats = useServerFn(getExpenseCategories);
  const fetchSources = useServerFn(getIncomeSources);
  const fetchContacts = useServerFn(getLoanContacts);
  const fetchStats = useServerFn(getBalanceSheetData);

  const saveExpense = useServerFn(addExpense);
  const editExpense = useServerFn(updateExpense);
  const removeExpense = useServerFn(deleteExpense);
  const saveIncome = useServerFn(addOthersIncome);
  const saveLoan = useServerFn(addLoan);
  const saveLoanTx = useServerFn(addLoanTransaction);
  const saveBank = useServerFn(addBankAccount);
  const editBank = useServerFn(updateBankAccount);
  const removeBank = useServerFn(deleteBankAccount);
  const saveCat = useServerFn(addExpenseCategory);
  const saveSource = useServerFn(addIncomeSource);
  const saveContact = useServerFn(addLoanContact);

  const { data: expenses } = useQuery({
    queryKey: ["bs-expenses", effFrom, effTo],
    queryFn: () => fetchExpenses({ data: { from: effFrom, to: effTo } }),
  });
  const { data: incomes } = useQuery({
    queryKey: ["bs-incomes", effFrom, effTo],
    queryFn: () => fetchIncomes({ data: { from: effFrom, to: effTo } }),
  });
  const { data: loans } = useQuery({
    queryKey: ["loans"],
    queryFn: () => fetchLoans({ data: undefined }),
  });
  const { data: banks } = useQuery({
    queryKey: ["bank-accounts-list"],
    queryFn: () => fetchBanks({ data: undefined }),
  });
  const { data: bankBalances } = useQuery({
    queryKey: ["bs-stats-banks"],
    queryFn: () => fetchStats({ data: { month: 0, year: 0 } }),
  });
  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => fetchCats({ data: undefined }),
  });
  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: () => fetchSources({ data: undefined }),
  });
  const { data: contacts } = useQuery({
    queryKey: ["loan-contacts"],
    queryFn: () => fetchContacts({ data: undefined }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["bs-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["bs-incomes"] });
    queryClient.invalidateQueries({ queryKey: ["bs-stats-banks"] });
    queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
    queryClient.invalidateQueries({ queryKey: ["loans"] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts-list"] });
    queryClient.invalidateQueries({ queryKey: ["dash-bs"] });
  };

  // ---------- Forms ----------
  const today = new Date().toISOString().split("T")[0];

  const [expenseForm, setExpenseForm] = useState({
    expense_date: today, category_id: "", amount: "", payment_method: "CASH",
    bank_account_id: "", notes: "",
  });
  const [incomeForm, setIncomeForm] = useState({
    income_date: today, source_id: "", amount: "", payment_method: "CASH",
    bank_account_id: "", notes: "",
  });
  const [loanForm, setLoanForm] = useState({
    contact_id: "", amount: "", type: "taken" as "taken" | "given",
    loan_date: today, due_date: "", description: "",
  });
  const [loanTxForm, setLoanTxForm] = useState({
    loan_id: "", amount: "", transaction_date: today,
    type: "REPAYMENT" as "REPAYMENT" | "COLLECTION" | "INTEREST",
    payment_method: "CASH", bank_account_id: "", notes: "",
  });
  const [bankForm, setBankForm] = useState({
    name: "", bank_name: "", branch_name: "", account_number: "", initial_balance: "",
  });
  const [newCatName, setNewCatName] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newContact, setNewContact] = useState({ name: "", phone: "", address: "" });

  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isIncomeOpen, setIsIncomeOpen] = useState(false);
  const [isLoanOpen, setIsLoanOpen] = useState(false);
  const [isLoanTxOpen, setIsLoanTxOpen] = useState(false);
  const [loanTxMode, setLoanTxMode] = useState<"REPAYMENT" | "COLLECTION">("REPAYMENT");
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);

  // ---------- Mutations ----------
  const resetExpenseForm = () => {
    setExpenseForm({ expense_date: today, category_id: "", amount: "", payment_method: "CASH", bank_account_id: "", notes: "" });
    setEditingExpenseId(null);
  };
  const expenseMutation = useMutation({
    mutationFn: (d: any) => saveExpense({ data: d }),
    onSuccess: () => {
      toast.success("Expense added"); invalidateAll(); setIsExpenseOpen(false);
      resetExpenseForm();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const expenseEditMutation = useMutation({
    mutationFn: (d: any) => editExpense({ data: d }),
    onSuccess: () => {
      toast.success("Expense updated"); invalidateAll(); setIsExpenseOpen(false);
      resetExpenseForm();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const expenseDeleteMutation = useMutation({
    mutationFn: (id: string) => removeExpense({ data: { id } }),
    onSuccess: () => { toast.success("Expense deleted"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const incomeMutation = useMutation({
    mutationFn: (d: any) => saveIncome({ data: d }),
    onSuccess: () => {
      toast.success("Income added"); invalidateAll(); setIsIncomeOpen(false);
      setIncomeForm({ income_date: today, source_id: "", amount: "", payment_method: "CASH", bank_account_id: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const loanMutation = useMutation({
    mutationFn: (d: any) => saveLoan({ data: d }),
    onSuccess: () => {
      toast.success("Loan saved"); invalidateAll(); setIsLoanOpen(false);
      setLoanForm({ contact_id: "", amount: "", type: "taken", loan_date: today, due_date: "", description: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const loanTxMutation = useMutation({
    mutationFn: (d: any) => saveLoanTx({ data: d }),
    onSuccess: () => {
      toast.success("Transaction saved"); invalidateAll(); setIsLoanTxOpen(false);
      setLoanTxForm({ loan_id: "", amount: "", transaction_date: today, type: "REPAYMENT", payment_method: "CASH", bank_account_id: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bankMutation = useMutation({
    mutationFn: (d: any) => saveBank({ data: d }),
    onSuccess: () => {
      toast.success("Bank account saved"); invalidateAll(); setIsBankOpen(false);
      setBankForm({ name: "", bank_name: "", branch_name: "", account_number: "", initial_balance: "" });
      setEditingBankId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bankEditMutation = useMutation({
    mutationFn: (d: any) => editBank({ data: d }),
    onSuccess: () => {
      toast.success("Bank account updated"); invalidateAll(); setIsBankOpen(false);
      setBankForm({ name: "", bank_name: "", branch_name: "", account_number: "", initial_balance: "" });
      setEditingBankId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bankDeleteMutation = useMutation({
    mutationFn: (id: string) => removeBank({ data: { id } }),
    onSuccess: () => { toast.success("Bank account deleted"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const catMutation = useMutation({
    mutationFn: (name: string) => saveCat({ data: { name } }),
    onSuccess: (c) => {
      toast.success("Category added");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setExpenseForm(p => ({ ...p, category_id: c.id }));
      setNewCatName(""); setIsCatOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const sourceMutation = useMutation({
    mutationFn: (name: string) => saveSource({ data: { name } }),
    onSuccess: (s) => {
      toast.success("Source added");
      queryClient.invalidateQueries({ queryKey: ["income-sources"] });
      setIncomeForm(p => ({ ...p, source_id: s.id }));
      setNewSourceName(""); setIsSourceOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const contactMutation = useMutation({
    mutationFn: (d: any) => saveContact({ data: d }),
    onSuccess: (c) => {
      toast.success("Contact added");
      queryClient.invalidateQueries({ queryKey: ["loan-contacts"] });
      setLoanForm(p => ({ ...p, contact_id: c.id }));
      setNewContact({ name: "", phone: "", address: "" }); setIsContactOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateDueDate = useServerFn(updateLoanDueDate);
  const dueDateMutation = useMutation({
    mutationFn: (d: { loan_id: string; due_date: string | null }) => updateDueDate({ data: d }),
    onSuccess: () => {
      toast.success("Due date updated");
      queryClient.invalidateQueries({ queryKey: ["loans"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.category_id || !expenseForm.amount) return toast.error("Fill required fields");
    const payload = {
      ...expenseForm,
      amount: Number(expenseForm.amount),
      bank_account_id: expenseForm.payment_method === "BANK" ? expenseForm.bank_account_id : undefined,
    };
    if (editingExpenseId) {
      expenseEditMutation.mutate({ ...payload, id: editingExpenseId });
    } else {
      expenseMutation.mutate(payload);
    }
  };
  const startEditExpense = (e: any) => {
    setExpenseForm({
      expense_date: (e.expense_date || "").slice(0, 10),
      category_id: e.category_id || "",
      amount: String(e.amount ?? ""),
      payment_method: e.payment_method || "CASH",
      bank_account_id: e.bank_account_id || "",
      notes: e.notes || "",
    });
    setEditingExpenseId(e.id);
    setIsExpenseOpen(true);
  };
  const submitIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomeForm.source_id || !incomeForm.amount) return toast.error("Fill required fields");
    incomeMutation.mutate({
      ...incomeForm,
      amount: Number(incomeForm.amount),
      bank_account_id: incomeForm.payment_method === "BANK" ? incomeForm.bank_account_id : undefined,
    });
  };
  const submitLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.contact_id || !loanForm.amount) return toast.error("Fill required fields");
    loanMutation.mutate({
      ...loanForm,
      amount: Number(loanForm.amount),
      due_date: loanForm.due_date || undefined,
    });
  };
  const submitLoanTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanTxForm.loan_id || !loanTxForm.amount) return toast.error("Fill required fields");
    loanTxMutation.mutate({
      ...loanTxForm,
      amount: Number(loanTxForm.amount),
      bank_account_id: loanTxForm.payment_method === "BANK" ? loanTxForm.bank_account_id : undefined,
    });
  };
  const submitBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.name || !bankForm.bank_name) return toast.error("Provide account label & bank name");
    const payload = { ...bankForm, initial_balance: Number(bankForm.initial_balance || 0) };
    if (editingBankId) {
      bankEditMutation.mutate({ id: editingBankId, ...payload });
    } else {
      bankMutation.mutate(payload);
    }
  };
  const startEditBank = (b: any) => {
    setEditingBankId(b.id);
    setBankForm({
      name: b.name || "",
      bank_name: b.bank_name || "",
      branch_name: b.branch_name || "",
      account_number: b.account_number || "",
      initial_balance: String(b.initial_balance ?? ""),
    });
    setIsBankOpen(true);
  };
  const handleDeleteBank = (b: any) => {
    if (!confirm(`Delete bank account "${b.name}"? This cannot be undone.`)) return;
    bankDeleteMutation.mutate(b.id);
  };

  // ---------- Derived rows ----------
  const loanList = (loans || []) as any[];
  const loanTxRows = loanList.flatMap((l: any) =>
    ((l.loan_transactions || []) as any[]).map((t: any) => ({
      ...t,
      contact: l.loan_contacts?.name || "—",
      loan_type: l.type,
    }))
  ).filter((t: any) => {
    const d = (t.transaction_date || "").slice(0, 10);
    if (!d) return true;
    if (effFrom && d < effFrom) return false;
    if (effTo && d > effTo) return false;
    return true;
  }).sort((a: any, b: any) => (b.transaction_date || "").localeCompare(a.transaction_date || ""));

  // Filter loans by loan_date within the effective date range (defaults to current month)
  const loansFiltered = loanList.filter((l: any) => {
    const d = (l.loan_date || "").slice(0, 10);
    if (!d) return true;
    if (effFrom && d < effFrom) return false;
    if (effTo && d > effTo) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg">
            <PieChart className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Accounts Overview</h1>
            <p className="text-xs text-muted-foreground">Data entry for expenses, income, loans & bank accounts.</p>
          </div>
        </div>
        <div className="flex items-end gap-2 flex-wrap w-full sm:w-auto">
          <div className="flex flex-col flex-1 min-w-[130px]">
            <Label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
              <CalendarRange className="h-3 w-3" /> From
            </Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-full sm:w-[150px]" />
          </div>
          <div className="flex flex-col flex-1 min-w-[130px]">
            <Label className="text-[10px] text-muted-foreground mb-1">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-full sm:w-[150px]" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => { setFromDate(""); setToDate(""); }}
          >
            Reset
          </Button>
        </div>
      </div>

      <Tabs defaultValue="expenses" className="w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-max sm:grid sm:w-full sm:grid-cols-5">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="incomes">Others Income</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="loan-tx">Loan Transactions</TabsTrigger>
          <TabsTrigger value="banks">Bank Accounts</TabsTrigger>
          </TabsList>
        </div>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-600" /> Expenses ({(expenses || []).length})
                </h2>
                <Dialog open={isExpenseOpen} onOpenChange={(o) => { setIsExpenseOpen(o); if (!o) resetExpenseForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={() => resetExpenseForm()}>
                      <Plus className="mr-1 h-4 w-4" /> Add Expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={submitExpense}>
                      <DialogHeader>
                        <DialogTitle>{editingExpenseId ? "Edit Expense" : "Add Expense"}</DialogTitle>
                        <DialogDescription>Record a new expense.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FieldRow label="Date">
                          <Input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Category">
                          <div className="flex gap-2">
                            <Combobox className="flex-1"
                              options={categories?.map(c => ({ label: c.name, value: c.id })) || []}
                              value={expenseForm.category_id}
                              onValueChange={v => setExpenseForm({ ...expenseForm, category_id: v })}
                              placeholder="Select Category" />
                            <Dialog open={isCatOpen} onOpenChange={setIsCatOpen}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="px-2 h-10"><Plus className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
                                <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" />
                                <DialogFooter>
                                  <Button type="button" onClick={() => newCatName && catMutation.mutate(newCatName)}>Save</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </FieldRow>
                        <FieldRow label="Amount">
                          <Input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Method">
                          <Select value={expenseForm.payment_method} onValueChange={v => setExpenseForm({ ...expenseForm, payment_method: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">Cash</SelectItem>
                              <SelectItem value="BANK">Bank</SelectItem>
                              <SelectItem value="BKASH">bKash</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        {expenseForm.payment_method === "BANK" && (
                          <FieldRow label="Bank">
                            <Combobox options={banks?.map(b => ({ label: `${b.bank_name} (${b.name})`, value: b.id })) || []}
                              value={expenseForm.bank_account_id}
                              onValueChange={v => setExpenseForm({ ...expenseForm, bank_account_id: v })}
                              placeholder="Select Bank" />
                          </FieldRow>
                        )}
                        <FieldRow label="Notes">
                          <Input value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
                        </FieldRow>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={expenseMutation.isPending || expenseEditMutation.isPending}>
                          {(expenseMutation.isPending || expenseEditMutation.isPending) ? "Saving..." : "Save"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <ListTable
                headers={["Date", "Category", "Method", "Bank", "Notes", "Amount", "Actions"]}
                rows={(expenses || []).map((e: any) => [
                  e.expense_date,
                  e.expense_categories?.name || "—",
                  e.payment_method,
                  e.bank_accounts ? `${e.bank_accounts.bank_name} (${e.bank_accounts.name})` : "—",
                  e.notes || "—",
                  <span key="amt" className="font-bold text-rose-600">{fmt(e.amount)}</span>,
                  <div key="act" className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditExpense(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                      onClick={() => {
                        if (confirm("Delete this expense?")) expenseDeleteMutation.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>,
                ])}
                emptyMessage="No expenses for this period"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Others Income Tab */}
        <TabsContent value="incomes">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-indigo-600" /> Others Income ({(incomes || []).length})
                </h2>
                <Dialog open={isIncomeOpen} onOpenChange={setIsIncomeOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="mr-1 h-4 w-4" /> Add Income
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={submitIncome}>
                      <DialogHeader>
                        <DialogTitle>Add Income</DialogTitle>
                        <DialogDescription>Record income from non-billing sources.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FieldRow label="Date">
                          <Input type="date" value={incomeForm.income_date} onChange={e => setIncomeForm({ ...incomeForm, income_date: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Source">
                          <div className="flex gap-2">
                            <Combobox className="flex-1"
                              options={sources?.map(s => ({ label: s.name, value: s.id })) || []}
                              value={incomeForm.source_id}
                              onValueChange={v => setIncomeForm({ ...incomeForm, source_id: v })}
                              placeholder="Select Source" />
                            <Dialog open={isSourceOpen} onOpenChange={setIsSourceOpen}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="px-2 h-10"><Plus className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>Add Source</DialogTitle></DialogHeader>
                                <Input value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="Source name" />
                                <DialogFooter>
                                  <Button type="button" onClick={() => newSourceName && sourceMutation.mutate(newSourceName)}>Save</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </FieldRow>
                        <FieldRow label="Amount">
                          <Input type="number" value={incomeForm.amount} onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Method">
                          <Select value={incomeForm.payment_method} onValueChange={v => setIncomeForm({ ...incomeForm, payment_method: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">Cash</SelectItem>
                              <SelectItem value="BANK">Bank</SelectItem>
                              <SelectItem value="BKASH">bKash</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        {incomeForm.payment_method === "BANK" && (
                          <FieldRow label="Bank">
                            <Combobox options={banks?.map(b => ({ label: `${b.bank_name} (${b.name})`, value: b.id })) || []}
                              value={incomeForm.bank_account_id}
                              onValueChange={v => setIncomeForm({ ...incomeForm, bank_account_id: v })}
                              placeholder="Select Bank" />
                          </FieldRow>
                        )}
                        <FieldRow label="Notes">
                          <Input value={incomeForm.notes} onChange={e => setIncomeForm({ ...incomeForm, notes: e.target.value })} />
                        </FieldRow>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={incomeMutation.isPending}>{incomeMutation.isPending ? "Saving..." : "Save"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <ListTable
                headers={["Date", "Source", "Method", "Bank", "Notes", "Amount"]}
                rows={(incomes || []).map((i: any) => [
                  i.income_date,
                  i.income_sources?.name || i.source || "—",
                  i.payment_method,
                  i.bank_accounts ? `${i.bank_accounts.bank_name} (${i.bank_accounts.name})` : "—",
                  i.notes || "—",
                  <span key="amt" className="font-bold text-indigo-600">{fmt(i.amount)}</span>,
                ])}
                emptyMessage="No income entries for this period"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <HandCoins className="h-4 w-4 text-violet-600" /> Loans ({loansFiltered.length})
                </h2>
                <Dialog open={isLoanOpen} onOpenChange={setIsLoanOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                      <Plus className="mr-1 h-4 w-4" /> Add Loan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={submitLoan}>
                      <DialogHeader>
                        <DialogTitle>Add Loan</DialogTitle>
                        <DialogDescription>Record money borrowed from or given to someone.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FieldRow label="Contact">
                          <div className="flex gap-2">
                            <Combobox className="flex-1"
                              options={contacts?.map(c => ({ label: c.name, value: c.id })) || []}
                              value={loanForm.contact_id}
                              onValueChange={v => setLoanForm({ ...loanForm, contact_id: v })}
                              placeholder="Select Contact" />
                            <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="px-2 h-10"><Plus className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                                <div className="grid gap-2 py-2">
                                  <Input placeholder="Name" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
                                  <Input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} />
                                </div>
                                <DialogFooter>
                                  <Button type="button" onClick={() => newContact.name && contactMutation.mutate(newContact)}>Save</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </FieldRow>
                        <FieldRow label="Type">
                          <Select value={loanForm.type} onValueChange={(v: any) => setLoanForm({ ...loanForm, type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="taken">Taken</SelectItem>
                              <SelectItem value="given">Given</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        <FieldRow label="Amount">
                          <Input type="number" value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Date">
                          <Input type="date" value={loanForm.loan_date} onChange={e => setLoanForm({ ...loanForm, loan_date: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Due Date">
                          <Input type="date" value={loanForm.due_date} onChange={e => setLoanForm({ ...loanForm, due_date: e.target.value })} />
                        </FieldRow>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={loanMutation.isPending}>{loanMutation.isPending ? "Saving..." : "Save"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <ListTable
                headers={["Date", "Contact", "Type", "Status", "Due Date", "Description", "Amount"]}
                rows={loansFiltered.map((l: any) => {
                  let dueBadge: any = <span className="text-muted-foreground text-xs">—</span>;
                  if (l.due_date) {
                    const dd = new Date(l.due_date);
                    const days = Math.ceil((dd.getTime() - Date.now()) / 86400000);
                    const cls = l.status !== "ACTIVE" ? "bg-muted text-muted-foreground"
                      : days < 0 ? "bg-rose-100 text-rose-700"
                      : days <= 7 ? "bg-amber-100 text-amber-700"
                      : "bg-muted text-muted-foreground";
                    const suffix = l.status !== "ACTIVE" ? "" : days < 0 ? ` (${-days}d overdue)` : ` (${days}d)`;
                    dueBadge = <span className={`text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{l.due_date}{suffix}</span>;
                  }
                  const dueCell = (
                    <DueDateEditor
                      key="d"
                      current={l.due_date}
                      badge={dueBadge}
                      onSave={(v) => dueDateMutation.mutate({ loan_id: l.id, due_date: v })}
                    />
                  );
                  return [
                    l.loan_date,
                    l.loan_contacts?.name || "—",
                    <span key="t" className={`text-[10px] px-2 py-0.5 rounded-full ${l.type === "given" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {l.type === "given" ? "Given" : "Taken"}
                    </span>,
                    <span key="s" className={`text-[10px] px-2 py-0.5 rounded-full ${l.status === "ACTIVE" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {l.status}
                    </span>,
                    dueCell,
                    l.description || "—",
                    <span key="a" className={`font-bold ${l.type === "given" ? "text-emerald-600" : "text-rose-600"}`}>{fmt(l.amount)}</span>,
                  ];
                })}
                emptyMessage="No loans for this period"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loan Transactions Tab */}
        <TabsContent value="loan-tx">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-teal-600" /> Loan Transactions ({loanTxRows.length})
                </h2>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => {
                    setLoanTxMode("REPAYMENT");
                    setLoanTxForm({ loan_id: "", amount: "", transaction_date: today, type: "REPAYMENT", payment_method: "CASH", bank_account_id: "", notes: "" });
                    setIsLoanTxOpen(true);
                  }}>
                    <Plus className="mr-1 h-4 w-4" /> Add Repay
                  </Button>
                  <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={() => {
                    setLoanTxMode("COLLECTION");
                    setLoanTxForm({ loan_id: "", amount: "", transaction_date: today, type: "COLLECTION", payment_method: "CASH", bank_account_id: "", notes: "" });
                    setIsLoanTxOpen(true);
                  }}>
                    <Plus className="mr-1 h-4 w-4" /> Add Receive
                  </Button>
                </div>
                <Dialog open={isLoanTxOpen} onOpenChange={setIsLoanTxOpen}>
                  <DialogContent>
                    <form onSubmit={submitLoanTx}>
                      <DialogHeader>
                        <DialogTitle>{loanTxMode === "REPAYMENT" ? "Add Repay" : "Add Receive"}</DialogTitle>
                        <DialogDescription>
                          {loanTxMode === "REPAYMENT"
                            ? "Select from taken loans to record a repayment."
                            : "Select from given loans to record a receipt."}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FieldRow label="Date">
                          <Input type="date" value={loanTxForm.transaction_date} onChange={e => setLoanTxForm({ ...loanTxForm, transaction_date: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Loan">
                          <Combobox
                            options={loanList
                              .filter(l => l.status === "ACTIVE" && l.type === (loanTxMode === "REPAYMENT" ? "taken" : "given"))
                              .map((l: any) => {
                                const paid = ((l.loan_transactions || []) as any[]).reduce((s, t) => s + Number(t.amount || 0), 0);
                                const outstanding = Number(l.amount || 0) - paid;
                                return {
                                  label: `${l.loan_contacts?.name || "—"} • বাকি ${fmt(outstanding)} / ${fmt(l.amount)}`,
                                  value: l.id,
                                };
                              })}
                            value={loanTxForm.loan_id}
                            onValueChange={v => setLoanTxForm({ ...loanTxForm, loan_id: v, type: loanTxMode })}
                            placeholder={loanTxMode === "REPAYMENT" ? "Select Taken Loan" : "Select Given Loan"} />
                        </FieldRow>
                        <FieldRow label="Amount">
                          <Input type="number" value={loanTxForm.amount} onChange={e => setLoanTxForm({ ...loanTxForm, amount: e.target.value })} />
                        </FieldRow>
                        <FieldRow label="Method">
                          <Select value={loanTxForm.payment_method} onValueChange={v => setLoanTxForm({ ...loanTxForm, payment_method: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">Cash</SelectItem>
                              <SelectItem value="BANK">Bank</SelectItem>
                            </SelectContent>
                          </Select>
                        </FieldRow>
                        {loanTxForm.payment_method === "BANK" && (
                          <FieldRow label="Bank">
                            <Combobox options={banks?.map(b => ({ label: `${b.bank_name} (${b.name})`, value: b.id })) || []}
                              value={loanTxForm.bank_account_id}
                              onValueChange={v => setLoanTxForm({ ...loanTxForm, bank_account_id: v })}
                              placeholder="Select Bank" />
                          </FieldRow>
                        )}
                        <FieldRow label="Notes">
                          <Input value={loanTxForm.notes} onChange={e => setLoanTxForm({ ...loanTxForm, notes: e.target.value })} />
                        </FieldRow>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={loanTxMutation.isPending}>{loanTxMutation.isPending ? "Saving..." : "Save"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <ListTable
                headers={["Date", "Contact", "Loan Type", "Tx Type", "Method", "Notes", "Amount"]}
                rows={loanTxRows.map((t: any) => [
                  t.transaction_date,
                  t.contact,
                  t.loan_type,
                  <span key="tt" className={`text-[10px] px-2 py-0.5 rounded-full ${t.type === "COLLECTION" ? "bg-sky-100 text-sky-700" : "bg-teal-100 text-teal-700"}`}>
                    {t.type === "COLLECTION" ? "Receive" : t.type === "REPAYMENT" ? "Repay" : t.type}
                  </span>,
                  t.payment_method,
                  t.notes || "—",
                  <span key="a" className={`font-bold ${t.type === "COLLECTION" ? "text-sky-700" : "text-teal-700"}`}>{fmt(t.amount)}</span>,
                ])}
                emptyMessage="No transactions for this period"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bank Accounts Tab */}
        <TabsContent value="banks">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-blue-600" /> Bank Accounts ({(banks || []).length})
                </h2>
                <Dialog
                  open={isBankOpen}
                  onOpenChange={(open) => {
                    setIsBankOpen(open);
                    if (!open) {
                      setEditingBankId(null);
                      setBankForm({ name: "", bank_name: "", branch_name: "", account_number: "", initial_balance: "" });
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-1 h-4 w-4" /> Add Bank
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={submitBank}>
                      <DialogHeader>
                        <DialogTitle>{editingBankId ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <FieldRow label="Label"><Input value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} placeholder="e.g. Main Operations" /></FieldRow>
                        <FieldRow label="Bank Name"><Input value={bankForm.bank_name} onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })} /></FieldRow>
                        <FieldRow label="Branch"><Input value={bankForm.branch_name} onChange={e => setBankForm({ ...bankForm, branch_name: e.target.value })} /></FieldRow>
                        <FieldRow label="Account No"><Input value={bankForm.account_number} onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })} /></FieldRow>
                        <FieldRow label="Initial Balance"><Input type="number" value={bankForm.initial_balance} onChange={e => setBankForm({ ...bankForm, initial_balance: e.target.value })} /></FieldRow>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={bankMutation.isPending || bankEditMutation.isPending}>
                          {editingBankId ? "Update" : "Save"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <ListTable
                headers={["Label", "Bank", "Branch", "Account No", "Initial", "Current", "Actions"]}
                rows={(banks || []).map((b: any) => {
                  const live = bankBalances?.bankBalances?.find((x: any) => x.id === b.id);
                  return [
                    b.name,
                    b.bank_name || "—",
                    b.branch_name || "—",
                    b.account_number || "—",
                    <span key="i" className="font-medium">{fmt(b.initial_balance)}</span>,
                    <span key="c" className="font-bold text-blue-700">{fmt(live?.current_balance ?? b.initial_balance)}</span>,
                    <div key="a" className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEditBank(b)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => handleDeleteBank(b)} aria-label="Delete" disabled={bankDeleteMutation.isPending}>
                        <TrendingDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>,
                  ];
                })}
                emptyMessage="No bank accounts"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label className="text-right">{label}</Label>
      <div className="col-span-3">{children}</div>
    </div>
  );
}

function ListTable({
  headers, rows, emptyMessage,
}: { headers: string[]; rows: React.ReactNode[][]; emptyMessage: string }) {
  return (
    <div className="relative overflow-x-auto border rounded-lg max-h-[600px] overflow-y-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-muted sticky top-0">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`px-4 py-3 ${i === headers.length - 1 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {emptyMessage}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2 ${j === row.length - 1 ? "text-right" : ""}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DueDateEditor({
  current,
  badge,
  onSave,
}: {
  current: string | null;
  badge: React.ReactNode;
  onSave: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(current ? current.slice(0, 10) : "");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(current ? current.slice(0, 10) : ""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 hover:opacity-80">
          {badge}
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" align="start">
        <Label className="text-xs">Due Date</Label>
        <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} />
        <div className="flex justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { onSave(null); setOpen(false); }}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => { onSave(val || null); setOpen(false); }}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

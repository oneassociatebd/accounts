import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import {
  searchCustomersForBill,
  getCustomerForBill,
  listServiceItemsForBill,
  previewBillTotals,
  createBill,
  updateBill,
  getBill,
  listFinalizedVatMonths,
  getBillMonthSubmissions,
} from "@/lib/billing.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/searchable-select";
import { Search, Plus, Trash2, FileText, Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";


const billsNewSearchSchema = z.object({
  editId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().optional(),
  fromPage: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/_authenticated/bills/new")({
  head: () => ({
    meta: [{ title: "One | New Bill" }],
  }),
  component: NewBill,
  validateSearch: billsNewSearchSchema,
});


type LineRow = { id: string; service_item_id: string; qty: string };

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmt(n: number) {
  return n.toFixed(2);
}



function NewBill() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  if (!can("bills.create")) {
    return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You don't have permission to create bills. Contact an administrator.
        </CardContent>
      </Card>
    );
  }

  const { editId, customerId: prefCustomerId, month: prefMonth, from, fromPage } = Route.useSearch();
  const isEditing = !!editId;
  const searchFn = useServerFn(searchCustomersForBill);
  const getCust = useServerFn(getCustomerForBill);
  const listItems = useServerFn(listServiceItemsForBill);
  const preview = useServerFn(previewBillTotals);
  const create = useServerFn(createBill);
  const update = useServerFn(updateBill);
  const getBillFn = useServerFn(getBill);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>(prefCustomerId ?? "");
  const [billDate, setBillDate] = useState(todayISO());
  const [billDateOpen, setBillDateOpen] = useState(false);
  const [billingMonth, setBillingMonth] = useState(prefMonth ?? "");
  
  const [discount, setDiscount] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    { id: crypto.randomUUID(), service_item_id: "", qty: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [editBillNo, setEditBillNo] = useState<string>("");

  // Load existing bill for editing
  const { data: editBillData } = useQuery({
    queryKey: ["bill-edit", editId],
    queryFn: () => getBillFn({ data: { id: editId! } }),
    enabled: !!editId,
  });

  useEffect(() => {
    if (!editBillData || prefilled) return;
    if (!editBillData.is_latest) {
      toast.error("Only the most recent bill can be edited");
      navigate({ to: "/bills/$id", params: { id: editId! } });
      return;
    }
    const b = editBillData.bill as any;
    setCustomerId(b.customer_id);
    setBillDate(b.bill_date);
    setBillingMonth(String(b.billing_month).slice(0, 7));
    setDiscount(Number(b.discount_amount || 0).toFixed(2));
    setNotes(b.notes || "");
    setEditBillNo(b.bill_no || "");
    const items = (editBillData.items as any[]) || [];
    setLines(
      items.length
        ? items.map((it) => ({
            id: crypto.randomUUID(),
            service_item_id: it.service_item_id,
            qty: String(it.qty),
          }))
        : [{ id: crypto.randomUUID(), service_item_id: "", qty: "" }],
    );
    setPrefilled(true);
  }, [editBillData, prefilled, editId, navigate]);


  const errors = useMemo(() => {
    const lineErrs: Record<string, { service?: string; qty?: string }> = {};
    lines.forEach((l) => {
      const e: { service?: string; qty?: string } = {};
      const hasService = !!l.service_item_id;
      const qtyNum = Number(l.qty);
      const hasQty = l.qty !== "" && Number.isFinite(qtyNum) && qtyNum > 0;
      if (hasService && !hasQty) e.qty = "Quantity must be greater than 0";
      if (!hasService && hasQty) e.service = "Select a service";
      if (Object.keys(e).length) lineErrs[l.id] = e;
    });
    const anyValid = lines.some((l) => l.service_item_id && Number(l.qty) > 0);
    return {
      billingMonth: !billingMonth ? "Billing Month is required" : "",
      billDate: !billDate ? "Billing Date is required" : "",
      items: !anyValid ? "Add at least one service with quantity" : "",
      lines: lineErrs,
    };
  }, [billingMonth, billDate, lines]);

  const { data: items = [] } = useQuery({
    queryKey: ["bill-service-items", customerId || null],
    queryFn: () => listItems(customerId ? { data: { customer_id: customerId } } : undefined as any),
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["bill-customer-search", search],
    queryFn: () => (search.trim().length >= 2 ? searchFn({ data: { q: search.trim() } }) : Promise.resolve([])),
    enabled: search.trim().length >= 2 && searchOpen,
  });

  const { data: customer } = useQuery({
    queryKey: ["bill-customer", customerId],
    queryFn: () => getCust({ data: { id: customerId } }),
    enabled: !!customerId,
    staleTime: 300000, // Keep customer info fresh for 5 mins
  });

  const vatMonthsFn = useServerFn(listFinalizedVatMonths);
  const { data: allowedMonths = [], isLoading: monthsLoading } = useQuery({
    queryKey: ["bill-allowed-months", customerId],
    queryFn: () => vatMonthsFn({ data: { customer_id: customerId } }),
    enabled: !!customerId,
  });
  const allowedMonthSet = useMemo(
    () => new Set((allowedMonths as Array<{ billing_month: string }>).map((m) => m.billing_month.slice(0, 7))),
    [allowedMonths],
  );

  // Default billing month to previous month if it's an allowed option
  useEffect(() => {
    if (isEditing || billingMonth) return;
    if (monthsLoading || !customerId) return;
    const prev = previousMonth().slice(0, 7);
    if (allowedMonthSet.has(prev)) setBillingMonth(prev);
  }, [isEditing, billingMonth, monthsLoading, customerId, allowedMonthSet]);

  const monthSubsFn = useServerFn(getBillMonthSubmissions);
  const { data: monthSubs } = useQuery({
    queryKey: ["bill-month-subs", customerId, billingMonth],
    queryFn: () => monthSubsFn({ data: { customer_id: customerId, month: billingMonth } }),
    enabled: !!customerId && /^\d{4}-\d{2}$/.test(billingMonth),
  });


  const previewInput = useMemo(() => {
    const validLines = lines
      .filter((l) => l.service_item_id && Number(l.qty) > 0)
      .map((l) => ({ service_item_id: l.service_item_id, qty: Number(l.qty) }));
    return {
      customer_id: customerId,
      bill_date: billDate,
      discount_amount: Number(discount) || 0,
      items: validLines,
      ...(editId ? { exclude_bill_id: editId } : {}),
    };
  }, [customerId, billDate, discount, lines, editId]);

  const { data: totals } = useQuery({
    queryKey: ["bill-preview", previewInput],
    queryFn: () => preview({ data: previewInput }),
    enabled: !!customerId && previewInput.items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60000, // 1 minute stale time
    gcTime: 300000, // Keep in garbage collector for 5 minutes
  });

  const addLine = () =>
    setLines((l) => [...l, { id: crypto.randomUUID(), service_item_id: "", qty: "" }]);
  const removeLine = (id: string) =>
    setLines((l) => {
      if (l.length > 1) return l.filter((x) => x.id !== id);
      return [{ id: crypto.randomUUID(), service_item_id: "", qty: "" }];
    });
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const handleReset = () => {
    if (isEditing) {
      navigate({ to: "/bills/$id", params: { id: editId! } });
      return;
    }
    setSearch("");
    setSearchOpen(false);
    setCustomerId("");
    setBillDate(todayISO());
    setBillingMonth("");
    setDiscount("0.00");
    setNotes("");
    setLines([{ id: crypto.randomUUID(), service_item_id: "", qty: "" }]);
    setShowErrors(false);
  };

  const submit = async (status: "DRAFT" | "FINALIZED") => {
    setShowErrors(true);
    if (!customerId) return toast.error("Select a customer");
    if (errors.billingMonth) return toast.error(errors.billingMonth);
    if (!allowedMonthSet.has(billingMonth))
      return toast.error("Selected month has no finalized VAT submission for this customer");
    if (errors.billDate) return toast.error(errors.billDate);
    if (customer && !customer.customer.is_active) return toast.error("Customer is disabled");
    const validLines = lines.filter((l) => l.service_item_id && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error(errors.items || "At least one item required");
    setBusy(true);
    try {
      const payload = {
        customer_id: customerId,
        bill_date: billDate,
        billing_month: `${billingMonth}-01`,
        discount_amount: Number(discount) || 0,
        status,
        notes,
        items: validLines.map((l) => ({
          service_item_id: l.service_item_id,
          qty: Number(l.qty),
        })),
      };
      const backSearch: Record<string, unknown> = {};
      if (from) backSearch.from = from;
      if (fromPage) backSearch.fromPage = fromPage;
      if (isEditing) {
        await update({ data: { ...payload, id: editId! } });
        toast.success(`Invoice ${editBillNo} updated`);
        await qc.prefetchQuery({ queryKey: ["bill", editId!], queryFn: () => getBillFn({ data: { id: editId! } }) });
        navigate({ to: "/bills/$id", params: { id: editId! }, search: backSearch, replace: true });
      } else {
        const res = await create({ data: payload });
        toast.success(`Invoice ${res.bill_no} created`);
        await qc.prefetchQuery({ queryKey: ["bill", res.id], queryFn: () => getBillFn({ data: { id: res.id } }) });
        navigate({ to: "/bills/$id", params: { id: res.id }, search: backSearch, replace: true });
      }
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };


  const canSubmit =
    !!customerId &&
    !!customer?.customer.is_active &&
    !!billingMonth &&
    allowedMonthSet.has(billingMonth) &&
    !!billDate &&
    lines.some((l) => l.service_item_id && Number(l.qty) > 0);

  const itemOpts = (items as Array<{ id: string; item_name: string }>).map((i) => ({
    value: i.id,
    label: i.item_name,
  }));

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">{isEditing ? `Edit Bill ${editBillNo}` : "New Bill"}</h1>
        <p className="text-sm text-muted-foreground">{isEditing ? "Update this bill" : "Create a new service bill"}</p>
      </div>


      {/* Header */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Bill Header</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-12">
            <div className="space-y-2 md:col-span-8">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by BIN, company name, or mobile..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  className="pl-8"
                />
                {searchOpen && search.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
                    {searchResults.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No matches</div>
                    ) : (
                      searchResults.map((c: any) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCustomerId(c.id);
                            setSearch(c.company_name || c.name);
                            setSearchOpen(false);
                            setLines([{ id: crypto.randomUUID(), service_item_id: "", qty: "" }]);
                            setDiscount("0");
                            setNotes("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                        >
                          <div className="font-medium">
                            {c.company_name || c.name}
                            {c.customer_type?.type_name && ` (${c.customer_type.type_name})`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            BIN: {c.bin_number || "-"} · {c.mobile || "-"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Billing Month <span className="text-destructive">*</span></Label>
              <Select
                value={billingMonth}
                onValueChange={setBillingMonth}
                disabled={!customerId || monthsLoading || (allowedMonths as any[]).length === 0}
              >
                <SelectTrigger className={showErrors && !!errors.billingMonth ? "border-destructive" : ""}>
                  <SelectValue
                    placeholder={
                      !customerId
                        ? "Select customer first"
                        : monthsLoading
                          ? "Loading..."
                          : (allowedMonths as any[]).length === 0
                            ? "No finalized VAT"
                            : "Select month"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(allowedMonths as Array<{ billing_month: string; submission_id: string }>).map((m) => {
                    const ym = m.billing_month.slice(0, 7);
                    return (
                      <SelectItem key={ym} value={ym}>
                        {ym} — #{m.submission_id}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {customerId && !monthsLoading && (allowedMonths as any[]).length === 0 && (
                <p className="text-xs text-destructive">
                  No finalized VAT submission exists for this customer. Finalize a submission first.
                </p>
              )}
              {showErrors && errors.billingMonth && (allowedMonths as any[]).length > 0 && (
                <p className="text-xs text-destructive">{errors.billingMonth}</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Billing Date <span className="text-destructive">*</span></Label>
              <Popover open={billDateOpen} onOpenChange={setBillDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal text-sm px-3",
                      !billDate && "text-muted-foreground",
                      showErrors && errors.billDate && "border-destructive",
                    )}
                  >
                    {billDate ? format(parseISO(billDate), "dd/MM/yyyy") : "Pick date"}
                    <CalendarIcon className="h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={billDate ? parseISO(billDate) : undefined}
                    defaultMonth={billDate ? parseISO(billDate) : new Date()}
                    onSelect={(d) => { setBillDate(d ? format(d, "yyyy-MM-dd") : ""); setBillDateOpen(false); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {showErrors && errors.billDate && (
                <p className="text-xs text-destructive">{errors.billDate}</p>
              )}
            </div>
          </div>

          {customer && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
                <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">Company Name</div><div className="font-medium truncate">{customer.customer.company_name || customer.customer.name}</div></div>
                <div><div className="text-xs text-muted-foreground">Mobile</div><div className="font-mono">{customer.customer.mobile || "-"}</div></div>
                <div><div className="text-xs text-muted-foreground">BIN</div><div className="font-mono">{customer.customer.bin_number || "-"}</div></div>
                <div><div className="text-xs text-muted-foreground">Area</div><div>{customer.customer.area?.area_name || "-"}</div></div>
                <div><div className="text-xs text-muted-foreground">Reference</div><div>{customer.customer.ref?.reference_name || "-"}</div></div>
                <div>
                  <div className="text-xs text-muted-foreground">Previous Balance</div>
                  {(() => {
                    const bal = totals?.previous_balance ?? customer.current_balance;
                    return (
                      <div className={bal < 0 ? "text-destructive font-medium" : bal > 0 ? "text-green-600 font-medium" : ""}>
                        {bal < 0 ? `-${fmt(-bal)}` : bal > 0 ? `+${fmt(bal)}` : "0.00"}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={customer.customer.is_active ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                    {customer.customer.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
              {!customer.customer.is_active && (
                <div className="mt-2 text-destructive text-xs">⚠ Customer is disabled — cannot create bill</div>
              )}
            </div>
          )}

          {customerId && billingMonth && (
            <div className="rounded-md border bg-blue-50/50 dark:bg-blue-950/20 p-3 text-sm space-y-2">
              <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Submissions for {billingMonth}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">VAT Return (9.1)</div>
                  {monthSubs?.vat ? (
                    <div className="text-green-700 dark:text-green-400">
                      ✓ Finalized — <span className="font-mono">#{monthSubs.vat.submission_id}</span>
                      {monthSubs.vat.submission_date && (
                        <span className="text-muted-foreground"> on {monthSubs.vat.submission_date}</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-destructive">✗ No finalized VAT return</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Mushak 4.3 {monthSubs?.mushak?.length ? `(${monthSubs.mushak.length})` : ""}
                  </div>
                  {monthSubs?.mushak && monthSubs.mushak.length > 0 ? (
                    <ul className="space-y-0.5 max-h-32 overflow-auto">
                      {monthSubs.mushak.map((m) => (
                        <li key={m.submission_id} className="text-green-700 dark:text-green-400">
                          ✓ <span className="font-mono">#{m.submission_id}</span>
                          <span className="text-foreground"> — {m.item_name}</span>
                          <span className="text-muted-foreground"> ({m.submission_date})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-muted-foreground">No finalized Mushak 4.3 in this month</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">2. Bill Items</CardTitle>
          <Button type="button" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1" />Add Row</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-2 w-12">#</th>
                  <th className="py-2 px-2">Service Item</th>
                  <th className="py-2 px-2 w-32">Quantity</th>
                  <th className="py-2 px-2 w-32 text-right">Total</th>
                  <th className="py-2 px-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const calc = totals?.lines?.find(
                    (x: any) => x.service_item_id === l.service_item_id,
                  );
                  const lineErr = showErrors ? errors.lines[l.id] : undefined;
                  return (
                    <tr key={l.id} className="border-b align-top">
                      <td className="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className={cn(lineErr?.service && "ring-1 ring-destructive rounded-md")}>
                          <SearchableSelect
                            options={itemOpts}
                            value={l.service_item_id || null}
                            onChange={(v) => {
                              const newQty = v ? (!l.qty ? "1" : l.qty) : "";
                              updateLine(l.id, { service_item_id: v ?? "", qty: newQty });
                            }}
                            placeholder="Select service"
                          />
                        </div>
                        {lineErr?.service && (
                          <p className="text-xs text-destructive mt-1">{lineErr.service}</p>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.qty}
                          onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                          className={cn(lineErr?.qty && "border-destructive")}
                        />
                        {lineErr?.qty && (
                          <p className="text-xs text-destructive mt-1">{lineErr.qty}</p>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          readOnly
                          tabIndex={-1}
                          value={calc ? fmt(calc.final_amount) : "0.00"}
                          className="text-right font-mono bg-muted/50"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {totals && lines.some((l) => l.service_item_id) && (
                  <tr className="border-t-2 border-foreground/20 font-semibold align-top">
                    <td className="py-2 px-2" colSpan={3}>
                      <span className="text-muted-foreground">Grand Total</span>
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        readOnly
                        tabIndex={-1}
                        value={fmt(totals.subtotal ?? 0)}
                        className="text-right font-mono bg-muted/50 font-semibold"
                      />
                    </td>
                    <td className="py-2 px-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {showErrors && errors.items && (
            <p className="text-xs text-destructive mt-2">{errors.items}</p>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">3. Bill Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            {(() => {
              const signed = (totals?.previous_advance ?? 0) - (totals?.previous_due ?? 0);
              const totalPayable = (totals?.subtotal ?? 0) - signed;
              const discountNum = Number(discount) || 0;
              const current = totalPayable - discountNum;
              const prevDisplay = signed < 0 ? `-${fmt(-signed)}` : fmt(signed);
              const payableDisplay = totalPayable > 0 ? fmt(totalPayable) : totalPayable < 0 ? `-${fmt(-totalPayable)}` : fmt(0);
              const netDisplay = current > 0 ? `-${fmt(current)}` : current < 0 ? fmt(-current) : fmt(0);
              return (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Previous Balance</span>
                    <Input
                      readOnly
                      tabIndex={-1}
                      value={prevDisplay}
                      className={`w-32 text-right font-mono bg-muted/50 ${signed < 0 ? "text-destructive" : signed > 0 ? "text-green-600" : ""}`}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Current Bill</span>
                    <Input
                      readOnly
                      tabIndex={-1}
                      value={fmt(totals?.subtotal ?? 0)}
                      className="w-32 text-right font-mono bg-muted/50"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Payable</span>
                    <Input
                      readOnly
                      tabIndex={-1}
                      value={payableDisplay}
                      className="w-32 text-right font-mono bg-muted/50"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Discount</span>
                    <Input type="text" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} onBlur={() => setDiscount((d) => { const n = Number(d); return Number.isFinite(n) ? n.toFixed(2) : "0.00"; })} className="w-32 text-right font-mono" />
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold items-center">
                    <span>Current Balance</span>
                    <Input
                      readOnly
                      tabIndex={-1}
                      value={netDisplay}
                      className={`w-32 text-right font-mono bg-muted/50 ${current > 0 ? "text-destructive" : current < 0 ? "text-green-600" : ""}`}
                    />
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleReset} disabled={busy}>
              <RotateCcw className="h-4 w-4 mr-1" /> {isEditing ? "Cancel" : "Reset"}
            </Button>
            <Button type="button" variant="outline" onClick={() => submit("DRAFT")} disabled={busy || !canSubmit}>
              {isEditing ? "Save as Draft" : "Save Draft"}
            </Button>
            <Button type="button" onClick={() => submit("FINALIZED")} disabled={busy || !canSubmit}>
              <FileText className="h-4 w-4 mr-1" /> {isEditing ? "Save & Finalize" : "Finalize Bill"}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

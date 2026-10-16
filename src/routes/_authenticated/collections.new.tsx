import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  searchCustomersForCollection,
  getCustomerForCollection,
  createCollection,
  updateCollection,
  getCollection,
  listCollectors,
  listBankAccountsForCollection,
} from "@/lib/collection.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";


const searchSchema = z.object({ editId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/collections/new")({
  head: () => ({
    meta: [{ title: "One | New Collection" }],
  }),
  component: NewCollection,
  validateSearch: searchSchema,
});

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BKASH", label: "bKash" },
  { value: "NAGAD", label: "Nagad" },
  { value: "ROCKET", label: "Rocket" },
  { value: "BANK", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);

function NewCollection() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  if (!can("collections.create")) {
    return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You don't have permission to create collections. Contact an administrator.
        </CardContent>
      </Card>
    );
  }

  const { editId } = Route.useSearch();
  const isEditing = !!editId;

  const searchFn = useServerFn(searchCustomersForCollection);
  const getCustomerFn = useServerFn(getCustomerForCollection);
  const createFn = useServerFn(createCollection);
  const updateFn = useServerFn(updateCollection);
  const getFn = useServerFn(getCollection);
  const listCollectorsFn = useServerFn(listCollectors);
  const listBanksFn = useServerFn(listBankAccountsForCollection);

  const [customerId, setCustomerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collectionDate, setCollectionDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [collectedBy, setCollectedBy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Load edit data
  const { data: editData } = useQuery({
    queryKey: ["collection", editId],
    queryFn: () => getFn({ data: { id: editId! } }),
    enabled: isEditing,
  });

  useEffect(() => {
    if (!editData || prefilled) return;
    const c: any = editData.collection;
    setCustomerId(c.customer_id);
    setCollectionDate(String(c.collection_date).slice(0, 10));
    setAmount(String(c.amount));
    setPaymentMethod(c.payment_method);
    setReferenceNo(c.reference_no || "");
    setCollectedBy(c.collected_by);
    setNotes(c.notes || "");
    setBankAccountId(c.bank_account_id || "");
    setPrefilled(true);
  }, [editData, prefilled]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["coll-customer-search", search],
    queryFn: () =>
      search.trim().length >= 2
        ? searchFn({ data: { q: search.trim() } })
        : Promise.resolve([] as any[]),
    enabled: search.trim().length >= 2 && searchOpen,
  });

  const { data: customerInfo } = useQuery({
    queryKey: ["coll-customer", customerId, editId ?? null],
    queryFn: () =>
      getCustomerFn({
        data: { id: customerId, ...(editId ? { exclude_collection_id: editId } : {}) },
      }),
    enabled: !!customerId,
  });

  const amountNum = Number(amount) || 0;
  const balance = customerInfo?.current_balance ?? 0;
  const previousDue = balance < 0 ? -balance : 0;
  const previousAdvance = balance > 0 ? balance : 0;
  const newBalance = balance + amountNum;

  const { data: collectors = [] } = useQuery({
    queryKey: ["collectors"],
    queryFn: () => listCollectorsFn(),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["coll-banks"],
    queryFn: () => listBanksFn(),
  });

  const handleSubmit = async () => {
    if (!customerId) return toast.error("Select a customer");
    if (amountNum <= 0) return toast.error("Amount must be greater than 0");
    if (paymentMethod === "BANK" && !bankAccountId) {
      return toast.error("Select the bank account for this transfer");
    }

    const payload = {
      customer_id: customerId,
      collection_date: collectionDate,
      amount: amountNum,
      payment_method: paymentMethod as
        | "CASH" | "BKASH" | "NAGAD" | "ROCKET" | "BANK" | "CHEQUE" | "OTHER",
      reference_no: referenceNo,
      notes,
      collected_by: collectedBy,
      bank_account_id: paymentMethod === "BANK" ? bankAccountId : null,
      allocations: [],
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateFn({ data: { ...payload, id: editId! } });
        toast.success("Collection updated");
      } else {
        const res = await createFn({ data: payload });
        toast.success(`Collection saved (${res.receipt_no})`);
      }
      qc.invalidateQueries({ queryKey: ["dash-bs"] });
      qc.invalidateQueries({ queryKey: ["balance-sheet"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      navigate({ to: "/collections" });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/collections" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Wallet className="h-5 w-5" /> {isEditing ? "Edit Collection" : "New Collection"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Record a payment received from a customer
            </p>
          </div>
        </div>
      </div>

      {/* Customer */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Customer</CardTitle></CardHeader>
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
                  disabled={isEditing}
                />
                {searchOpen && !isEditing && search.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
                    {searchResults.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No matches</div>
                    ) : (
                      (searchResults as any[]).map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCustomerId(c.id);
                            setSearch(c.company_name || c.name);
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                        >
                          <div className="font-medium">{c.company_name || c.name}</div>
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
              <Label className="text-xs">Collection Date *</Label>
              <Input
                type="date"
                value={collectionDate}
                max={todayISO()}
                onChange={(e) => setCollectionDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="text-right font-mono"
              />
            </div>
          </div>

          {customerInfo && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Company Name</div>
                  <div className="font-medium truncate">
                    {customerInfo.customer.company_name || customerInfo.customer.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Mobile</div>
                  <div className="font-mono">{customerInfo.customer.mobile || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">BIN</div>
                  <div className="font-mono">{customerInfo.customer.bin_number || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Area</div>
                  <div>{customerInfo.customer.area?.area_name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Reference</div>
                  <div>{(customerInfo.customer as any).ref?.reference_name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Previous Due</div>
                  <div className={previousDue > 0 ? "text-destructive font-medium font-mono" : "font-mono"}>
                    {fmt(previousDue)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Previous Advance</div>
                  <div className={previousAdvance > 0 ? "text-green-600 font-medium font-mono" : "font-mono"}>
                    {fmt(previousAdvance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={customerInfo.customer.is_active ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                    {customerInfo.customer.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment details */}
      <Card>
        <CardHeader><CardTitle className="text-base">2. Payment Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference No</Label>
              <Input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Trx ID, cheque no..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Collected By</Label>
              <Select
                value={collectedBy ?? "__self__"}
                onValueChange={(v) => setCollectedBy(v === "__self__" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Self" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Self (current user)</SelectItem>
                  {(collectors as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === "BANK" && (
              <div className="space-y-1.5">
                <Label>Bank Account *</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts as any[]).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{b.bank_name ? ` (${b.bank_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {customerInfo && amountNum > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div className="flex justify-between border rounded p-2">
                <span className="text-muted-foreground">Previous Balance</span>
                <span className={`font-mono font-semibold ${balance < 0 ? "text-destructive" : balance > 0 ? "text-green-600" : ""}`}>
                  {balance < 0 ? `-${fmt(-balance)}` : fmt(balance)}
                </span>
              </div>
              <div className="flex justify-between border rounded p-2">
                <span className="text-muted-foreground">Collection</span>
                <span className="font-mono font-semibold text-green-600">+{fmt(amountNum)}</span>
              </div>
              <div className="flex justify-between border rounded p-2 bg-muted/30">
                <span className="text-muted-foreground">New Balance</span>
                <span className={`font-mono font-semibold ${newBalance < 0 ? "text-destructive" : newBalance > 0 ? "text-green-600" : ""}`}>
                  {newBalance < 0 ? `-${fmt(-newBalance)}` : fmt(newBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/collections" })}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving || !customerId || amountNum <= 0}>
          {saving ? "Saving..." : isEditing ? "Update Collection" : "Save Collection"}
        </Button>
      </div>
    </div>
  );
}

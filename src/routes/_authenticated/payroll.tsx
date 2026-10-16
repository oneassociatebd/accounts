import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { listServiceItems } from "@/lib/erp.functions";
import { listManagers } from "@/lib/erp.functions";
import {
  listManagerRates, upsertManagerRate, deleteManagerRate,
  listPendingEarnings, listPayouts, recordPayout, resendPayoutSms,
  backfillEarnings,
} from "@/lib/payroll.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Banknote, Wallet, History, Send, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({ meta: [{ title: "One | Payroll" }] }),
  component: PayrollPage,
});

type Manager = { id: string; name: string; username: string };
type ServiceItem = { id: string; item_name: string; is_active: boolean };
type Rate = {
  id: string;
  manager_id: string | null;
  service_item_id: string;
  rate: number;
  effective_from: string;
  created_at: string;
};
type Earning = {
  id: string;
  manager_id: string;
  bill_id: string;
  service_item_id: string;
  billing_month: string;
  qty: number;
  rate: number;
  amount: number;
  status: string;
  created_at: string;
};
type Payout = {
  id: string;
  manager_id: string;
  period_month: string;
  amount: number;
  payment_method: "BKASH" | "BANK";
  account_info: string | null;
  reference_no: string | null;
  paid_at: string;
  notes: string | null;
  sms_status: string | null;
  sms_response: string | null;
  sms_sent_at: string | null;
  created_at: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(d: string) {
  return d.slice(0, 7);
}
function fmtAmount(n: number | string | null | undefined) {
  return Number(n ?? 0).toFixed(2);
}

function PayrollPage() {
  const { role, can } = useAuth();
  const isAdmin = role === "admin";
  const canRates = isAdmin || can("payroll.manage_rates");
  const canEarnings = isAdmin || can("payroll.view_earnings");
  const canPayouts = isAdmin || can("payroll.view_payouts") || can("payroll.record_payouts");

  if (role && !canRates && !canEarnings && !canPayouts) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You don't have permission to access Payroll.
        </CardContent>
      </Card>
    );
  }

  const defaultTab = canRates ? "rates" : canEarnings ? "pending" : "payouts";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Manager Payroll</h1>
        <p className="text-sm text-muted-foreground">
          Configure per-service-item rates for managers. Earnings are auto-calculated
          when a bill is finalized. Record payouts to mark earnings paid and notify managers by SMS.
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          {canRates && (
            <TabsTrigger value="rates" className="gap-2">
              <Banknote className="h-4 w-4" /> Rates
            </TabsTrigger>
          )}
          {canEarnings && (
            <TabsTrigger value="pending" className="gap-2">
              <Wallet className="h-4 w-4" /> Pending Earnings
            </TabsTrigger>
          )}
          {canPayouts && (
            <TabsTrigger value="payouts" className="gap-2">
              <History className="h-4 w-4" /> Payout History
            </TabsTrigger>
          )}
        </TabsList>

        {canRates && (
          <TabsContent value="rates" className="m-0">
            <RatesTab />
          </TabsContent>
        )}
        {canEarnings && (
          <TabsContent value="pending" className="m-0">
            <PendingTab />
          </TabsContent>
        )}
        {canPayouts && (
          <TabsContent value="payouts" className="m-0">
            <PayoutsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}


// ============ Rates tab ============
function RatesTab() {
  const qc = useQueryClient();
  const ratesFn = useServerFn(listManagerRates);
  const itemsFn = useServerFn(listServiceItems);
  const managersFn = useServerFn(listManagers);
  const upsertFn = useServerFn(upsertManagerRate);
  const deleteFn = useServerFn(deleteManagerRate);

  const { data: rates = [], isLoading } = useQuery<Rate[]>({
    queryKey: ["manager-rates"],
    queryFn: () => ratesFn() as Promise<Rate[]>,
  });
  const { data: items = [] } = useQuery<ServiceItem[]>({
    queryKey: ["service-items"],
    queryFn: () => itemsFn() as Promise<ServiceItem[]>,
  });
  const { data: managers = [] } = useQuery<Manager[]>({
    queryKey: ["managers"],
    queryFn: () => managersFn() as Promise<Manager[]>,
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i.item_name])), [items]);
  const mgrMap = useMemo(() => new Map(managers.map((m) => [m.id, m.name || m.username])), [managers]);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    manager_id: "__default__",
    service_item_id: "",
    rate: "",
    effective_from: today(),
  });
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditId(null);
    setForm({ manager_id: "__default__", service_item_id: "", rate: "", effective_from: today() });
    setOpen(true);
  };
  const openEdit = (r: Rate) => {
    setEditId(r.id);
    setForm({
      manager_id: r.manager_id ?? "__default__",
      service_item_id: r.service_item_id,
      rate: String(r.rate),
      effective_from: r.effective_from,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service_item_id) return toast.error("Select service item");
    const rate = Number(form.rate);
    if (!Number.isFinite(rate) || rate < 0) return toast.error("Rate is not valid");
    setBusy(true);
    try {
      await upsertFn({
        data: {
          id: editId ?? undefined,
          manager_id: form.manager_id === "__default__" ? null : form.manager_id,
          service_item_id: form.service_item_id,
          rate,
          effective_from: form.effective_from,
        },
      });
      toast.success(editId ? "Rate updated" : "Rate added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["manager-rates"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this rate?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Rate deleted");
      qc.invalidateQueries({ queryKey: ["manager-rates"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Manager Service Rates</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Rate
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Service Item</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead>Effective From</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rates.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No rates configured</TableCell></TableRow>
            ) : (
              rates.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    {r.manager_id ? (mgrMap.get(r.manager_id) ?? "—") : <Badge variant="outline">Default (all managers)</Badge>}
                  </TableCell>
                  <TableCell>{itemMap.get(r.service_item_id) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtAmount(r.rate)}</TableCell>
                  <TableCell>{r.effective_from}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Rate" : "Add Rate"}</DialogTitle>
            <DialogDescription>
              Set the per-unit (qty) amount the manager earns for this service item.
              Choose "Default" to apply to all managers when no manager-specific rate exists.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Manager</Label>
              <Select value={form.manager_id} onValueChange={(v) => setForm((f) => ({ ...f, manager_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default (all managers)</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name || m.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Service Item</Label>
              <Select value={form.service_item_id} onValueChange={(v) => setForm((f) => ({ ...f, service_item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select service item" /></SelectTrigger>
                <SelectContent>
                  {items.filter((i) => i.is_active).map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.item_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Rate (per qty)</Label>
                <Input type="number" min={0} step="0.01"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  required />
              </div>
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                  required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============ Pending tab ============
type GroupKey = string; // managerId|YYYY-MM
type Group = { managerId: string; month: string; total: number; count: number };

function PendingTab() {
  const qc = useQueryClient();
  const earningsFn = useServerFn(listPendingEarnings);
  const managersFn = useServerFn(listManagers);
  const recordFn = useServerFn(recordPayout);
  const backfillFn = useServerFn(backfillEarnings);

  const { data: earnings = [], isLoading } = useQuery<Earning[]>({
    queryKey: ["pending-earnings"],
    queryFn: () => earningsFn() as Promise<Earning[]>,
  });
  const { data: managers = [] } = useQuery<Manager[]>({
    queryKey: ["managers"],
    queryFn: () => managersFn() as Promise<Manager[]>,
  });
  const mgrMap = useMemo(() => new Map(managers.map((m) => [m.id, m.name || m.username])), [managers]);

  const groups: Group[] = useMemo(() => {
    const m = new Map<GroupKey, Group>();
    for (const e of earnings) {
      const key = `${e.manager_id}|${monthKey(e.billing_month)}`;
      const cur = m.get(key) ?? {
        managerId: e.manager_id, month: monthKey(e.billing_month), total: 0, count: 0,
      };
      cur.total += Number(e.amount || 0);
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [earnings]);

  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Group | null>(null);
  const [payForm, setPayForm] = useState({
    payment_method: "BKASH" as "BKASH" | "BANK",
    account_info: "",
    reference_no: "",
    paid_at: today(),
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const openPay = (g: Group) => {
    setPayTarget(g);
    setPayForm({
      payment_method: "BKASH",
      account_info: "",
      reference_no: "",
      paid_at: today(),
      notes: "",
    });
    setPayOpen(true);
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setBusy(true);
    try {
      const res = await recordFn({
        data: {
          manager_id: payTarget.managerId,
          period_month: `${payTarget.month}-01`,
          payment_method: payForm.payment_method,
          account_info: payForm.account_info || undefined,
          reference_no: payForm.reference_no || undefined,
          paid_at: payForm.paid_at,
          notes: payForm.notes || undefined,
        },
      });
      if (res.sms_status === "SENT") toast.success(`Payout recorded · SMS sent (${fmtAmount(res.amount)})`);
      else toast.warning(`Payout recorded · SMS failed: ${res.sms_response ?? "unknown"}`);
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["pending-earnings"] });
      qc.invalidateQueries({ queryKey: ["payouts"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const runBackfill = async () => {
    try {
      const r = await backfillFn();
      toast.success(`Backfill complete · ${r?.created ?? 0} earnings created`);
      qc.invalidateQueries({ queryKey: ["pending-earnings"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Pending Earnings (by Manager × Month)</CardTitle>
        <Button size="sm" variant="outline" onClick={runBackfill}>
          <RefreshCw className="h-4 w-4 mr-1" /> Backfill from existing bills
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : groups.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No pending earnings</TableCell></TableRow>
            ) : (
              groups.map((g, i) => (
                <TableRow key={`${g.managerId}-${g.month}`}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{mgrMap.get(g.managerId) ?? g.managerId}</TableCell>
                  <TableCell>{g.month}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtAmount(g.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => openPay(g)}>
                      <Send className="h-4 w-4 mr-1" /> Mark Paid
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payout</DialogTitle>
            <DialogDescription>
              {payTarget ? (
                <>
                  {mgrMap.get(payTarget.managerId) ?? payTarget.managerId} · {payTarget.month} ·{" "}
                  <strong>{fmtAmount(payTarget.total)}</strong>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPay} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={payForm.payment_method}
                  onValueChange={(v) => setPayForm((f) => ({ ...f, payment_method: v as "BKASH" | "BANK" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BKASH">bKash</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Paid At</Label>
                <Input type="date" value={payForm.paid_at}
                  onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account Info (optional)</Label>
              <Input placeholder="e.g. 01XXXXXXXXX or bank account no."
                value={payForm.account_info}
                onChange={(e) => setPayForm((f) => ({ ...f, account_info: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Reference No. (optional)</Label>
              <Input value={payForm.reference_no}
                onChange={(e) => setPayForm((f) => ({ ...f, reference_no: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={payForm.notes}
                onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record & Send SMS"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============ Payouts tab ============
function PayoutsTab() {
  const qc = useQueryClient();
  const payoutsFn = useServerFn(listPayouts);
  const managersFn = useServerFn(listManagers);
  const resendFn = useServerFn(resendPayoutSms);

  const { data: payouts = [], isLoading } = useQuery<Payout[]>({
    queryKey: ["payouts"],
    queryFn: () => payoutsFn() as Promise<Payout[]>,
  });
  const { data: managers = [] } = useQuery<Manager[]>({
    queryKey: ["managers"],
    queryFn: () => managersFn() as Promise<Manager[]>,
  });
  const mgrMap = useMemo(() => new Map(managers.map((m) => [m.id, m.name || m.username])), [managers]);

  const resend = async (id: string) => {
    try {
      const r = await resendFn({ data: { id } });
      if (r.status === "SENT") toast.success("SMS sent");
      else toast.error(`SMS failed: ${r.response}`);
      qc.invalidateQueries({ queryKey: ["payouts"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payout History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Paid At</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>SMS</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : payouts.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No payouts yet</TableCell></TableRow>
            ) : (
              payouts.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{mgrMap.get(p.manager_id) ?? p.manager_id}</TableCell>
                  <TableCell>{monthKey(p.period_month)}</TableCell>
                  <TableCell>{p.paid_at}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtAmount(p.amount)}</TableCell>
                  <TableCell>{p.payment_method === "BKASH" ? "bKash" : "Bank"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                  <TableCell>
                    {p.sms_status === "SENT" ? (
                      <Badge variant="default">Sent</Badge>
                    ) : p.sms_status === "FAILED" ? (
                      <Badge variant="destructive" title={p.sms_response ?? ""}>Failed</Badge>
                    ) : (
                      <Badge variant="secondary">—</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => resend(p.id)} title="Resend SMS">
                      <Send className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

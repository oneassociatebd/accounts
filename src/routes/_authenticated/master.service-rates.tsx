import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listServiceRates,
  listServiceItems,
  listCustomerTypes,
  createServiceRate,
  updateLatestServiceRate,
} from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/master/service-rates")({
  head: () => ({
    meta: [{ title: "One | Service Rates" }],
  }),
  component: ServiceRatesPage,
});
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, History, Search } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

type ServiceItem = { id: string; item_name: string; is_active: boolean };
type CustomerType = { id: string; type_name: string; is_active: boolean };
type Rate = {
  id: string;
  service_item_id: string;
  customer_type_id: string | null;
  regular_rate: number;
  minimum_charge: number;
  effective_from: string;
  created_by: string | null;
  created_at: string;
  service_item: { id: string; item_name: string } | null;
  customer_type: { id: string; type_name: string } | null;
};

const IMPORTER_TYPE_ID = "f30df488-90ac-4a3a-8555-2bc2d5bf9d54";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ServiceRatesPage() {
  const qc = useQueryClient();
  const ratesFn = useServerFn(listServiceRates);
  const itemsFn = useServerFn(listServiceItems);
  const typesFn = useServerFn(listCustomerTypes);
  const createFn = useServerFn(createServiceRate);
  const updateFn = useServerFn(updateLatestServiceRate);

  const { data: rates = [], isLoading } = useQuery<Rate[]>({
    queryKey: ["service-rates"],
    queryFn: () => ratesFn() as Promise<Rate[]>,
  });
  const { data: items = [] } = useQuery<ServiceItem[]>({
    queryKey: ["service-items"],
    queryFn: () => itemsFn() as Promise<ServiceItem[]>,
  });
  const { data: types = [] } = useQuery<CustomerType[]>({
    queryKey: ["customer-types"],
    queryFn: () => typesFn() as Promise<CustomerType[]>,
  });

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);
  const activeTypes = useMemo(() => types.filter((t) => t.is_active), [types]);

  // Compute latest rate id per (service_item, customer_type) pair
  const latestIdByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rates) {
      const key = `${r.service_item_id}::${r.customer_type_id ?? ""}`;
      if (!m.has(key)) m.set(key, r.id);
    }
    return m;
  }, [rates]);

  const keyOf = (r: { service_item_id: string; customer_type_id: string | null }) =>
    `${r.service_item_id}::${r.customer_type_id ?? ""}`;

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(
      (r) =>
        r.service_item?.item_name.toLowerCase().includes(q) ||
        r.customer_type?.type_name.toLowerCase().includes(q),
    );
  }, [rates, search]);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    service_item_id: "",
    customer_type_id: IMPORTER_TYPE_ID,
    regular_rate: "",
    minimum_charge: "",
    effective_from: today(),
  });

  const [busy, setBusy] = useState(false);

  const openAdd = (prefill?: { service_item_id?: string; customer_type_id?: string | null }) => {
    setAddForm({
      service_item_id: prefill?.service_item_id ?? "",
      customer_type_id: prefill?.customer_type_id ?? IMPORTER_TYPE_ID,
      regular_rate: "",
      minimum_charge: "",
      effective_from: today(),
    });
    setAddOpen(true);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.service_item_id) return toast.error("Select service item");
    const rr = Number(addForm.regular_rate);
    const mc = Number(addForm.minimum_charge);
    if (!Number.isFinite(rr) || rr < 0) return toast.error("Regular Rate is not correct");
    if (!Number.isFinite(mc) || mc < 0) return toast.error("Minimum Charge is not correct");
    if (!addForm.effective_from) return toast.error("Effective From is required");
    setBusy(true);
    try {
      await createFn({
        data: {
          service_item_id: addForm.service_item_id,
          customer_type_id:
            addForm.customer_type_id === IMPORTER_TYPE_ID ? IMPORTER_TYPE_ID : addForm.customer_type_id,
          regular_rate: rr,
          minimum_charge: mc,
          effective_from: addForm.effective_from,
        },
      });
      toast.success("Rate has been added");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["service-rates"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  // Edit dialog
  const [editRate, setEditRate] = useState<Rate | null>(null);
  const [editForm, setEditForm] = useState({
    customer_type_id: IMPORTER_TYPE_ID,
    regular_rate: "",
    minimum_charge: "",
    effective_from: today(),
  });

  const openEdit = (r: Rate) => {
    if (latestIdByKey.get(keyOf(r)) !== r.id) {
      toast.error("Only the latest rate can be edited");
      return;
    }
    if (!window.confirm("Do you want to change the latest rate?")) return;
    setEditRate(r);
    setEditForm({
      customer_type_id: r.customer_type_id ?? IMPORTER_TYPE_ID,
      regular_rate: String(r.regular_rate),
      minimum_charge: String(r.minimum_charge),
      effective_from: r.effective_from,
    });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRate) return;
    const rr = Number(editForm.regular_rate);
    const mc = Number(editForm.minimum_charge);
    if (!Number.isFinite(rr) || rr < 0) return toast.error("Regular Rate is not correct");
    if (!Number.isFinite(mc) || mc < 0) return toast.error("Minimum Charge is not correct");
    setBusy(true);
    try {
      await updateFn({
        data: {
          id: editRate.id,
          customer_type_id:
            editForm.customer_type_id === IMPORTER_TYPE_ID ? IMPORTER_TYPE_ID : editForm.customer_type_id,
          regular_rate: rr,
          minimum_charge: mc,
          effective_from: editForm.effective_from,
        },
      });
      toast.success("Rate updated");
      setEditRate(null);
      qc.invalidateQueries({ queryKey: ["service-rates"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Service Rates</h1>
          <p className="text-sm text-muted-foreground">
            Rate and minimum charge per service item, optionally per customer type. If no type-specific rate exists, the Default rate is used. Only the latest rate of each (Item + Type) can be edited.
          </p>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus className="h-4 w-4 mr-1" /> Add Service Rate
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by service item or customer type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Service Item</TableHead>
                <TableHead>Customer Type</TableHead>
                <TableHead className="text-right">Regular Rate</TableHead>
                <TableHead className="text-right">Min. Charge</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <TableSkeleton rows={5} cols={8} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    No rates found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => {
                  const isLatest = latestIdByKey.get(keyOf(r)) === r.id;
                  return (
                    <TableRow key={r.id} className={isLatest ? "bg-primary/5" : undefined}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {r.service_item?.item_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.customer_type ? (
                          r.customer_type.type_name
                        ) : (
                          <Badge variant="outline">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.regular_rate).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.minimum_charge).toFixed(2)}
                      </TableCell>
                      <TableCell>{r.effective_from}</TableCell>
                      <TableCell>
                        {isLatest ? (
                          <Badge variant="default">Latest</Badge>
                        ) : (
                          <Badge variant="secondary">Historical</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isLatest && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(r)}
                                title="Edit latest rate"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  openAdd({
                                    service_item_id: r.service_item_id,
                                    customer_type_id: r.customer_type_id,
                                  })
                                }
                                title="Add new rate"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button asChild size="sm" variant="ghost" title="View history">
                            <Link
                              to="/master/service-rates/$itemId/history"
                              params={{ itemId: r.service_item_id }}
                            >
                              <History className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service Rate</DialogTitle>
            <DialogDescription>
              Add a new rate. Previous rates will remain as history.

            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Service Item</Label>
              <Select
                value={addForm.service_item_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, service_item_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service item" />
                </SelectTrigger>
                <SelectContent>
                  {activeItems.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <Select
                value={addForm.customer_type_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, customer_type_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.type_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Regular Rate</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={addForm.regular_rate}
                  onChange={(e) => setAddForm((f) => ({ ...f, regular_rate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Charge</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={addForm.minimum_charge}
                  onChange={(e) => setAddForm((f) => ({ ...f, minimum_charge: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={addForm.effective_from}
                onChange={(e) => setAddForm((f) => ({ ...f, effective_from: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editRate} onOpenChange={(o) => !o && setEditRate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Latest Rate</DialogTitle>
            <DialogDescription>
              {editRate?.service_item?.item_name}
              {editRate?.customer_type ? ` — ${editRate.customer_type.type_name}` : ""}
              {" — Only the latest rate can be edited."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <Select
                value={editForm.customer_type_id}
                onValueChange={(v) => setEditForm((f) => ({ ...f, customer_type_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.type_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Regular Rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.regular_rate}
                  onChange={(e) => setEditForm((f) => ({ ...f, regular_rate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Charge</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.minimum_charge}
                  onChange={(e) => setEditForm((f) => ({ ...f, minimum_charge: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={editForm.effective_from}
                onChange={(e) => setEditForm((f) => ({ ...f, effective_from: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditRate(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

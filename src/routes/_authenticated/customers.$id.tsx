import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCustomer,
  updateCustomer,
  toggleCustomer,
  assignManagers,
  deleteCustomer,
  listAreas,
  listLocations,
  listReferences,
  listCustomerTypes,
  listManagers,
  checkBinUnique,
  checkMobileExists,
} from "@/lib/erp.functions";
import { listBills } from "@/lib/billing.functions";
import { formatBdSmsMobile, formatBdWhatsappMobile } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { ManagersMultiSelect } from "@/components/managers-multi-select";
import { Eye, EyeOff, ArrowLeft, Power, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({
    meta: [{ title: "One | Customer Details" }],
  }),
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = useParams({ from: "/_authenticated/customers/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();

  const fetchOne = useServerFn(getCustomer);
  const update = useServerFn(updateCustomer);
  const toggle = useServerFn(toggleCustomer);
  const assign = useServerFn(assignManagers);
  const del = useServerFn(deleteCustomer);
  const fetchAreas = useServerFn(listAreas);
  const fetchLocations = useServerFn(listLocations);
  const fetchRefs = useServerFn(listReferences);
  const fetchTypes = useServerFn(listCustomerTypes);
  const fetchManagers = useServerFn(listManagers);
  const checkBin = useServerFn(checkBinUnique);
  const checkMobile = useServerFn(checkMobileExists);

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => fetchOne({ data: { id } }),
  });
  const { data: types = [] } = useQuery({ queryKey: ["customer-types"], queryFn: () => fetchTypes() });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations() });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreas() });
  const { data: references = [] } = useQuery({ queryKey: ["references"], queryFn: () => fetchRefs() });
  const { data: managers = [] } = useQuery({
    queryKey: ["managers"],
    queryFn: () => fetchManagers(),
    enabled: role === "admin",
  });

  const c = data?.customer;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [binStatus, setBinStatus] = useState<"idle" | "unique" | "taken">("idle");
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [savingMgr, setSavingMgr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (c) {
      setForm({
        customer_type_id: c.customer_type_id ?? "",
        company_name: c.company_name ?? c.name ?? "",
        proprietor_name: c.proprietor_name ?? "",
        address: c.address ?? "",
        bin_number: c.bin_number ?? "",
        vat_registration_no: c.vat_registration_no ?? "",
        trade_license_no: c.trade_license_no ?? "",
        mobile: c.mobile ?? "",
        alternative_mobile: c.alternative_mobile ?? "",
        email: c.email ?? "",
        location_id: c.location_id ?? "",
        area_id: c.area_id ?? "",
        reference_id: c.reference_id ?? "",
        opening_balance_type: c.opening_balance_type ?? "",
        opening_balance_amount: String(c.opening_balance_amount ?? 0),
        vat_user_id: c.vat_user_id ?? "",
        vat_password: c.vat_password ?? "",
        vat_service_type: (c as any).vat_service_type ?? "FULL",
        is_active: c.is_active,
        notes: c.notes ?? "",
      });
    }
  }, [c]);

  useEffect(() => {
    if (data?.managers) setManagerIds(data.managers.map((m: any) => m.manager_id));
  }, [data]);

  const filteredAreas = useMemo(() => {
    const list = areas as Array<{ id: string; area_name: string; location_id: string; location?: { location_name?: string } }>;
    if (!form?.location_id) return [];
    return list.filter((a) => a.location_id === form.location_id);
  }, [areas, form?.location_id]);

  useEffect(() => {
    if (!editing) return;
    const bin = (form?.bin_number || "").trim();
    if (!bin) { setBinStatus("idle"); return; }
    const h = setTimeout(async () => {
      try {
        const r = await checkBin({ data: { bin, exclude_id: id } });
        setBinStatus(r.unique ? "unique" : "taken");
      } catch { setBinStatus("idle"); }
    }, 400);
    return () => clearTimeout(h);
  }, [form?.bin_number, editing, id, checkBin]);

  useEffect(() => {
    if (!editing) return;
    const m = (form?.mobile || "").trim();
    if (!m || m.length < 6) { setMobileWarning(null); return; }
    const h = setTimeout(async () => {
      try {
        const r = await checkMobile({ data: { mobile: m, exclude_id: id } });
        if (r.matches.length > 0) setMobileWarning(`Also used by: ${r.matches.map((x: any) => x.company_name).join(", ")}`);
        else setMobileWarning(null);
      } catch { setMobileWarning(null); }
    }, 500);
    return () => clearTimeout(h);
  }, [form?.mobile, editing, id, checkMobile]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.customer_type_id.trim()) return toast.error("Customer type is required");
    if (!(form.bin_number || "").trim()) return toast.error("BIN number is required");
    const bin = (form.bin_number || "").trim();
    if (!/^\d{9}-\d{4}$/.test(bin)) return toast.error("BIN must be in format xxxxxxxxx-xxxx (9 digits, dash, 4 digits)");
    if (binStatus === "taken") return toast.error("BIN number already exists");
    const m = (form.mobile || "").trim();
    if (!m) { setMobileError("Mobile number is required"); return toast.error("Mobile number is required"); }
    if (!/^01\d{9}$/.test(m)) { setMobileError("Mobile number must be in 01XXXXXXXXX format"); return toast.error("Mobile number must be in 01XXXXXXXXX format"); }
    const w = (form.alternative_mobile || "").trim();
    if (!w) { setWhatsappError("WhatsApp number is required"); return toast.error("WhatsApp number is required"); }
    if (!/^\+8801\d{9}$/.test(w)) { setWhatsappError("WhatsApp number must be in +8801XXXXXXXXX format"); return toast.error("WhatsApp number must be in +8801XXXXXXXXX format"); }
    const amt = Number(form.opening_balance_amount || 0);
    if (!Number.isFinite(amt)) return toast.error("Invalid opening balance");
    setSaving(true);
    try {
      await update({
        data: {
          id,
          ...form,
          customer_type_id: form.customer_type_id,
          location_id: form.location_id || null,
          area_id: form.area_id || null,
          reference_id: form.reference_id || null,
          opening_balance_type: null,
          opening_balance_amount: amt,
        },
      });
      toast.success("Customer updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!c) return;
    try {
      await toggle({ data: { id, is_active: !c.is_active } });
      toast.success(c.is_active ? "Disabled" : "Enabled");
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleSaveManagers = async () => {
    setSavingMgr(true);
    try {
      await assign({ data: { customer_id: id, manager_ids: managerIds } });
      toast.success("Manager assignments updated");
      qc.invalidateQueries({ queryKey: ["customer", id] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMgr(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await del({ data: { id } });
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/customers" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };


  if (isLoading || !c || !form) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/customers" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {c.company_name || c.name}
              <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Disabled"}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {c.bin_number && <span className="font-mono mr-3">BIN: {c.bin_number}</span>}
              {c.type?.type_name && <span>{c.type.type_name}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {role === "admin" && (
            <Button variant="outline" onClick={handleToggle}>
              <Power className="h-4 w-4 mr-2" /> {c.is_active ? "Disable" : "Enable"}
            </Button>
          )}
          {!editing ? (
            <Button onClick={() => setEditing(true)}>Edit</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || binStatus === "taken"}>{saving ? "Saving…" : "Save"}</Button>
            </>
          )}
          {role === "admin" && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-foreground">{c.company_name || c.name}</span> will be permanently deleted. This action cannot be undone.
                </div>
                {Number(c.opening_balance_amount ?? 0) !== 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    <div className="font-semibold mb-1">⚠️ Warning: Balance is not zero</div>
                    <div className="text-sm">
                      This customer's Opening Balance:{" "}
                      <span className="font-mono font-semibold">
                        {Number(c.opening_balance_amount).toFixed(2)}
                      </span>{" "}
                      {Number(c.opening_balance_amount) > 0 ? "(Advance — Customer deposit)" : "(Due — Customer due)"}
                    </div>
                    <div className="text-sm mt-1">
                      Deleting will destroy this ledger. Please ensure settlement first.
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Yes, Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {role === "admin" && <TabsTrigger value="managers">Managers</TabsTrigger>}
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 mt-4">
          {/* Basic */}
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label={<>Customer Type <span className="text-destructive">*</span></>} editing={editing} value={c.type?.type_name}>
                <SearchableSelect
                  options={(types as Array<{ id: string; type_name: string }>).map((t) => ({ value: t.id, label: t.type_name }))}
                  value={form.customer_type_id || null}
                  onChange={(v) => set("customer_type_id", v ?? "")}
                />
              </Field>
              <Field label="Company Name" editing={editing} value={c.company_name || c.name}>
                <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              </Field>
              <Field label="Proprietor" editing={editing} value={c.proprietor_name}>
                <Input value={form.proprietor_name} onChange={(e) => set("proprietor_name", e.target.value)} />
              </Field>
              <Field label="Address" editing={editing} value={c.address}>
                <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          {/* Identity */}
          <Card>
            <CardHeader><CardTitle className="text-base">Identity Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="BIN Number *" editing={editing} value={c.bin_number}>
                <div>
                  <Input
                    value={form.bin_number}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
                      const formatted = digits.length > 9 ? `${digits.slice(0, 9)}-${digits.slice(9)}` : digits;
                      set("bin_number", formatted);
                    }}
                    required
                    placeholder="xxxxxxxxx-xxxx"
                    inputMode="numeric"
                    maxLength={14}
                  />
                  {binStatus === "taken" && <p className="text-xs text-destructive mt-1">Already in use</p>}
                </div>
              </Field>
              <Field label="TIN" editing={editing} value={c.vat_registration_no}>
                <Input value={form.vat_registration_no} onChange={(e) => set("vat_registration_no", e.target.value)} />
              </Field>
              <Field label="Trade License No" editing={editing} value={c.trade_license_no}>
                <Input value={form.trade_license_no} onChange={(e) => set("trade_license_no", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label={<>Mobile <span className="text-destructive">*</span></>} editing={editing} value={c.mobile}>
                <div>
                  <Input
                    value={form.mobile}
                    onChange={(e) => {
                      const formatted = formatBdSmsMobile(e.target.value);
                      set("mobile", formatted);
                      if (mobileError) {
                        if (/^01\d{9}$/.test(formatted)) setMobileError(null);
                        else if (!formatted) setMobileError(null);
                      }
                    }}
                    onBlur={(e) => {
                      const formatted = formatBdSmsMobile(e.target.value);
                      set("mobile", formatted);
                      if (formatted && !/^01\d{9}$/.test(formatted)) {
                        setMobileError("Mobile number must be in 01XXXXXXXXX format (e.g. 01712345678)");
                      } else {
                        setMobileError(null);
                      }
                    }}
                    placeholder="01XXXXXXXXX"
                    required
                    maxLength={11}
                    className={mobileError ? "border-destructive" : ""}
                  />
                  {mobileError && <p className="text-xs text-destructive mt-1">{mobileError}</p>}
                  {mobileWarning && <p className="text-xs text-amber-600 mt-1">{mobileWarning}</p>}
                </div>
              </Field>
              <Field label={<>WhatsApp No <span className="text-destructive">*</span></>} editing={editing} value={c.alternative_mobile}>
                <div>
                  <Input
                    value={form.alternative_mobile}
                    onChange={(e) => {
                      const formatted = formatBdWhatsappMobile(e.target.value);
                      set("alternative_mobile", formatted);
                      if (whatsappError) {
                        if (/^\+8801\d{9}$/.test(formatted)) setWhatsappError(null);
                        else if (!formatted) setWhatsappError(null);
                      }
                    }}
                    onBlur={(e) => {
                      const formatted = formatBdWhatsappMobile(e.target.value);
                      set("alternative_mobile", formatted);
                      if (formatted && !/^\+8801\d{9}$/.test(formatted)) {
                        setWhatsappError("WhatsApp number must be in +8801XXXXXXXXX format (e.g. +8801712345678)");
                      } else {
                        setWhatsappError(null);
                      }
                    }}
                    placeholder="+8801XXXXXXXXX"
                    required
                    maxLength={14}
                    className={whatsappError ? "border-destructive" : ""}
                  />
                  {whatsappError && <p className="text-xs text-destructive mt-1">{whatsappError}</p>}
                </div>
              </Field>
              <Field label="Email" editing={editing} value={c.email}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          {/* Area */}
          <Card>
            <CardHeader><CardTitle className="text-base">Area & Assignment</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Location" editing={editing} value={c.location?.location_name}>
                <SearchableSelect
                  options={(locations as Array<{ id: string; location_name: string }>).map((l) => ({ value: l.id, label: l.location_name }))}
                  value={form.location_id || null}
                  onChange={(v) => { set("location_id", v ?? ""); set("area_id", ""); }}
                />
              </Field>
              <Field label="Area" editing={editing} value={c.area?.area_name}>
                <SearchableSelect
                  options={filteredAreas.map((a) => ({ value: a.id, label: a.area_name, hint: a.location?.location_name }))}
                  value={form.area_id || null}
                  onChange={(v) => set("area_id", v ?? "")}
                />
              </Field>
              <Field label="Reference" editing={editing} value={c.ref?.reference_name}>
                <SearchableSelect
                  options={(references as Array<{ id: string; reference_name: string }>).map((r) => ({ value: r.id, label: r.reference_name }))}
                  value={form.reference_id || null}
                  onChange={(v) => set("reference_id", v ?? "")}
                />
              </Field>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader><CardTitle className="text-base">Opening Balance</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Opening Balance</div>
                <div className="text-sm font-medium">
                  {Number(c.opening_balance_amount ?? 0).toFixed(2)}
                  {Number(c.opening_balance_amount ?? 0) > 0 && " (Advance)"}
                  {Number(c.opening_balance_amount ?? 0) < 0 && " (Due)"}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Opening Balance cannot be edited. To change, delete the client and recreate.
              </p>
            </CardContent>
          </Card>




          {/* VAT Access */}
          <Card>
            <CardHeader><CardTitle className="text-base">VAT Access</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="VAT User ID" editing={editing} value={c.vat_user_id}>
                <Input value={form.vat_user_id} onChange={(e) => set("vat_user_id", e.target.value)} autoComplete="off" />
              </Field>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">VAT Password</Label>
                {editing ? (
                  <div className="relative">
                    <Input
                      type={showPwd ? "text" : "password"}
                      value={form.vat_password}
                      onChange={(e) => set("vat_password", e.target.value)}
                      autoComplete="new-password"
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono">{showPwd ? c.vat_password || "—" : c.vat_password ? "••••••••" : "—"}</span>
                    {c.vat_password && (
                      <button type="button" onClick={() => setShowPwd((s) => !s)} className="text-muted-foreground hover:text-foreground">
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Service Scope</Label>
                {editing ? (
                  <Select value={form.vat_service_type} onValueChange={(v) => set("vat_service_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL">Full</SelectItem>
                      <SelectItem value="ONLY_RETURN">Only Return</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm font-medium">
                    {(c as any).vat_service_type === "ONLY_RETURN" ? "Only Return" : "Full"}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground md:col-span-3">
                "Only Return" hides "Books Of Accounts Maintenance" from bill items for this customer.
              </p>
            </CardContent>
          </Card>

          {/* Status & Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Status & Notes</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {editing && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Active</Label>
                  <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                </div>
              )}
              {c.enabled_month && (
                <p className="text-xs text-muted-foreground">Enabled from month: {c.enabled_month}</p>
              )}
              {c.disabled_at && !c.is_active && (
                <p className="text-xs text-muted-foreground">Disabled at: {new Date(c.disabled_at).toLocaleString()}</p>
              )}
              <Field label="Notes" editing={editing} value={c.notes} full>
                <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {role === "admin" && (
          <TabsContent value="managers" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Assigned Managers</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ManagersMultiSelect
                  managers={managers as Array<{ id: string; name: string; username: string | null }>}
                  selected={managerIds}
                  onChange={setManagerIds}
                />
                {data?.managers && data.managers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.managers.map((m: any) => (
                      <Badge key={m.manager_id} variant="secondary">
                        {m.manager?.name || "Unknown"}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button onClick={handleSaveManagers} disabled={savingMgr}>
                  {savingMgr ? "Saving…" : "Save Assignments"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="ledger" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                View this customer's full ledger with opening balance, bills, collections and running balance.
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button asChild>
                  <Link to="/ledger/customer" search={{ customer_id: id }}>
                    Open Customer Ledger
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/ledger/statement" search={{ customer_id: id }}>
                    Print Statement
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <CustomerBills customerId={id} />
        </TabsContent>
        <TabsContent value="collections" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">Collections module coming soon.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  children,
  full,
}: {
  label: React.ReactNode;
  value?: string | null;
  editing: boolean;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-full" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? children : <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>}
    </div>
  );
}

function CustomerBills({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const fetchBills = useServerFn(listBills);
  const { data, isLoading } = useQuery({
    queryKey: ["customer-bills", customerId],
    queryFn: () =>
      fetchBills({
        data: { customer_id: customerId, status: "all", include_drafts: true, page_size: 200 },
      }),
  });
  const rows = (data?.rows ?? []) as Array<{
    id: string;
    bill_no: string;
    bill_date: string;
    billing_month: string;
    grand_total: number;
    status: string;
  }>;
  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>;
  }
  if (rows.length === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">No bills yet.</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 px-3">Invoice</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Month</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="border-b hover:bg-accent cursor-pointer"
                  onClick={() => navigate({ to: "/bills/$id", params: { id: b.id } })}
                >
                  <td className="py-2 px-3 font-mono">{b.bill_no}</td>
                  <td className="py-2 px-3">{b.bill_date}</td>
                  <td className="py-2 px-3">{b.billing_month?.slice(0, 7)}</td>
                  <td className="py-2 px-3 text-right font-mono">{Number(b.grand_total).toFixed(2)}</td>
                  <td className="py-2 px-3">
                    <Badge variant={b.status === "FINALIZED" ? "default" : b.status === "CANCELLED" ? "destructive" : "secondary"}>
                      {b.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

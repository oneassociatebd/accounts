import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  createCustomer,
  listAreas,
  listLocations,
  listReferences,
  listCustomerTypes,
  listManagers,
  checkBinUnique,
  checkMobileExists,
  assignManagers,
} from "@/lib/erp.functions";
import { formatBdSmsMobile, formatBdWhatsappMobile } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { ManagersMultiSelect } from "@/components/managers-multi-select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers/new")({
  head: () => ({
    meta: [{ title: "One | Add Customer" }],
  }),
  component: NewCustomer,
});

type FormState = {
  customer_type_id: string;
  company_name: string;
  proprietor_name: string;
  address: string;
  bin_number: string;
  vat_registration_no: string;
  trade_license_no: string;
  mobile: string;
  alternative_mobile: string;
  email: string;
  location_id: string;
  area_id: string;
  reference_id: string;
  opening_balance_type: "" | "DUE" | "ADVANCE";
  opening_balance_amount: string;
  vat_user_id: string;
  vat_password: string;
  vat_service_type: "FULL" | "ONLY_RETURN";
  is_active: boolean;
  notes: string;
};

const initial: FormState = {
  customer_type_id: "",
  company_name: "",
  proprietor_name: "",
  address: "",
  bin_number: "",
  vat_registration_no: "",
  trade_license_no: "",
  mobile: "",
  alternative_mobile: "",
  email: "",
  location_id: "",
  area_id: "",
  reference_id: "",
  opening_balance_type: "",
  opening_balance_amount: "",
  vat_user_id: "",
  vat_password: "",
  vat_service_type: "FULL",
  is_active: true,
  notes: "",
};

function NewCustomer() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const create = useServerFn(createCustomer);
  const assign = useServerFn(assignManagers);
  const fetchAreas = useServerFn(listAreas);
  const fetchLocations = useServerFn(listLocations);
  const fetchRefs = useServerFn(listReferences);
  const fetchTypes = useServerFn(listCustomerTypes);
  const fetchManagers = useServerFn(listManagers);
  const checkBin = useServerFn(checkBinUnique);
  const checkMobile = useServerFn(checkMobileExists);

  const { data: types = [] } = useQuery({ queryKey: ["customer-types"], queryFn: () => fetchTypes() });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations() });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreas() });
  const { data: references = [] } = useQuery({ queryKey: ["references"], queryFn: () => fetchRefs() });
  const { data: managers = [] } = useQuery({
    queryKey: ["managers"],
    queryFn: () => fetchManagers(),
    enabled: role === "admin",
  });

  const [form, setForm] = useState<FormState>(initial);
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [binStatus, setBinStatus] = useState<"idle" | "checking" | "unique" | "taken">("idle");
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [managerIds, setManagerIds] = useState<string[]>([]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (types.length > 0 && !form.customer_type_id) {
      const importer = (types as any[]).find((t) => t.type_name === "Importer");
      if (importer) set("customer_type_id", importer.id);
    }
  }, [types, form.customer_type_id]);

  const filteredAreas = useMemo(() => {
    const list = areas as Array<{ id: string; area_name: string; location_id: string; location?: { location_name?: string } }>;
    if (!form.location_id) return [];
    return list.filter((a) => a.location_id === form.location_id);
  }, [areas, form.location_id]);

  // Debounced BIN uniqueness check
  useEffect(() => {
    const bin = form.bin_number.trim();
    if (!bin) {
      setBinStatus("idle");
      return;
    }
    setBinStatus("checking");
    const h = setTimeout(async () => {
      try {
        const res = await checkBin({ data: { bin } });
        setBinStatus(res.unique ? "unique" : "taken");
      } catch {
        setBinStatus("idle");
      }
    }, 400);
    return () => clearTimeout(h);
  }, [form.bin_number, checkBin]);

  // Debounced mobile duplicate warning
  useEffect(() => {
    const m = form.mobile.trim();
    if (!m || m.length < 6) {
      setMobileWarning(null);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const res = await checkMobile({ data: { mobile: m } });
        if (res.matches.length > 0) {
          setMobileWarning(
            `This mobile already exists for: ${res.matches.map((x) => x.company_name).join(", ")}`,
          );
        } else {
          setMobileWarning(null);
        }
      } catch {
        setMobileWarning(null);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [form.mobile, checkMobile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_type_id.trim()) {
      toast.error("Customer type is required");
      return;
    }
    if (!form.location_id) {
      toast.error("Location is required");
      return;
    }
    if (!form.area_id) {
      toast.error("Area is required");
      return;
    }
    if (!form.reference_id) {
      toast.error("Reference is required");
      return;
    }
    if (!form.bin_number.trim()) {
      toast.error("BIN number is required");
      return;
    }
    if (!/^\d{9}-\d{4}$/.test(form.bin_number.trim())) {
      toast.error("BIN must be in format xxxxxxxxx-xxxx (9 digits, dash, 4 digits)");
      return;
    }
    if (binStatus === "taken") {
      toast.error("BIN number already exists");
      return;
    }
    if (!form.mobile.trim()) {
      toast.error("Mobile number is required");
      setMobileError("Mobile number is required");
      return;
    }
    if (!/^01\d{9}$/.test(form.mobile.trim())) {
      toast.error("Mobile number must be in 01XXXXXXXXX format");
      setMobileError("Mobile number must be in 01XXXXXXXXX format");
      return;
    }
    if (!form.alternative_mobile.trim()) {
      toast.error("WhatsApp number is required");
      setWhatsappError("WhatsApp number is required");
      return;
    }
    if (!/^\+8801\d{9}$/.test(form.alternative_mobile.trim())) {
      toast.error("WhatsApp number must be in +8801XXXXXXXXX format");
      setWhatsappError("WhatsApp number must be in +8801XXXXXXXXX format");
      return;
    }
    if (form.opening_balance_amount === "" || form.opening_balance_amount == null) {
      toast.error("Opening balance is required");
      return;
    }
    const amt = Number(form.opening_balance_amount);
    if (!Number.isFinite(amt)) {
      toast.error("Invalid opening balance");
      return;
    }
    const a = filteredAreas.find((x) => x.id === form.area_id);
    if (!a) {
      toast.error("Selected area does not belong to the chosen location");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        customer_type_id: form.customer_type_id,
        company_name: form.company_name,
        proprietor_name: form.proprietor_name,
        address: form.address,
        bin_number: form.bin_number,
        vat_registration_no: form.vat_registration_no,
        trade_license_no: form.trade_license_no,
        mobile: form.mobile,
        alternative_mobile: form.alternative_mobile,
        email: form.email,
        location_id: form.location_id || null,
        area_id: form.area_id || null,
        reference_id: form.reference_id || null,
        opening_balance_type: null,
        opening_balance_amount: amt,
        vat_user_id: form.vat_user_id,
        vat_password: form.vat_password,
        vat_service_type: form.vat_service_type,
        is_active: form.is_active,
        notes: form.notes,
      };
      const res = await create({ data: payload });
      if (role === "admin" && managerIds.length > 0 && res?.id) {
        await assign({ data: { customer_id: res.id, manager_ids: managerIds } });
      }
      toast.success("Customer created");
      setForm(initial);
      setManagerIds([]);
      setBinStatus("idle");
      setMobileWarning(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add Customer</h1>
        <p className="text-sm text-muted-foreground">Register a new customer with full details</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section 1: Basic Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">1. Basic Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer Type <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={(types as Array<{ id: string; type_name: string }>).map((t) => ({ value: t.id, label: t.type_name }))}
                value={form.customer_type_id || null}
                onChange={(v) => set("customer_type_id", v ?? "")}
                placeholder="Select customer type"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer / Company Name *</Label>
              <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Proprietor / Owner Name</Label>
              <Input value={form.proprietor_name} onChange={(e) => set("proprietor_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Identity */}
        <Card>
          <CardHeader><CardTitle className="text-base">2. Identity Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>BIN Number <span className="text-destructive">*</span></Label>
              <div className="relative">
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
                  className={
                    binStatus === "taken"
                      ? "border-destructive pr-9"
                      : binStatus === "unique"
                        ? "border-green-500 pr-9"
                        : "pr-9"
                  }
                />
                {binStatus === "unique" && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                )}
                {binStatus === "taken" && (
                  <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>
              {binStatus === "taken" && (
                <p className="text-xs text-destructive">This BIN number is already in use.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>TIN</Label>
              <Input value={form.vat_registration_no} onChange={(e) => set("vat_registration_no", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Trade License No</Label>
              <Input value={form.trade_license_no} onChange={(e) => set("trade_license_no", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Contact */}
        <Card>
          <CardHeader><CardTitle className="text-base">3. Contact Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Mobile Number <span className="text-destructive">*</span></Label>
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
              {mobileError && (
                <p className="text-xs text-destructive">{mobileError}</p>
              )}
              {mobileWarning && (
                <p className="text-xs text-amber-600 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {mobileWarning}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>WhatsApp No <span className="text-destructive">*</span></Label>
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
              {whatsappError && (
                <p className="text-xs text-destructive">{whatsappError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Area & Assignment */}
        <Card>
          <CardHeader><CardTitle className="text-base">4. Area & Assignment</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Location <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={(locations as Array<{ id: string; location_name: string }>).map((l) => ({ value: l.id, label: l.location_name }))}
                value={form.location_id || null}
                onChange={(v) => {
                  set("location_id", v ?? "");
                  set("area_id", "");
                }}
                placeholder="Select location"
              />
            </div>
            <div className="space-y-2">
              <Label>Area <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={filteredAreas.map((a) => ({ value: a.id, label: a.area_name, hint: a.location?.location_name }))}
                value={form.area_id || null}
                onChange={(v) => set("area_id", v ?? "")}
                placeholder={form.location_id ? "Select area" : "Select location first"}
                disabled={!form.location_id && filteredAreas.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label>Reference <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={(references as Array<{ id: string; reference_name: string }>).map((r) => ({ value: r.id, label: r.reference_name }))}
                value={form.reference_id || null}
                onChange={(v) => set("reference_id", v ?? "")}
                placeholder="Select reference"
              />
            </div>
            {role === "admin" && (
              <div className="space-y-2 md:col-span-3">
                <Label>Assign Managers (Admin only)</Label>
                <ManagersMultiSelect
                  managers={managers as Array<{ id: string; name: string; username: string | null }>}
                  selected={managerIds}
                  onChange={setManagerIds}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Financial Opening */}
        <Card>
          <CardHeader><CardTitle className="text-base">5. Opening Balance</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2 max-w-sm">
              <Label>Opening Balance <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.01"
                value={form.opening_balance_amount}
                onChange={(e) => set("opening_balance_amount", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Negative (−) means customer will pay (Due). Positive (+) means customer has deposit (Advance). Default: 0.
              </p>
            </div>
          </CardContent>
        </Card>


        {/* Section 6: VAT Access */}
        <Card>
          <CardHeader><CardTitle className="text-base">6. VAT Access</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>VAT User ID</Label>
              <Input value={form.vat_user_id} onChange={(e) => set("vat_user_id", e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>VAT Password</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={form.vat_password}
                  onChange={(e) => set("vat_password", e.target.value)}
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Service Scope</Label>
              <Select value={form.vat_service_type} onValueChange={(v) => set("vat_service_type", v as "FULL" | "ONLY_RETURN")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full</SelectItem>
                  <SelectItem value="ONLY_RETURN">Only Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-3">
              "Only Return" customers will not see "Books Of Accounts Maintenance" in bill items.
            </p>
          </CardContent>
        </Card>

        {/* Section 7: Status & Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">7. Status & Notes</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Disabled customers cannot be billed but old data remains visible.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
          <Button type="submit" disabled={busy || binStatus === "taken"}>{busy ? "Saving..." : "Save Customer"}</Button>
        </div>
      </form>
    </div>
  );
}

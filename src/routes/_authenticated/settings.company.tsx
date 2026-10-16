import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Building2, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendTestSms } from "@/lib/whatsapp.functions";
import { getCompanySettings, updateCompanySettings } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({
    meta: [{ title: "One | Company Settings" }],
  }),
  component: CompanySettingsPage,
});

type CS = Record<string, any> & { id: string };

function CompanySettingsPage() {
  const [data, setData] = useState<CS | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fetchSettings = useServerFn(getCompanySettings);
  const saveSettings = useServerFn(updateCompanySettings);

  const load = async () => {
    setLoading(true);
    try {
      const row = await fetchSettings();
      setData(row as CS | null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load settings");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const set = (key: string, value: any) =>
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!data) return;
    if (!data.company_name?.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
      toast.error("Invalid email format");
      return;
    }
    const numericKeys = [
      "starting_invoice_number", "decimal_places", "default_minimum_charge",
      "default_tax_percent", "payment_link_expiry_days",
    ];
    for (const k of numericKeys) {
      if (data[k] != null && Number(data[k]) < 0) {
        toast.error(`${k} must be >= 0`);
        return;
      }
    }

    setSaving(true);
    try {
      await saveSettings({ data: data as any });
      toast.success("Company settings saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const txt = (k: string) => data[k] ?? "";
  const num = (k: string) => (data[k] ?? 0) as number;
  const bool = (k: string) => Boolean(data[k]);

  return (
    <div className="space-y-6 max-w-5xl pb-24">
      <div className="flex items-start gap-4 sticky top-0 bg-background z-10 py-2">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Company Settings</h1>
            <p className="text-sm text-muted-foreground">Global configuration for the entire ERP. Admin-only.</p>
          </div>
        </div>
      </div>

      <Section title="1. Company Information">
        <Grid>
          <F label="Company Name *"><Input value={txt("company_name")} onChange={(e) => set("company_name", e.target.value)} /></F>
          <F label="Phone"><Input value={txt("phone")} onChange={(e) => set("phone", e.target.value)} /></F>
          <F label="Email"><Input type="email" value={txt("email")} onChange={(e) => set("email", e.target.value)} /></F>
          <F label="Website"><Input value={txt("website")} onChange={(e) => set("website", e.target.value)} /></F>
          <F label="Logo URL"><Input value={txt("logo_url")} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." /></F>
          <F label="Address"><Input className="overflow-hidden text-ellipsis whitespace-nowrap" value={txt("address")} onChange={(e) => set("address", e.target.value)} /></F>
        </Grid>
      </Section>

      <Section title="2. Business Identity">
        <Grid cols={3}>
          <F label="BIN Number"><Input value={txt("bin_number")} onChange={(e) => set("bin_number", e.target.value)} /></F>
          <F label="TIN Number"><Input value={txt("tax_number")} onChange={(e) => set("tax_number", e.target.value)} /></F>
          <F label="Trade License No"><Input value={txt("trade_license_no")} onChange={(e) => set("trade_license_no", e.target.value)} /></F>
        </Grid>
      </Section>

      <Section title="3. Billing Rules">
        <Grid>
          <F label="Default Minimum Charge"><Input type="number" min={0} step="0.01" value={num("default_minimum_charge")} onChange={(e) => set("default_minimum_charge", Number(e.target.value))} /></F>
          <F label="Default Tax Percent"><Input type="number" min={0} step="0.01" value={num("default_tax_percent")} onChange={(e) => set("default_tax_percent", Number(e.target.value))} /></F>
          <Toggle label="Auto Due Carry Forward" checked={bool("auto_due_carry_forward")} onChange={(v) => set("auto_due_carry_forward", v)} />
          <Toggle label="Allow Negative Balance" checked={bool("allow_negative_balance")} onChange={(v) => set("allow_negative_balance", v)} />
        </Grid>
      </Section>

      <Section title="5. Customer Rules">
        <Grid>
          <Toggle label="BIN Unique Enforcement" checked={bool("bin_unique_enforcement")} onChange={(v) => set("bin_unique_enforcement", v)} />
          <Toggle label="Allow Duplicate Mobile" checked={bool("allow_duplicate_mobile")} onChange={(v) => set("allow_duplicate_mobile", v)} />
          <Toggle label="Auto Assign Customer" checked={bool("enable_auto_assign")} onChange={(v) => set("enable_auto_assign", v)} />
          <Toggle label="Enable Month Rule" checked={bool("enable_month_rule")} onChange={(v) => set("enable_month_rule", v)} />
        </Grid>
      </Section>

      <Section title="6. Payment Settings">
        <Grid>
          <F label="Payment Mode">
            <Select value={txt("payment_mode") || "BKASH"} onValueChange={(v) => set("payment_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BKASH">bKash</SelectItem>
                <SelectItem value="NAGAD">Nagad</SelectItem>
                <SelectItem value="ROCKET">Rocket</SelectItem>
                <SelectItem value="BANK">Bank Transfer</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Payment Link Expiry (Days)"><Input type="number" min={0} value={num("payment_link_expiry_days")} onChange={(e) => set("payment_link_expiry_days", Number(e.target.value))} /></F>
          <Toggle label="Allow Partial Payment" checked={bool("allow_partial_payment")} onChange={(v) => set("allow_partial_payment", v)} />
          <Toggle label="Auto Collection Enable" checked={bool("auto_collection_enable")} onChange={(v) => set("auto_collection_enable", v)} />
        </Grid>
      </Section>

      <Section title="7. WhatsApp / SMS Settings">
        <Grid>
          <F label="SMS API Key (BulkSMSBD)"><Input type="password" value={txt("sms_api_key")} onChange={(e) => set("sms_api_key", e.target.value)} placeholder={data.has_sms_api_key ? "•••••••• (saved — leave blank to keep)" : "Enter API key"} /></F>
          <F label="Sender ID"><Input value={txt("sender_id")} onChange={(e) => set("sender_id", e.target.value)} /></F>
          <Toggle label="Auto-send SMS on Finalize" checked={bool("auto_messaging_enabled")} onChange={(v) => set("auto_messaging_enabled", v)} />
          <F label="Test SMS (send to your mobile)" full>
            <TestWhatsAppRow />
          </F>
          <F label="WhatsApp" full>
            <p className="text-xs text-muted-foreground">
              A prompt will appear when the bill is finalized. Clicking "Yes" will open WhatsApp Web in a new tab and pre-fill the chat with the client — just click the Send button. No API key required.
            </p>
          </F>
        </Grid>
      </Section>

      <Section title="8. bKash Settings">
        <Grid>
          <F label="Merchant Number"><Input value={txt("bkash_merchant_number")} onChange={(e) => set("bkash_merchant_number", e.target.value)} /></F>
          <F label="API Key"><Input type="password" value={txt("bkash_api_key")} onChange={(e) => set("bkash_api_key", e.target.value)} placeholder={data.has_bkash_api_key ? "•••••••• (saved — leave blank to keep)" : "Enter API key"} /></F>
          <F label="Secret Key"><Input type="password" value={txt("bkash_secret_key")} onChange={(e) => set("bkash_secret_key", e.target.value)} placeholder={data.has_bkash_secret_key ? "•••••••• (saved — leave blank to keep)" : "Enter secret key"} /></F>
          <F label="Callback URL"><Input value={txt("bkash_callback_url")} onChange={(e) => set("bkash_callback_url", e.target.value)} /></F>
        </Grid>
      </Section>

      <Section title="9. Branding">
        <Grid>
          <F label="Invoice Footer Text" full>
            <Textarea rows={3} value={txt("invoice_footer_text")} onChange={(e) => set("invoice_footer_text", e.target.value)} placeholder="Thank you for your business" />
          </F>
        </Grid>
      </Section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid gap-4 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{children}</div>;
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-2 ${full ? "md:col-span-full" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center justify-between rounded-md border px-3 h-9">
        <span className="text-sm text-muted-foreground">{checked ? "Enabled" : "Disabled"}</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function TestWhatsAppRow() {
  const [mobile, setMobile] = useState("");
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendTestSms);
  const onSend = async () => {
    if (!mobile.trim()) { toast.error("Enter a mobile number"); return; }
    setSending(true);
    try {
      await send({ data: { mobile: mobile.trim() } });
      toast.success("Test message sent");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setSending(false); }
  };
  return (
    <div className="flex gap-2">
      <Input placeholder="01XXXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} />
      <Button type="button" variant="outline" onClick={onSend} disabled={sending}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        <span className="ml-1">Send Test</span>
      </Button>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Settings as SettingsIcon } from "lucide-react";
import { getCompanySettings, updateCompanySettings } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/system")({
  head: () => ({
    meta: [{ title: "One | System Settings" }],
  }),
  component: SystemSettingsPage,
});

type CS = Record<string, any> & { id: string };

function SystemSettingsPage() {
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
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key: string, value: any) =>
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!data) return;
    const fields = [
      "strict_role_mode", "two_factor_auth", "login_retry_limit", "password_policy",
      "auto_logout", "session_timeout_minutes", "language", "date_format", "timezone",
      "default_report_month", "show_zero_balance", "include_disabled_cust",
    ];
    const payload: Record<string, any> = {};
    for (const k of fields) payload[k] = data[k];

    if (Number(payload.login_retry_limit) < 1 || Number(payload.login_retry_limit) > 20) {
      toast.error("Login Retry Limit must be 1-20");
      return;
    }
    if (Number(payload.session_timeout_minutes) < 0) {
      toast.error("Session Timeout must be >= 0");
      return;
    }

    setSaving(true);
    try {
      await saveSettings({ data: { id: data.id, ...payload } });
      toast.success("System settings saved");
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
    <div className="space-y-6 max-w-4xl pb-24">
      <div className="flex items-start gap-4 sticky top-0 bg-background z-10 py-2">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">System Settings</h1>
            <p className="text-sm text-muted-foreground">Security, session, language and report related settings.</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Security & Authentication</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle label="Strict Role Mode" checked={bool("strict_role_mode")} onChange={(v) => set("strict_role_mode", v)} />
            <Toggle label="Two-Factor Authentication" checked={bool("two_factor_auth")} onChange={(v) => set("two_factor_auth", v)} />
            <F label="Login Retry Limit">
              <Input type="number" min={1} max={20} value={num("login_retry_limit")} onChange={(e) => set("login_retry_limit", Number(e.target.value))} />
            </F>
            <F label="Password Policy">
              <Select value={txt("password_policy") || "STRONG"} onValueChange={(v) => set("password_policy", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEAK">Weak (6+ characters)</SelectItem>
                  <SelectItem value="MEDIUM">Medium (8+ characters, numbers)</SelectItem>
                  <SelectItem value="STRONG">Strong (8+ characters, numbers, special symbols)</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Session</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle label="Auto Logout" checked={bool("auto_logout")} onChange={(v) => set("auto_logout", v)} />
            <F label="Session Timeout">
              <Select value={String(num("session_timeout_minutes"))} onValueChange={(v) => set("session_timeout_minutes", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="480">8 hours</SelectItem>
                  <SelectItem value="720">12 hours</SelectItem>
                  <SelectItem value="1440">1 day</SelectItem>
                  <SelectItem value="2880">2 days</SelectItem>
                  <SelectItem value="4320">3 days</SelectItem>
                  <SelectItem value="10080">1 week</SelectItem>
                  <SelectItem value="20160">2 weeks</SelectItem>
                  <SelectItem value="43200">1 month</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Localization</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Language">
              <Select value={txt("language") || "bn"} onValueChange={(v) => set("language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bn">Bengali</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Date Format">
              <Select value={txt("date_format") || "DD/MM/YYYY"} onValueChange={(v) => set("date_format", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Timezone">
              <Select value={txt("timezone") || "Asia/Dhaka"} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Dhaka">Asia/Dhaka</SelectItem>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reports</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Default Report Month">
              <Select value={txt("default_report_month") || "CURRENT"} onValueChange={(v) => set("default_report_month", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURRENT">Current Month</SelectItem>
                  <SelectItem value="PREVIOUS">Previous Month</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <Toggle label="Show Zero Balance Customers" checked={bool("show_zero_balance")} onChange={(v) => set("show_zero_balance", v)} />
            <Toggle label="Include Disabled Customers" checked={bool("include_disabled_cust")} onChange={(v) => set("include_disabled_cust", v)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save System Settings
        </Button>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
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

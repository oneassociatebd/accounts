import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Receipt, Printer, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/invoice")({
  head: () => ({
    meta: [{ title: "One | Invoice Settings" }],
  }),
  component: InvoiceSettingsPage,
});

type CS = Record<string, any> & { id: string };

const TERM_PRESETS: { value: string; label: string }[] = [
  { value: "Payment due on receipt.", label: "Due on Receipt" },
  { value: "Payment due within 7 days.", label: "Net 7" },
  { value: "Payment due within 15 days.", label: "Net 15" },
  { value: "Payment due within 30 days.", label: "Net 30" },
  { value: "Payment due within 15 days. Late payment may incur 2% monthly interest.", label: "Net 15 + Late Fee (2% monthly)" },
  { value: "2% discount if paid within 10 days, otherwise full payment within 30 days.", label: "2/10 Net 30 - Early payment discount" },
  { value: "Payment due at end of month.", label: "EOM - End of Month" },
];

function InvoiceSettingsPage() {
  const [data, setData] = useState<CS | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);

  const uploadSignature = async (file: File) => {
    if (!data) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be uploaded");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be less than 2MB");
      return;
    }
    setUploadingSig(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `signatures/${data.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("company-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingSig(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: dbErr } = await supabase
      .from("company_settings")
      .update({ print_signature_url: url } as any)
      .eq("id", data.id);
    setUploadingSig(false);
    if (dbErr) { toast.error(dbErr.message); return; }
    setData((prev) => (prev ? { ...prev, print_signature_url: url } : prev));
    toast.success("Signature uploaded successfully");
  };

  const removeSignature = async () => {
    if (!data) return;
    const { error } = await supabase
      .from("company_settings")
      .update({ print_signature_url: null } as any)
      .eq("id", data.id);
    if (error) { toast.error(error.message); return; }
    setData((prev) => (prev ? { ...prev, print_signature_url: null } : prev));
    toast.success("Signature removed");
  };

  const load = async () => {
    setLoading(true);
    const { data: row, error } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    else setData(row as CS | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const set = (key: string, value: any) =>
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!data) return;
    const fields = [
      "invoice_active", "invoice_prefix", "starting_invoice_number",
      "memo_prefix", "currency", "decimal_places", "invoice_terms",
      "invoice_footer_text",
      "print_page_size", "print_orientation",
      "print_margin_top", "print_margin_bottom", "print_margin_left", "print_margin_right",
      "print_show_logo", "print_show_header", "print_show_footer",
      "print_copies", "print_signature_line", "print_signature_label",
    ];
    const payload: Record<string, any> = {};
    for (const k of fields) payload[k] = data[k];

    if (Number(payload.starting_invoice_number) < 0) {
      toast.error("Starting Invoice Number must be >= 0");
      return;
    }
    if (Number(payload.decimal_places) < 0 || Number(payload.decimal_places) > 4) {
      toast.error("Decimal Places must be 0-4");
      return;
    }
    for (const k of ["print_margin_top", "print_margin_bottom", "print_margin_left", "print_margin_right"]) {
      if (Number(payload[k]) < 0 || Number(payload[k]) > 100) {
        toast.error("Margins must be between 0 and 100 mm");
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase.from("company_settings").update(payload as any).eq("id", data.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Invoice settings saved");
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
          <Receipt className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Invoice Settings</h1>
            <p className="text-sm text-muted-foreground">Configure invoice numbering, format and footer.</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoice Configuration</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle label="Invoice Active" checked={bool("invoice_active")} onChange={(v) => set("invoice_active", v)} />
            <F label="Currency"><Input value={txt("currency")} onChange={(e) => set("currency", e.target.value)} placeholder="BDT" /></F>
            <F label="Invoice Prefix"><Input value={txt("invoice_prefix")} onChange={(e) => set("invoice_prefix", e.target.value)} placeholder="INV-" /></F>
            <F label="Memo Prefix"><Input value={txt("memo_prefix")} onChange={(e) => set("memo_prefix", e.target.value)} placeholder="RCV-" /></F>
            <F label="Starting Invoice Number"><Input type="number" min={0} value={num("starting_invoice_number")} onChange={(e) => set("starting_invoice_number", Number(e.target.value))} /></F>
            <F label="Decimal Places"><Input type="number" min={0} max={4} value={num("decimal_places")} onChange={(e) => set("decimal_places", Number(e.target.value))} /></F>
            <F label="Invoice Preview" full>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono text-foreground">
                {txt("invoice_prefix")}{String(num("starting_invoice_number") || 1).padStart(6, "0")}/{new Date().getFullYear()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Invoice number resets to 1 each year. Format: PREFIX000001/YYYY</p>
            </F>
            <F label="Memo Preview" full>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono text-foreground">
                {txt("memo_prefix")}{String(num("starting_invoice_number") || 1).padStart(6, "0")}/{new Date().getFullYear()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Format: PREFIX000001/YYYY</p>
            </F>
            <F label="Invoice Terms (Payment Conditions)" full>
              <Select
                value={TERM_PRESETS.some((t) => t.value === txt("invoice_terms")) ? txt("invoice_terms") : (txt("invoice_terms") ? "__custom__" : "")}
                onValueChange={(v) => {
                  if (v === "__custom__") set("invoice_terms", txt("invoice_terms") || "");
                  else set("invoice_terms", v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select Terms" /></SelectTrigger>
                <SelectContent>
                  {TERM_PRESETS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom (Write your own)</SelectItem>
                </SelectContent>
              </Select>
              <Textarea rows={2} value={txt("invoice_terms")} onChange={(e) => set("invoice_terms", e.target.value)} placeholder="Selected or custom terms will appear here" />
              <p className="text-xs text-muted-foreground">Will be automatically added to each invoice.</p>
            </F>
            <F label="Invoice Footer Text" full>
              <Textarea rows={3} value={txt("invoice_footer_text")} onChange={(e) => set("invoice_footer_text", e.target.value)} placeholder="Thank you for your business" />
            </F>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" /> Print Setup (Invoice & Memo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Page Size">
              <Select value={txt("print_page_size") || "A4"} onValueChange={(v) => set("print_page_size", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4 (210 x 297 mm)</SelectItem>
                  <SelectItem value="A5">A5 (148 x 210 mm)</SelectItem>
                  <SelectItem value="LETTER">Letter (8.5 x 11 in)</SelectItem>
                  <SelectItem value="LEGAL">Legal (8.5 x 14 in)</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Orientation">
              <Select value={txt("print_orientation") || "portrait"} onValueChange={(v) => set("print_orientation", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </F>

            <F label="Margin Top (mm)">
              <Input type="number" min={0} max={100} value={num("print_margin_top")} onChange={(e) => set("print_margin_top", Number(e.target.value))} />
            </F>
            <F label="Margin Bottom (mm)">
              <Input type="number" min={0} max={100} value={num("print_margin_bottom")} onChange={(e) => set("print_margin_bottom", Number(e.target.value))} />
            </F>
            <F label="Margin Left (mm)">
              <Input type="number" min={0} max={100} value={num("print_margin_left")} onChange={(e) => set("print_margin_left", Number(e.target.value))} />
            </F>
            <F label="Margin Right (mm)">
              <Input type="number" min={0} max={100} value={num("print_margin_right")} onChange={(e) => set("print_margin_right", Number(e.target.value))} />
            </F>

            <Toggle label="Show Logo on Print" checked={bool("print_show_logo")} onChange={(v) => set("print_show_logo", v)} />
            <Toggle label="Show Header on Print" checked={bool("print_show_header")} onChange={(v) => set("print_show_header", v)} />
            <Toggle label="Show Footer on Print" checked={bool("print_show_footer")} onChange={(v) => set("print_show_footer", v)} />

            <F label="Print Copies">
              <Select value={txt("print_copies") || "ORIGINAL"} onValueChange={(v) => set("print_copies", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORIGINAL">Original Only</SelectItem>
                  <SelectItem value="DUPLICATE">Duplicate Only</SelectItem>
                  <SelectItem value="BOTH">Both (Original + Duplicate)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">How many copies will be printed each time.</p>
            </F>

            <Toggle label="Signature Line" checked={bool("print_signature_line")} onChange={(v) => set("print_signature_line", v)} />
            <F label="Signature Label (optional)" full>
              <Input value={txt("print_signature_label")} onChange={(e) => set("print_signature_label", e.target.value)} placeholder="Authorized Signature" />
            </F>

            <F label="Signature Image (Upload from Local PC)" full>
              <div className="flex items-start gap-4 flex-wrap">
                {data.print_signature_url ? (
                  <div className="relative inline-block rounded-md border bg-muted p-2">
                    <img
                      src={data.print_signature_url}
                      alt="Signature"
                      className="h-20 w-auto object-contain"
                    />
                    <button
                      type="button"
                      onClick={removeSignature}
                      className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 shadow"
                      aria-label="Remove signature"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-40 rounded-md border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                    No signature
                  </div>
                )}
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                    {uploadingSig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingSig ? "Uploading..." : (data.print_signature_url ? "Change Signature" : "Upload Signature")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      disabled={uploadingSig}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadSignature(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">PNG/JPG/WEBP, max 2MB. Transparent background recommended.</p>
                </div>
              </div>
            </F>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Invoice Settings
        </Button>
      </div>
    </div>
  );
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

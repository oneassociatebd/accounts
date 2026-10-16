import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { z } from "zod";
import { saveVatDraft, finalizeVatSubmission, getVatSubmission } from "@/lib/vat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MonthPicker } from "@/components/month-picker";
import { VatClientSearch, type VatClient } from "@/components/vat-client-search";
import { Save, CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vat/new")({
  validateSearch: (search) => z.object({ id: z.string().uuid().optional() }).parse(search),
  head: () => ({ meta: [{ title: "VAT Return Submission Entry" }] }),
  component: VatSubmissionEntry,
});

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatPeriod = (ym: string) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
};
const parsePeriod = (p: string): string => {
  const m = p.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return "";
  const idx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1].toLowerCase());
  if (idx < 0) return "";
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
};

function VatSubmissionEntry() {
  const { id } = useSearch({ from: "/_authenticated/vat/new" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveVatDraft);
  const finalize = useServerFn(finalizeVatSubmission);
  const fetchOne = useServerFn(getVatSubmission);

  const [client, setClient] = useState<VatClient | null>(null);
  const [taxPeriod, setTaxPeriod] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }); // YYYY-MM, defaults to previous month
  const [submissionId, setSubmissionId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "FINALIZED" | "NEW">("NEW");
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["vat-submission", id],
    queryFn: () => fetchOne({ data: { id: id! } }),
    enabled: !!id,
  });

  useEffect(() => {
    if (existing) {
      const c = (existing as any).customer;
      setClient({
        id: c.id, company_name: c.company_name, name: c.name, mobile: c.mobile,
        address: c.address, bin_number: c.bin_number,
      });
      setTaxPeriod(parsePeriod(existing.tax_period));
      setSubmissionId(existing.submission_id);
      setRemarks(existing.remarks || "");
      setStatus(existing.status as "DRAFT" | "FINALIZED");
    }
  }, [existing]);

  const validate = (): string | null => {
    if (!client) return "Please select a client.";
    if (!taxPeriod) return "Please select a tax period.";
    if (!submissionId.trim()) return "Submission ID is required.";
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSavingDraft(true);
    try {
      const result = await save({ data: {
        id: id || undefined,
        customer_id: client!.id,
        tax_period: formatPeriod(taxPeriod),
        submission_id: submissionId.trim(),
        remarks: remarks.trim() || null,
      }});
      toast.success("Draft saved successfully.");
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
      qc.invalidateQueries({ queryKey: ["vat-dashboard"] });
      navigate({ to: "/vat/drafts" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save draft");
    } finally { setSavingDraft(false); }
  };

  const handleFinalize = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!confirm("Finalize this submission? SMS will be sent immediately.")) return;
    setFinalizing(true);
    try {
      const result: any = await finalize({ data: {
        id: id || undefined,
        customer_id: client!.id,
        tax_period: formatPeriod(taxPeriod),
        submission_id: submissionId.trim(),
        remarks: remarks.trim() || null,
      }});
      toast.success("Submission finalized successfully.");
      if (result?.sms_status === "FAILED") {
        toast.warning(`SMS failed: ${result.sms_response}`);
      } else if (result?.sms_status === "SENT") {
        toast.success("SMS sent to client.");
      }
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
      qc.invalidateQueries({ queryKey: ["vat-dashboard"] });
      navigate({ to: "/vat/finalized" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to finalize");
    } finally { setFinalizing(false); }
  };

  const isFinalized = status === "FINALIZED";

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/vat/drafts" })} className="-ml-2 mb-1">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            VAT Return Submission Entry
            {status !== "NEW" && (
              <Badge variant={isFinalized ? "default" : "secondary"}>{status}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {id ? "Edit submission details" : "Create a new VAT return submission"}
          </p>
        </div>
      </div>

      {isLoading && id ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Submission Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Company Name <span className="text-destructive">*</span></Label>
              <VatClientSearch value={client} onChange={setClient} disabled={isFinalized} />
            </div>

            {client && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="min-w-0 sm:col-span-1">
                    <div className="text-xs text-muted-foreground">Company Name</div>
                    <div className="font-medium truncate">{client.company_name || client.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Mobile</div>
                    <div className="font-mono">{client.mobile || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">BIN</div>
                    <div className="font-mono">{client.bin_number || "-"}</div>
                  </div>
                  {client.address && (
                    <div className="sm:col-span-3">
                      <div className="text-xs text-muted-foreground">Address</div>
                      <div>{client.address}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">Tax Period <span className="text-destructive">*</span></Label>
                <MonthPicker value={taxPeriod} onChange={setTaxPeriod} placeholder="Pick month-year" />
                {taxPeriod && <p className="text-xs text-muted-foreground mt-1">Will be stored as: <b>{formatPeriod(taxPeriod)}</b></p>}
              </div>
              <div>
                <Label className="mb-1.5 block">Submission ID <span className="text-destructive">*</span></Label>
                <Input
                  placeholder=""
                  value={submissionId}
                  onChange={(e) => setSubmissionId(e.target.value)}
                  maxLength={50}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">Remarks</Label>
              <Textarea
                placeholder="Optional notes..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Submission Date</Label>
              <Input
                value={isFinalized ? (existing?.submission_date || "") : "Auto-generated on finalize"}
                disabled
                className="bg-muted"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/vat/drafts" })}>Cancel</Button>
        {!isFinalized && (
          <Button variant="secondary" onClick={handleSaveDraft} disabled={savingDraft || finalizing}>
            {savingDraft ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Draft
          </Button>
        )}
        <Button onClick={handleFinalize} disabled={savingDraft || finalizing}>
          {finalizing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          {isFinalized ? "Update Submission" : "Finalize Submission"}
        </Button>
      </div>
    </div>
  );
}

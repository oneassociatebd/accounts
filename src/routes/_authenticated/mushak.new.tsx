import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import {
  saveMushakDraft, finalizeMushakSubmission, getMushakSubmission,
  searchMushakClients, listMushakItems, sendMushakSubmissionSms,
} from "@/lib/mushak.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/month-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Save, CheckCircle2, Loader2, Search, MessageSquare, CalendarIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mushak/new")({
  validateSearch: (s) => z.object({ id: z.string().uuid().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Mushak 4.3 Submission Entry" }] }),
  component: MushakEntryPage,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatPeriod = (ym: string) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};
const parsePeriod = (p: string): string => {
  const m = p.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return "";
  const idx = MONTHS.findIndex((n) => n.toLowerCase() === m[1].toLowerCase());
  if (idx < 0) return "";
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
};

type Client = {
  id: string; company_name: string | null; name: string | null;
  mobile: string | null; address: string | null; bin_number: string | null;
  reference_id: string | null; reference_name?: string | null;
};

function ClientSearch({ value, onChange, disabled }: { value: Client | null; onChange: (c: Client | null) => void; disabled?: boolean }) {
  const searchFn = useServerFn(searchMushakClients);
  const [search, setSearch] = useState<string>(value ? (value.company_name || value.name || "") : "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setSearch(value ? (value.company_name || value.name || "") : ""); }, [value?.id]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const { data = [] } = useQuery({
    queryKey: ["mushak-client-search", search],
    queryFn: () => searchFn({ data: { query: search } }) as Promise<Client[]>,
    enabled: open && search.trim().length >= 2,
  });
  return (
    <div ref={ref} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Search by company name, BIN, mobile..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        className="pl-8"
      />
      {open && search.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
          {(data as Client[]).length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No matches</div>
          ) : (data as Client[]).map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => { onChange(c); setSearch(c.company_name || c.name || ""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
            >
              <div className="font-medium">{c.company_name || c.name}</div>
              <div className="text-xs text-muted-foreground">BIN: {c.bin_number || "-"} · {c.mobile || "-"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MushakEntryPage() {
  const { id } = useSearch({ from: "/_authenticated/mushak/new" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveMushakDraft);
  const finalize = useServerFn(finalizeMushakSubmission);
  const fetchOne = useServerFn(getMushakSubmission);
  const fetchItems = useServerFn(listMushakItems);
  const sendSms = useServerFn(sendMushakSubmissionSms);

  const [client, setClient] = useState<Client | null>(null);
  const [referenceName, setReferenceName] = useState("");
  const [taxPeriod, setTaxPeriod] = useState("");
  const [submissionDate, setSubmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [itemName, setItemName] = useState("");
  const [boeNo, setBoeNo] = useState("");
  const [boeDate, setBoeDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submissionIdShown, setSubmissionIdShown] = useState("");
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [status, setStatus] = useState<"DRAFT" | "FINALIZED" | "NEW">("NEW");
  const [busyDraft, setBusyDraft] = useState(false);
  const [busyFinal, setBusyFinal] = useState(false);
  const [busySms, setBusySms] = useState(false);

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["mushak-items-active"],
    queryFn: () => fetchItems({ data: { only_active: true } }) as Promise<any[]>,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["mushak-submission", id],
    queryFn: () => fetchOne({ data: { id: id! } }),
    enabled: !!id,
  });

  useEffect(() => {
    if (existing) {
      const c = (existing as any).customer;
      setClient(c ? {
        id: c.id, company_name: c.company_name, name: c.name, mobile: c.mobile,
        address: c.address, bin_number: c.bin_number, reference_id: c.reference_id ?? null,
      } : null);
      setReferenceName((existing as any).reference?.reference_name || "");
      setTaxPeriod(parsePeriod((existing as any).tax_period));
      setSubmissionDate((existing as any).submission_date || new Date().toISOString().slice(0, 10));
      setItemName((existing as any).item_name || "");
      setBoeNo((existing as any).boe_no || "");
      setBoeDate((existing as any).boe_date || "");
      setRemarks((existing as any).remarks || "");
      setSubmissionIdShown((existing as any).submission_id);
      setSavedId((existing as any).id);
      setStatus((existing as any).status);
    }
  }, [existing]);

  // Auto-populate reference name when client changes
  useEffect(() => {
    if (!client) { setReferenceName(""); return; }
    if (client.reference_name) { setReferenceName(client.reference_name); return; }
    if ((existing as any)?.reference?.reference_name && (existing as any)?.customer?.id === client.id) {
      setReferenceName((existing as any).reference.reference_name);
      return;
    }
    setReferenceName("");
  }, [client?.id, client?.reference_name, existing]);

  const validate = (): string | null => {
    if (!client) return "Please select a client.";
    if (!submissionIdShown.trim()) return "Submission ID is required.";
    if (!taxPeriod) return "Please select a tax period.";
    if (!submissionDate) return "Submission date is required.";
    if (!itemName) return "Please select an item.";
    if (!boeNo.trim()) return "BOE No is required.";
    if (!boeDate) return "BOE Date is required.";
    return null;
  };

  const payload = () => ({
    id: savedId,
    submission_id: submissionIdShown.trim(),
    customer_id: client!.id,
    reference_id: client?.reference_id ?? null,
    tax_period: formatPeriod(taxPeriod),
    submission_date: submissionDate,
    item_name: itemName,
    boe_no: boeNo.trim(),
    boe_date: boeDate,
    remarks: remarks.trim() || null,
  });

  const handleSaveDraft = async () => {
    const e = validate(); if (e) { toast.error(e); return; }
    setBusyDraft(true);
    try {
      const r: any = await save({ data: payload() });
      toast.success("Draft saved");
      if (r?.submission_id) setSubmissionIdShown(r.submission_id);
      if (r?.id) setSavedId(r.id);
      setStatus("DRAFT");
      qc.invalidateQueries({ queryKey: ["mushak-submissions"] });
      qc.invalidateQueries({ queryKey: ["mushak-dashboard"] });
      
    } catch (err: any) { toast.error(err?.message || "Failed"); }
    finally { setBusyDraft(false); }
  };

  const handleFinalize = async () => {
    const e = validate(); if (e) { toast.error(e); return; }
    if (!confirm("Finalize this submission?")) return;
    setBusyFinal(true);
    try {
      const r: any = await finalize({ data: payload() });
      toast.success("Submission finalized");
      if (r?.id) setSavedId(r.id);
      setStatus("FINALIZED");
      if (r?.sms?.status === "SENT") toast.success("SMS sent to client");
      else if (r?.sms) toast.error(`SMS failed: ${r.sms.response}`);
      qc.invalidateQueries({ queryKey: ["mushak-submissions"] });
      qc.invalidateQueries({ queryKey: ["mushak-dashboard"] });
    } catch (err: any) { toast.error(err?.message || "Failed"); }
    finally { setBusyFinal(false); }
  };

  const handleSms = async () => {
    if (!savedId) { toast.error("Save the submission first"); return; }
    setBusySms(true);
    try {
      const r: any = await sendSms({ data: { id: savedId } });
      if (r.status === "SENT") toast.success("SMS sent to client");
      else toast.error(`SMS failed: ${r.response}`);
    } catch (err: any) { toast.error(err?.message || "Failed"); }
    finally { setBusySms(false); }
  };

  const isFinalized = status === "FINALIZED";

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          Mushak 4.3 Submission Entry
          {status !== "NEW" && <Badge variant={isFinalized ? "default" : "secondary"}>{status}</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {id ? "Edit submission details" : "Create a new Mushak 4.3 submission"}
        </p>
      </div>

      {isLoading && id ? (
        <Card><CardContent className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Submission Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Client <span className="text-destructive">*</span></Label>
              <ClientSearch value={client} onChange={setClient} disabled={isFinalized} />
            </div>

            {client && (
              <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Company</div><div className="font-medium truncate">{client.company_name || client.name}</div></div>
                <div><div className="text-xs text-muted-foreground">Reference</div><div className="font-medium truncate">{referenceName || "-"}</div></div>
                <div><div className="text-xs text-muted-foreground">Mobile</div><div className="font-mono">{client.mobile || "-"}</div></div>
                <div><div className="text-xs text-muted-foreground">BIN</div><div className="font-mono">{client.bin_number || "-"}</div></div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="mb-1.5 block">Submission ID <span className="text-destructive">*</span></Label>
                <Input
                  value={submissionIdShown}
                  onChange={(e) => setSubmissionIdShown(e.target.value)}
                  maxLength={50}
                  disabled={isFinalized}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Tax Period <span className="text-destructive">*</span></Label>
                <MonthPicker value={taxPeriod} onChange={setTaxPeriod} placeholder="Pick month-year" />
                {taxPeriod && <p className="text-xs text-muted-foreground mt-1">Stored as: <b>{formatPeriod(taxPeriod)}</b></p>}
              </div>
              <div>
                <Label className="mb-1.5 block">Submission Date <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isFinalized}
                      className={cn("w-full justify-start text-left font-normal", !submissionDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {submissionDate ? format(new Date(submissionDate), "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={submissionDate ? new Date(submissionDate) : undefined}
                      onSelect={(d) => d && setSubmissionDate(format(d, "yyyy-MM-dd"))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="mb-1.5 block">Item Name <span className="text-destructive">*</span></Label>
                <Select value={itemName} onValueChange={setItemName} disabled={isFinalized}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {items.map((it) => (
                      <SelectItem key={it.id} value={it.item_name}>{it.item_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">BOE No <span className="text-destructive">*</span></Label>
                <Input value={boeNo} onChange={(e) => setBoeNo(e.target.value)} maxLength={100} disabled={isFinalized} />
              </div>
              <div>
                <Label className="mb-1.5 block">BOE Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={boeDate} onChange={(e) => setBoeDate(e.target.value)} disabled={isFinalized} />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={2000} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/mushak/drafts" })}>Cancel</Button>
        {!isFinalized && (
          <Button variant="secondary" onClick={handleSaveDraft} disabled={busyDraft || busyFinal}>
            {busyDraft ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Draft
          </Button>
        )}
        <Button onClick={handleFinalize} disabled={busyDraft || busyFinal}>
          {busyFinal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          {isFinalized ? "Update Submission" : "Finalise"}
        </Button>
        {savedId && (
          <Button variant="outline" onClick={handleSms} disabled={busySms}>
            {busySms ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
            SMS
          </Button>
        )}
      </div>
    </div>
  );
}

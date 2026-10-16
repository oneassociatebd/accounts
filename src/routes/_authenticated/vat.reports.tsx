import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listVatSubmissions } from "@/lib/vat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Printer, FileSpreadsheet } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";
import { MonthPicker } from "@/components/month-picker";


export const Route = createFileRoute("/_authenticated/vat/reports")({
  head: () => ({ meta: [{ title: "Return Report" }] }),
  component: VatReportsPage,
});

function VatReportsPage() {
  const fetchAll = useServerFn(listVatSubmissions);
  const [status, setStatus] = useState<"ALL" | "DRAFT" | "FINALIZED">("ALL");
  const [search, setSearch] = useState("");
  const [taxPeriod, setTaxPeriod] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [reference, setReference] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["vat-submissions", { status, search: "" }],
    queryFn: () => fetchAll({ data: { status, search: "" } }),
  });

  const rows = useMemo(() => {
    let r = (data ?? []) as any[];
    const s = search.toLowerCase();
    if (s) r = r.filter((x) =>
      (x.customer?.company_name || "").toLowerCase().includes(s) ||
      (x.customer?.name || "").toLowerCase().includes(s) ||
      (x.customer?.bin_number || "").toLowerCase().includes(s) ||
      (x.customer?.mobile || "").includes(s) ||
      (x.submission_id || "").toLowerCase().includes(s)
    );
    if (taxPeriod) {
      const [y, m] = taxPeriod.split("-");
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const periodStr = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
      r = r.filter((x) => (x.tax_period || "").toLowerCase().includes(periodStr.toLowerCase()));
    }
    if (reference) {
      const ref = reference.toLowerCase();
      r = r.filter((x) => (x.submission_id || "").toLowerCase().includes(ref) || (x.remarks || "").toLowerCase().includes(ref));
    }
    if (dateFrom) r = r.filter((x) => x.submission_date && x.submission_date >= dateFrom);
    if (dateTo) r = r.filter((x) => x.submission_date && x.submission_date <= dateTo);
    return r;
  }, [data, search, taxPeriod, reference, dateFrom, dateTo]);

  const exportCsv = () => {
    const headers = ["Client", "BIN", "Mobile", "Tax Period", "Submission ID", "Submission Date", "Status", "Created By"];
    const lines = [headers.join(",")];
    rows.forEach((r: any) => {
      const fields = [
        r.customer?.company_name || r.customer?.name || "",
        r.customer?.bin_number || "",
        r.customer?.mobile || "",
        r.tax_period,
        r.submission_id,
        r.submission_date || "",
        r.status,
        r.created_by_name || "",
      ].map((f) => `"${String(f).replace(/"/g, '""')}"`);
      lines.push(fields.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vat-report-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const esc = (v: unknown) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const html = `<!doctype html><html><head><title>Return Report</title>
      <style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3f4f6}h1{font-size:18px}</style>
      </head><body><h1>VAT Return Report</h1>
      <p style="font-size:12px;color:#666">Generated: ${new Date().toLocaleString()} • ${rows.length} records</p>
      <table><thead><tr><th>Client</th><th>BIN</th><th>Mobile</th><th>Tax Period</th><th>Submission ID</th><th>Sub. Date</th><th>Status</th><th>Created By</th></tr></thead>
      <tbody>${rows.map((r: any) => `<tr>
        <td>${esc(r.customer?.company_name || r.customer?.name || "")}</td>
        <td>${esc(r.customer?.bin_number || "")}</td>
        <td>${esc(r.customer?.mobile || "")}</td>
        <td>${esc(r.tax_period)}</td>
        <td>${esc(r.submission_id)}</td>
        <td>${esc(r.submission_date || "")}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.created_by_name || "")}</td>
      </tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Return Report</h1>
        <p className="text-sm text-muted-foreground">Filter and export VAT return submission data</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name/BIN/Mobile/ID" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Tax Period</Label>
              <MonthPicker value={taxPeriod} onChange={setTaxPeriod} placeholder="Pick a month" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Sub ID / Remarks" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="FINALIZED">Finalized</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex">
          <CardTitle>Report ({rows.length})</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={8} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No records match filters.</div> : (
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full min-w-[1000px] text-sm">
                <TableHeader className="sticky top-0 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead>Client</TableHead><TableHead>BIN</TableHead><TableHead>Mobile</TableHead>
                    <TableHead>Tax Period</TableHead><TableHead>Submission ID</TableHead>
                    <TableHead>Sub. Date</TableHead><TableHead>Status</TableHead><TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.customer?.bin_number || "-"}</TableCell>
                      <TableCell>{r.customer?.mobile || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{r.tax_period}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                      <TableCell className="text-xs">{r.submission_date || "-"}</TableCell>
                      <TableCell><Badge variant={r.status === "FINALIZED" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.created_by_name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

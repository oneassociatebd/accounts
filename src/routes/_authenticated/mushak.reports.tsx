import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMushakSubmissions } from "@/lib/mushak.functions";
import { listReferences } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileDown, Printer, FileSpreadsheet } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";
import { MonthPicker } from "@/components/month-picker";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatPeriod = (ym: string) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

export const Route = createFileRoute("/_authenticated/mushak/reports")({
  head: () => ({ meta: [{ title: "Mushak 4.3 Reports" }] }),
  component: MushakReportsPage,
});

function MushakReportsPage() {
  const fetchAll = useServerFn(listMushakSubmissions);
  const fetchRefs = useServerFn(listReferences);
  const [status, setStatus] = useState<"ALL" | "DRAFT" | "FINALIZED">("ALL");
  const [search, setSearch] = useState("");
  const [taxPeriod, setTaxPeriod] = useState("");
  const [referenceId, setReferenceId] = useState<string>("ALL");
  const [subFrom, setSubFrom] = useState("");
  const [subTo, setSubTo] = useState("");
  const [tab, setTab] = useState<"customer" | "reference">("customer");

  const { data, isLoading } = useQuery({
    queryKey: ["mushak-submissions", { status }],
    queryFn: () => fetchAll({ data: { status } }),
  });

  const { data: refs = [] } = useQuery<any[]>({
    queryKey: ["references-active"],
    queryFn: () => fetchRefs() as Promise<any[]>,
  });

  const rows = useMemo(() => {
    let r = (data ?? []) as any[];
    const s = search.toLowerCase();
    if (s) r = r.filter((x) =>
      (x.customer?.company_name || "").toLowerCase().includes(s) ||
      (x.customer?.name || "").toLowerCase().includes(s) ||
      (x.customer?.bin_number || "").toLowerCase().includes(s) ||
      (x.reference?.reference_name || "").toLowerCase().includes(s) ||
      (x.item_name || "").toLowerCase().includes(s) ||
      (x.boe_no || "").toLowerCase().includes(s) ||
      (x.submission_id || "").toLowerCase().includes(s)
    );
    if (taxPeriod) {
      const p = formatPeriod(taxPeriod);
      r = r.filter((x) => (x.tax_period || "") === p);
    }
    if (referenceId !== "ALL") r = r.filter((x) => x.reference_id === referenceId);
    if (subFrom) r = r.filter((x) => x.submission_date && x.submission_date >= subFrom);
    if (subTo) r = r.filter((x) => x.submission_date && x.submission_date <= subTo);
    return r;
  }, [data, search, taxPeriod, referenceId, subFrom, subTo]);

  const exportCsv = () => {
    const headers = tab === "customer"
      ? ["Client", "Submission ID", "Tax Period", "Item", "BOE No", "BOE Date", "Submission Date"]
      : ["Reference", "Client", "Submission ID", "Item", "BOE No", "BOE Date"];
    const lines = [headers.join(",")];
    rows.forEach((r: any) => {
      const fields = tab === "customer" ? [
        r.customer?.company_name || r.customer?.name || "",
        r.submission_id, r.tax_period, r.item_name, r.boe_no, r.boe_date, r.submission_date,
      ] : [
        r.reference?.reference_name || "",
        r.customer?.company_name || r.customer?.name || "",
        r.submission_id, r.item_name, r.boe_no, r.boe_date,
      ];
      lines.push(fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mushak43-${tab}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const isCust = tab === "customer";
    const head = isCust
      ? [["Client", "Submission ID", "Tax Period", "Item", "BOE No", "BOE Date", "Sub. Date"]]
      : [["Reference", "Client", "Submission ID", "Item", "BOE No", "BOE Date"]];
    const body = rows.map((r: any) => isCust
      ? [r.customer?.company_name || r.customer?.name || "", r.submission_id, r.tax_period, r.item_name, r.boe_no, r.boe_date, r.submission_date]
      : [r.reference?.reference_name || "", r.customer?.company_name || r.customer?.name || "", r.submission_id, r.item_name, r.boe_no, r.boe_date]
    );
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(`${isCust ? "Customer Wise" : "Reference Wise"} Mushak 4.3 Report`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()} • ${rows.length} records`, 14, 20);
    autoTable(doc, {
      head, body, startY: 24, styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [243, 244, 246], textColor: 20 },
    });
    doc.save(`mushak43-${tab}-${Date.now()}.pdf`);
  };

  const handlePrint = async () => {
    // Open a clean window with just the report to avoid freezing the app on print
    const esc = (v: unknown) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const isCust = tab === "customer";
    const headerCols = isCust
      ? `<th>Client</th><th>Submission ID</th><th>Tax Period</th><th>Item</th><th>BOE No</th><th>BOE Date</th><th>Sub. Date</th>`
      : `<th>Reference</th><th>Client</th><th>Submission ID</th><th>Item</th><th>BOE No</th><th>BOE Date</th>`;
    const bodyRows = rows.map((r: any) => isCust ? `<tr>
        <td>${esc(r.customer?.company_name || r.customer?.name || "")}</td>
        <td>${esc(r.submission_id)}</td><td>${esc(r.tax_period)}</td><td>${esc(r.item_name)}</td>
        <td>${esc(r.boe_no)}</td><td>${esc(r.boe_date)}</td><td>${esc(r.submission_date)}</td></tr>`
      : `<tr><td>${esc(r.reference?.reference_name || "")}</td>
        <td>${esc(r.customer?.company_name || r.customer?.name || "")}</td>
        <td>${esc(r.submission_id)}</td><td>${esc(r.item_name)}</td>
        <td>${esc(r.boe_no)}</td><td>${esc(r.boe_date)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><title>Mushak 4.3 Report</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ccc;padding:6px;text-align:left}
      th{background:#f3f4f6}h1{font-size:18px;margin:0 0 8px}</style>
      </head><body><h1>${isCust ? "Customer Wise" : "Reference Wise"} Mushak 4.3 Report</h1>
      <p style="font-size:12px;color:#666">Generated: ${new Date().toLocaleString()} • ${rows.length} records</p>
      <table><thead><tr>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mushak 4.3 Reports</h1>
        <p className="text-sm text-muted-foreground">Filter and export Mushak 4.3 submissions</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client/Ref/Item/BOE..." className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Tax Period</Label>
              <MonthPicker value={taxPeriod} onChange={setTaxPeriod} placeholder="Pick month-year" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="FINALIZED">Finalised</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Select value={referenceId} onValueChange={setReferenceId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All references" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All References</SelectItem>
                  {refs.filter((r) => r.is_active !== false).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.reference_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Sub. From</Label><Input type="date" value={subFrom} onChange={(e) => setSubFrom(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Sub. To</Label><Input type="date" value={subTo} onChange={(e) => setSubTo(e.target.value)} className="h-9" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex">
          <CardTitle>Report ({rows.length})</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
            <TabsList>
              <TabsTrigger value="customer">Customer Wise</TabsTrigger>
              <TabsTrigger value="reference">Reference Wise</TabsTrigger>
            </TabsList>
            <TabsContent value="customer">
              {isLoading ? <TableSkeleton rows={6} cols={7} /> :
                rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No records.</div> : (
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full min-w-[900px] text-sm">
                    <TableHeader className="sticky top-0 bg-background [&_th]:bg-background">
                      <TableRow>
                        <TableHead>Client</TableHead><TableHead>Submission ID</TableHead><TableHead>Tax Period</TableHead>
                        <TableHead>Item</TableHead><TableHead>BOE No</TableHead><TableHead>BOE Date</TableHead>
                        <TableHead>Sub. Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                          <TableCell><Badge variant="outline">{r.tax_period}</Badge></TableCell>
                          <TableCell>{r.item_name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.boe_no}</TableCell>
                          <TableCell className="text-xs">{r.boe_date}</TableCell>
                          <TableCell className="text-xs">{r.submission_date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="reference">
              {isLoading ? <TableSkeleton rows={6} cols={6} /> :
                rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No records.</div> : (
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full min-w-[900px] text-sm">
                    <TableHeader className="sticky top-0 bg-background [&_th]:bg-background">
                      <TableRow>
                        <TableHead>Reference</TableHead><TableHead>Client</TableHead><TableHead>Submission ID</TableHead>
                        <TableHead>Item</TableHead><TableHead>BOE No</TableHead><TableHead>BOE Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.reference?.reference_name || "-"}</TableCell>
                          <TableCell>{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                          <TableCell>{r.item_name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.boe_no}</TableCell>
                          <TableCell className="text-xs">{r.boe_date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

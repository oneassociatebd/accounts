import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCustomerReport } from "@/lib/reports.functions";
import { listAreas, listCustomerTypes, listReferences } from "@/lib/erp.functions";
import {
  ReportFilters, SummaryCards, ReportTitle,
} from "@/components/reports/ReportShell";
import * as XLSX from "xlsx";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/reports/customer")({
  head: () => ({ meta: [{ title: "One | Customer Report" }] }),
  component: CustomerReportPage,
});

function CustomerReportPage() {
  const fetchReport = useServerFn(getCustomerReport);
  const fetchAreas = useServerFn(listAreas);
  const fetchTypes = useServerFn(listCustomerTypes);
  const fetchReferences = useServerFn(listReferences);

  const [areaId, setAreaId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filters = useMemo(() => ({
    area_id: areaId || undefined,
    customer_type_id: typeId || undefined,
    reference_id: referenceId || undefined,
    is_active: status === "all" ? undefined : status === "active",
  }), [areaId, typeId, referenceId, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["report-customer", filters],
    queryFn: () => fetchReport({ data: filters }),
  });

  const { data: areas } = useQuery({ queryKey: ["areas-all"], queryFn: () => fetchAreas() });
  const { data: types } = useQuery({ queryKey: ["ctypes-all"], queryFn: () => fetchTypes() });
  const { data: references } = useQuery<any[]>({ 
    queryKey: ["references-active"], 
    queryFn: () => fetchReferences() as Promise<any[]> 
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const rows = data?.rows ?? [];
  const s = data?.summary;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r: any) => {
      const name = (r.name ?? r.company_name ?? "").toLowerCase();
      const bin = (r.bin_number ?? "").toLowerCase();
      const mobile = (r.mobile ?? "").toLowerCase();
      return name.includes(q) || bin.includes(q) || mobile.includes(q);
    });
  }, [rows, search]);

  const newThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    return rows.filter((r: any) => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [rows]);

  const onExcel = () => {
    const headers = ["BIN", "Company Name", "Address", "Mobile", "Reference", "Activity", "User Name", "Password"];
    const body = filteredRows.map((r: any) => [
      r.bin_number ?? "",
      r.company_name ?? r.name ?? "",
      r.address ?? "",
      r.mobile ?? "",
      r.reference_name ?? "",
      r.is_active ? "Active" : "Inactive",
      r.vat_user_id ?? "",
      r.vat_password ?? "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `customer-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const selectedArea = areas?.find(a => a.id === areaId)?.area_name;
  const selectedReference = references?.find(r => r.id === referenceId)?.reference_name;
  const selectedType = types?.find(t => t.id === typeId)?.type_name;

  const onPrintPreview = () => {
    const printNode = document.getElementById("customer-report-print");
    if (!printNode) return;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc) {
      frame.remove();
      return;
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join("\n");

    doc.open();
    doc.write(`<!doctype html>
      <html>
        <head>
          <title>Customer Report</title>
          ${styles}
          <style>
            @page { size: A4; margin: 12mm; }
            html, body { margin: 0; background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { padding: 0; }
            #customer-report-print { width: 100% !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; background: white !important; color: black !important; }
            table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          </style>
        </head>
        <body>${printNode.outerHTML}</body>
      </html>`);
    doc.close();

    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 500);
    }, 250);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          #customer-report-print, #customer-report-print * { visibility: visible !important; }
          /* Neutralize Radix Dialog overlay/content clipping & transforms */
          [data-radix-portal], [data-radix-dialog-overlay], [data-radix-dialog-content],
          #customer-report-print, #customer-report-print * {
            background: white !important;
          }
          [data-radix-dialog-overlay] { position: static !important; inset: auto !important; }
          [data-radix-dialog-content] {
            position: static !important;
            transform: none !important;
            inset: auto !important;
            max-width: none !important;
            max-height: none !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          [data-radix-dialog-content] > * { overflow: visible !important; max-height: none !important; }
          #customer-report-print {
            position: static !important;
            width: 100% !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .no-print, .no-print * { display: none !important; visibility: hidden !important; }
        }
      `}} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportTitle title="Customer Report" />
        <div className="relative w-full sm:w-72 print:hidden">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, BIN, mobile..."
            className="pl-8"
          />
        </div>
      </div>


      <div className="flex flex-col gap-4">
        <div className="print:hidden">
          <ReportFilters
            showDate={false}
            areaId={areaId} onAreaChange={setAreaId}
            areas={(areas ?? []) as any}
            referenceId={referenceId} onReferenceChange={setReferenceId}
            references={(references ?? []) as any}
            onPrint={() => setPreviewOpen(true)} onExcel={onExcel}
            printLabel="Preview & Print"
            printIcon="eye"
            extraSlot={
              <>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={typeId || "all"} onValueChange={(v) => setTypeId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {((types ?? []) as any[]).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.type_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
          />
        </div>
      </div>



      <div className="print:hidden">
        <SummaryCards items={[
          { label: "Total", value: s?.total ?? 0 },
          { label: "Active", value: s?.active ?? 0, tone: "success" },
          { label: "Inactive", value: s?.inactive ?? 0, tone: "warning" },
          { label: "New This Month", value: newThisMonth, tone: "default" },
        ]} />
      </div>

      {(areaId || referenceId || typeId || status !== "all") && (
        <Card className="bg-muted/50 print:hidden">
          <CardContent className="p-3 text-sm flex flex-wrap gap-x-6 gap-y-2">
            {areaId && <div><span className="font-semibold">Area:</span> {selectedArea}</div>}
            {referenceId && <div><span className="font-semibold">Reference:</span> {selectedReference}</div>}
            {typeId && <div><span className="font-semibold">Type:</span> {selectedType}</div>}
            {status !== "all" && <div><span className="font-semibold">Status:</span> <span className="capitalize">{status}</span></div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No customers found.</div>
          ) : (
            <Table>
              <TableHeader className="print:bg-muted/10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Mobile</TableHead>
                  {!typeId && <TableHead>Type</TableHead>}
                  <TableHead>VAT ID</TableHead>
                  <TableHead>Password</TableHead>
                  {!referenceId && <TableHead>Reference</TableHead>}
                  {status === "all" && <TableHead>Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.bin_number && <div className="text-xs text-muted-foreground">BIN: {r.bin_number}</div>}
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell>{r.address}</TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    {!typeId && <TableCell>{r.type_name}</TableCell>}
                    <TableCell className="text-xs">{r.vat_user_id ?? ""}</TableCell>
                    <TableCell className="text-xs">{r.vat_password ?? ""}</TableCell>
                    {!referenceId && <TableCell>{r.reference_name}</TableCell>}
                    {status === "all" && (
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    )}
                  </TableRow>
                ))}

              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[900px] max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0 bg-white text-black">
          <DialogHeader className="no-print px-6 py-3 border-b flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Print Preview · A4
            </DialogTitle>
            <Button size="sm" onClick={onPrintPreview} className="mr-8">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </DialogHeader>
          <div className="overflow-auto bg-white p-6 flex justify-center items-start">
            <div
              id="customer-report-print"
              className="bg-white text-black shadow-lg"
              style={{
                width: "210mm",
                minHeight: "297mm",
                padding: "15mm",
                fontSize: "12px",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >

              <div className="border-b-2 pb-3 mb-4" style={{ borderColor: "#1e293b" }}>
                <h1 className="text-2xl font-bold" style={{ color: "#1e293b" }}>{company?.company_name}</h1>
                <div className="text-xs mt-1 space-y-0.5">
                  <p>{company?.address}</p>
                  <p>Phone: {company?.phone} | Email: {company?.email}</p>
                  {company?.website && <p>Website: {company?.website}</p>}
                </div>
              </div>

              <h2 className="text-lg font-semibold mb-3">Customer Report</h2>

              <div className="border-y py-2 mb-3" style={{ borderColor: "#e5e7eb" }}>
                <div className="flex justify-between items-end">
                  <div className="flex gap-6 text-sm font-bold">
                    <span>Total: {s?.total ?? 0}</span>
                    <span style={{ color: "#15803d" }}>Active: {s?.active ?? 0}</span>
                    <span style={{ color: "#b45309" }}>Inactive: {s?.inactive ?? 0}</span>
                  </div>
                  <div className="text-[10px] italic" style={{ color: "#6b7280" }}>
                    Generated: {new Date().toLocaleString()}
                  </div>
                </div>
                {(areaId || referenceId || typeId || status !== "all") && (
                  <div className="mt-2 pt-2 border-t border-dashed flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ borderColor: "#e5e7eb" }}>
                    {areaId && <div><span className="font-bold">Area:</span> {selectedArea}</div>}
                    {referenceId && <div><span className="font-bold">Reference:</span> {selectedReference}</div>}
                    {typeId && <div><span className="font-bold">Type:</span> {selectedType}</div>}
                    {status !== "all" && <div><span className="font-bold">Status:</span> {status.charAt(0).toUpperCase() + status.slice(1)}</div>}
                  </div>
                )}
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ borderBottom: "2px solid #94a3b8" }}>
                    <th className="text-left py-2 px-2 font-bold w-8">#</th>
                    <th className="text-left py-2 px-2 font-bold">Name</th>
                    <th className="text-left py-2 px-2 font-bold">Address</th>
                    <th className="text-left py-2 px-2 font-bold">Mobile</th>
                    {!typeId && <th className="text-left py-2 px-2 font-bold">Type</th>}
                    <th className="text-left py-2 px-2 font-bold">VAT ID</th>
                    <th className="text-left py-2 px-2 font-bold">Password</th>
                    {!referenceId && <th className="text-left py-2 px-2 font-bold">Reference</th>}
                    {status === "all" && <th className="text-left py-2 px-2 font-bold">Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td className="py-1.5 px-2 tabular-nums" style={{ color: "#6b7280" }}>{i + 1}</td>
                      <td className="py-1.5 px-2">
                        <div className="font-medium">{r.name}</div>
                        {r.bin_number && <div className="text-[10px]" style={{ color: "#6b7280" }}>BIN: {r.bin_number}</div>}
                        {r.email && <div className="text-[10px]" style={{ color: "#6b7280" }}>{r.email}</div>}
                      </td>
                      <td className="py-1.5 px-2">{r.address}</td>
                      <td className="py-1.5 px-2">{r.mobile}</td>
                      {!typeId && <td className="py-1.5 px-2">{r.type_name}</td>}
                      <td className="py-1.5 px-2">{r.vat_user_id ?? ""}</td>
                      <td className="py-1.5 px-2">{r.vat_password ?? ""}</td>
                      {!referenceId && <td className="py-1.5 px-2">{r.reference_name}</td>}
                      {status === "all" && (
                        <td className="py-1.5 px-2">
                          <span className="border px-1.5 py-0.5 text-[10px] rounded" style={{ borderColor: "#cbd5e1" }}>
                            {r.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredRows.length === 0 && (
                <div className="text-center py-8" style={{ color: "#6b7280" }}>No customers found.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

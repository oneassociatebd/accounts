import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PaginationControls } from "@/components/pagination-controls";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { listVatSubmissions, deleteVatSubmission, resendVatSms } from "@/lib/vat.functions";
import { listReferences } from "@/lib/erp.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/month-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Send, Trash2, Plus, Search, Printer, Eye, FilePlus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeleton-loader";

const PAGE_SIZE = 25;

const vatFinalizedSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
});

export const Route = createFileRoute("/_authenticated/vat/finalized")({
  head: () => ({ meta: [{ title: "Finalized VAT Submissions" }] }),
  validateSearch: vatFinalizedSearchSchema,
  component: VatFinalizedPage,
});

function VatFinalizedPage() {
  const fetchAll = useServerFn(listVatSubmissions);
  const fetchReferences = useServerFn(listReferences);
  const remove = useServerFn(deleteVatSubmission);
  const resend = useServerFn(resendVatSms);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { page } = Route.useSearch();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [referenceId, setReferenceId] = useState("all");
  const [billStatus, setBillStatus] = useState<"ALL" | "WITH" | "WITHOUT">("ALL");

  const filters = useMemo(
    () => ({
      status: "FINALIZED" as const,
      search,
      month,
      reference_id: referenceId === "all" ? "" : referenceId,
      bill_status: billStatus,
    }),
    [search, month, referenceId, billStatus],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["vat-submissions", filters],
    queryFn: () => fetchAll({ data: filters }),
    placeholderData: (prev) => prev,
  });
  const { data: references = [] } = useQuery({
    queryKey: ["references"],
    queryFn: () => fetchReferences(),
  });

  const allRows = (data ?? []) as any[];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page ?? 1), totalPages);
  const rows = allRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if ((page ?? 1) !== 1) {
      navigate({ to: "/vat/finalized", search: { page: 1 }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, month, referenceId, billStatus]);

  const goToPage = (p: number) => {
    navigate({ to: "/vat/finalized", search: (prev: any) => ({ ...prev, page: p }), resetScroll: false });
  };
  const fromPage = currentPage;

  const handleResend = async (id: string) => {
    try {
      const r: any = await resend({ data: { id } });
      if (r.status === "SENT") toast.success("SMS resent successfully");
      else toast.error(`SMS failed: ${r.response}`);
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
      qc.invalidateQueries({ queryKey: ["vat-sms-logs"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleDelete = async (id: string, sid: string) => {
    if (!confirm(`Delete finalized submission ${sid}? This cannot be undone.`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Submission deleted");
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handlePrint = (row: any) => {
    const esc = (v: unknown) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const html = `<!doctype html><html><head><title>VAT Submission ${esc(row.submission_id)}</title>
      <style>body{font-family:system-ui;padding:40px;max-width:600px;margin:auto}h1{font-size:20px;border-bottom:2px solid #000;padding-bottom:8px}
      .row{display:flex;padding:8px 0;border-bottom:1px solid #eee}.label{font-weight:600;width:180px}.value{flex:1}</style>
      </head><body>
      <h1>VAT Return Submission Receipt</h1>
      <div class="row"><div class="label">Client</div><div class="value">${esc(row.customer?.company_name || row.customer?.name || "")}</div></div>
      <div class="row"><div class="label">BIN</div><div class="value">${esc(row.customer?.bin_number || "")}</div></div>
      <div class="row"><div class="label">Mobile</div><div class="value">${esc(row.customer?.mobile || "")}</div></div>
      <div class="row"><div class="label">Tax Period</div><div class="value">${esc(row.tax_period)}</div></div>
      <div class="row"><div class="label">Submission ID</div><div class="value">${esc(row.submission_id)}</div></div>
      <div class="row"><div class="label">Submission Date</div><div class="value">${esc(row.submission_date || "")}</div></div>
      <div class="row"><div class="label">Status</div><div class="value">${esc(row.status)}</div></div>
      <div class="row"><div class="label">Finalized By</div><div class="value">${esc(row.finalized_by_name || "")}</div></div>
      ${row.remarks ? `<div class="row"><div class="label">Remarks</div><div class="value">${esc(row.remarks)}</div></div>` : ""}
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Finalized Submissions</h1>
          <p className="text-sm text-muted-foreground">Completed VAT return submissions</p>
        </div>
        <Button onClick={() => navigate({ to: "/vat/new" })}><Plus className="h-4 w-4 mr-1" /> New Submission</Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search client / BIN / mobile / submission ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <MonthPicker value={month} onChange={setMonth} placeholder="All months" className="h-9" />
            <Select value={referenceId} onValueChange={setReferenceId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All references" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All references</SelectItem>
                {(references as Array<{ id: string; reference_name: string }>).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.reference_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select value={billStatus} onValueChange={(v) => setBillStatus(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All bills</SelectItem>
                  <SelectItem value="WITH">Bill created</SelectItem>
                  <SelectItem value="WITHOUT">No bill</SelectItem>
                </SelectContent>
              </Select>
              {(search || month || referenceId !== "all" || billStatus !== "ALL") && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setSearch(""); setMonth(""); setReferenceId("all"); setBillStatus("ALL"); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Finalized {allRows.length > 0 && <span className="text-sm font-normal text-muted-foreground">({allRows.length})</span>}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={9} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No finalized submissions.</div> : (
            <div className="w-full overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[1100px] caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>BIN</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Tax Period</TableHead>
                    <TableHead>Submission ID</TableHead>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead>Created By</TableHead>
                    
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={!r.has_bill ? "bg-amber-50 dark:bg-amber-950/30" : undefined}
                    >
                      <TableCell className="font-medium">{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.customer?.bin_number || "-"}</TableCell>
                      <TableCell>{r.customer?.mobile || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{r.tax_period}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                      <TableCell className="text-xs">{r.submission_date}</TableCell>
                      <TableCell>
                        {r.has_bill ? (
                          <Badge variant="default">Bill Created</Badge>
                        ) : r.tax_period_date ? (
                          <Link
                            to="/bills/new"
                            search={{
                              customerId: r.customer_id,
                              month: String(r.tax_period_date).slice(0, 7),
                              from: "/vat/finalized",
                              fromPage,
                            }}
                            resetScroll={false}
                          >
                            <Badge variant="destructive" className="cursor-pointer hover:opacity-80">
                              <FilePlus className="h-3 w-3 mr-1" />No Bill
                            </Badge>
                          </Link>
                        ) : (
                          <Badge variant="destructive">No Bill</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.created_by_name || "-"}</TableCell>
                      
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/vat/new" search={{ id: r.id }}><Eye className="h-4 w-4 mr-2" />View</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/vat/new" search={{ id: r.id }}><Edit className="h-4 w-4 mr-2" />Edit</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResend(r.id)}>
                              <Send className="h-4 w-4 mr-2" />Resend SMS
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint(r)}>
                              <Printer className="h-4 w-4 mr-2" />Print
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDelete(r.id, r.submission_id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
          {!isLoading && allRows.length > 0 && (
            <PaginationControls page={currentPage} totalPages={totalPages} onPageChange={goToPage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

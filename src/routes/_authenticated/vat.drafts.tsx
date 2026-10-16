import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listVatSubmissions, deleteVatSubmission, finalizeVatSubmission } from "@/lib/vat.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, CheckCircle2, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/vat/drafts")({
  head: () => ({ meta: [{ title: "Draft VAT Submissions" }] }),
  component: VatDraftsPage,
});

function VatDraftsPage() {
  const fetchAll = useServerFn(listVatSubmissions);
  const remove = useServerFn(deleteVatSubmission);
  const finalize = useServerFn(finalizeVatSubmission);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filters = useMemo(() => ({ status: "DRAFT" as const, search: debouncedSearch }), [debouncedSearch]);
  const { data, isLoading } = useQuery({
    queryKey: ["vat-submissions", filters],
    queryFn: () => fetchAll({ data: filters }),
  });

  const rows = (data ?? []) as any[];

  const handleDelete = async (id: string, sid: string) => {
    if (!confirm(`Delete draft ${sid}?`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Draft deleted");
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
      qc.invalidateQueries({ queryKey: ["vat-dashboard"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleFinalize = async (row: any) => {
    if (!confirm("Finalize this submission? SMS will be sent.")) return;
    try {
      const result: any = await finalize({ data: {
        id: row.id,
        customer_id: row.customer_id,
        tax_period: row.tax_period,
        submission_id: row.submission_id,
        remarks: row.remarks,
      }});
      toast.success("Submission finalized");
      if (result?.sms_status === "FAILED") toast.warning(`SMS failed: ${result.sms_response}`);
      qc.invalidateQueries({ queryKey: ["vat-submissions"] });
      qc.invalidateQueries({ queryKey: ["vat-dashboard"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Draft Submissions</h1>
          <p className="text-sm text-muted-foreground">VAT returns saved as draft, pending finalization</p>
        </div>
        <Button onClick={() => navigate({ to: "/vat/new" })}>
          <Plus className="h-4 w-4 mr-1" /> New Submission
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Search</CardTitle></CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by client, BIN, mobile, submission ID..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Drafts {rows.length > 0 && <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={8} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No drafts found.</div> : (
            <div className="w-full overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[900px] caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>BIN</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Tax Period</TableHead>
                    <TableHead>Submission ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.customer?.bin_number || "-"}</TableCell>
                      <TableCell>{r.customer?.mobile || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{r.tax_period}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{r.created_by_name || "-"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/vat/new" search={{ id: r.id }}><Edit className="h-4 w-4 mr-2" />Edit</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleFinalize(r)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />Finalize
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(r.id, r.submission_id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
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

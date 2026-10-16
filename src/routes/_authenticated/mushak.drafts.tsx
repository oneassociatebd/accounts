import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listMushakSubmissions, deleteMushakSubmission, finalizeMushakSubmission,
} from "@/lib/mushak.functions";
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

export const Route = createFileRoute("/_authenticated/mushak/drafts")({
  head: () => ({ meta: [{ title: "Draft Mushak 4.3 Submissions" }] }),
  component: MushakDraftsPage,
});

function MushakDraftsPage() {
  const fetchAll = useServerFn(listMushakSubmissions);
  const remove = useServerFn(deleteMushakSubmission);
  const finalize = useServerFn(finalizeMushakSubmission);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setDbSearch(search), 300); return () => clearTimeout(t); }, [search]);
  const filters = useMemo(() => ({ status: "DRAFT" as const, search: dbSearch }), [dbSearch]);
  const { data, isLoading } = useQuery({
    queryKey: ["mushak-submissions", filters],
    queryFn: () => fetchAll({ data: filters }),
  });
  const rows = (data ?? []) as any[];

  const handleDelete = async (id: string, sid: string) => {
    if (!confirm(`Delete draft ${sid}?`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["mushak-submissions"] });
      qc.invalidateQueries({ queryKey: ["mushak-dashboard"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const handleFinalize = async (r: any) => {
    if (!confirm("Finalize this submission?")) return;
    try {
      const res: any = await finalize({ data: {
        id: r.id, submission_id: r.submission_id,
        customer_id: r.customer_id, reference_id: r.reference_id ?? null,
        tax_period: r.tax_period, submission_date: r.submission_date,
        item_name: r.item_name, boe_no: r.boe_no, boe_date: r.boe_date, remarks: r.remarks ?? null,
      }});
      toast.success("Finalized");
      if (res?.sms?.status === "SENT") toast.success("SMS sent to client");
      else if (res?.sms) toast.error(`SMS failed: ${res.sms.response}`);
      qc.invalidateQueries({ queryKey: ["mushak-submissions"] });
      qc.invalidateQueries({ queryKey: ["mushak-dashboard"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Draft Submissions</h1>
          <p className="text-sm text-muted-foreground">Mushak 4.3 submissions saved as draft</p>
        </div>
        <Button onClick={() => navigate({ to: "/mushak/new" })}>
          <Plus className="h-4 w-4 mr-1" /> New Submission
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Search</CardTitle></CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by client, BIN, BOE, item, submission ID..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Drafts {rows.length > 0 && <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={10} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No drafts found.</div> : (
            <div className="w-full overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[1100px] caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Submission ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Tax Period</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>BOE No</TableHead>
                    <TableHead>BOE Date</TableHead>
                    <TableHead>Sub. Date</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{r.submission_id}</TableCell>
                      <TableCell className="font-medium">{r.customer?.company_name || r.customer?.name || "-"}</TableCell>
                      <TableCell className="text-xs">{r.reference?.reference_name || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{r.tax_period}</Badge></TableCell>
                      <TableCell>{r.item_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.boe_no}</TableCell>
                      <TableCell className="text-xs">{r.boe_date}</TableCell>
                      <TableCell className="text-xs">{r.submission_date}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/mushak/new" search={{ id: r.id }}><Edit className="h-4 w-4 mr-2" />Edit</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleFinalize(r)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />Finalise
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
        </CardContent>
      </Card>
    </div>
  );
}

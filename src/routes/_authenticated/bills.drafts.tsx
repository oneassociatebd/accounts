import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PaginationControls } from "@/components/pagination-controls";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listBills, finalizeBill, cancelBill, deleteBill } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, CheckCircle2, XCircle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/bills/drafts")({
  head: () => ({
    meta: [{ title: "One | Draft Bills" }],
  }),
  component: DraftBills,
});

const PAGE_SIZE = 20;
const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);

function DraftBills() {
  const fetchAll = useServerFn(listBills);
  const finalize = useServerFn(finalizeBill);
  const cancel = useServerFn(cancelBill);
  const remove = useServerFn(deleteBill);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: "DRAFT" as const,
      include_drafts: true,
      page,
      page_size: PAGE_SIZE,
    }),
    [search, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["bills", filters],
    queryFn: () => fetchAll({ data: filters }),
  });

  const rows = (data?.rows ?? []) as Array<{
    id: string;
    bill_no: string;
    bill_date: string | null;
    billing_month: string | null;
    subtotal: number | string | null;
    grand_total: number | string | null;
    status: string;
    customer?: { company_name?: string | null; name?: string | null; bin_number?: string | null } | null;
  }>;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFinalize = async (id: string) => {
    try {
      await finalize({ data: { id } });
      toast.success("Bill finalized");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };
  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this draft?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Draft cancelled");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };
  const handleDelete = async (id: string, billNo: string) => {
    if (!confirm(`Delete draft ${billNo}?`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Draft deleted");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Draft Bills</h1>
          <p className="text-sm text-muted-foreground">Saved drafts pending finalization</p>
        </div>
        <Button onClick={() => navigate({ to: "/bills/new" })}>
          <Plus className="h-4 w-4 mr-1" /> New Bill
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Search</CardTitle></CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Invoice No..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Drafts{total > 0 && <span className="text-sm font-normal text-muted-foreground"> ({total})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No drafts found.</div>
          ) : (
            <>
              <div className="w-full max-w-full overflow-auto max-h-[70vh] relative">
                <table className="w-full min-w-[900px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>BIN</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12 text-center">More</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono">
                          <Link to="/bills/$id" params={{ id: b.id }} className="hover:underline">
                            {b.bill_no}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{b.bill_date}</TableCell>
                        <TableCell className="whitespace-nowrap">{String(b.billing_month).slice(0, 7)}</TableCell>
                        <TableCell>{b.customer?.company_name || b.customer?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{b.customer?.bin_number || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(b.subtotal)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(b.grand_total)}</TableCell>
                        <TableCell><Badge variant="secondary">{b.status}</Badge></TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/bills/$id" params={{ id: b.id }}>
                                  <Eye className="h-4 w-4 mr-2" /> View / Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleFinalize(b.id)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Finalize
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCancel(b.id)} className="text-destructive">
                                <XCircle className="h-4 w-4 mr-2" /> Cancel
                              </DropdownMenuItem>
                              {isAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDelete(b.id, b.bill_no)} className="text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
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
              <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

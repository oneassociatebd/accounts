import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PaginationControls } from "@/components/pagination-controls";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listBills, finalizeBill, cancelBill, deleteBill } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth-context";
import { listAreas, listReferences } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/_authenticated/bills/")({
  head: () => ({
    meta: [{ title: "One | Bills" }],
  }),
  component: BillList,
});

const PAGE_SIZE = 20;

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toFixed(2);
}

type BillRow = {
  id: string;
  bill_no: string;
  bill_date: string | null;
  billing_month: string | null;
  previous_balance: number | string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  grand_total: number | string | null;
  status: "DRAFT" | "FINALIZED" | "CANCELLED";
  customer?: {
    company_name?: string | null;
    name?: string | null;
    bin_number?: string | null;
  } | null;
};

type OptionRow = { id: string; reference_name?: string; area_name?: string };

function BillList() {
  const fetchAll = useServerFn(listBills);
  const fetchAreas = useServerFn(listAreas);
  const fetchRefs = useServerFn(listReferences);
  
  const finalize = useServerFn(finalizeBill);
  const cancel = useServerFn(cancelBill);
  const remove = useServerFn(deleteBill);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "FINALIZED" | "CANCELLED">("all");
  const [billingMonth, setBillingMonth] = useState("");
  const [referenceId, setReferenceId] = useState("all");
  const [areaId, setAreaId] = useState("all");
  const [page, setPage] = useState(1);
  

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      billing_month: billingMonth ? `${billingMonth}-01` : undefined,
      reference_id: referenceId === "all" ? null : referenceId,
      area_id: areaId === "all" ? null : areaId,
      page,
      page_size: PAGE_SIZE,
    }),
    [search, status, billingMonth, referenceId, areaId, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["bills", filters],
    queryFn: () => fetchAll({ data: filters }),
    placeholderData: keepPreviousData,
  });
  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => fetchAreas(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: references = [] } = useQuery({
    queryKey: ["references"],
    queryFn: () => fetchRefs(),
    staleTime: 5 * 60 * 1000,
  });

  const rows = (data?.rows ?? []) as BillRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFinalize = async (id: string) => {
    try {
      await finalize({ data: { id } });
      toast.success("Bill finalized");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this bill?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Bill cancelled");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const handleDelete = async (id: string, billNo: string) => {
    if (!confirm(`Delete bill ${billNo}? This cannot be undone. The invoice number will not be reused.`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Bill deleted");
      qc.invalidateQueries({ queryKey: ["bills"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bills</h1>
          <p className="text-sm text-muted-foreground">All customer bills</p>
        </div>
        <Button onClick={() => navigate({ to: "/bills/new" })}>
          <Plus className="h-4 w-4 mr-1" /> New Bill
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Invoice No, Customer Name or Mobile..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Input
              type="month"
              value={billingMonth}
              onChange={(e) => {
                setBillingMonth(e.target.value);
                setPage(1);
              }}
              className="h-8 text-sm"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as typeof status);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="FINALIZED">Finalized</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={referenceId}
              onValueChange={(v) => {
                setReferenceId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Reference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All references</SelectItem>
                {(references as OptionRow[]).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.reference_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={areaId}
              onValueChange={(v) => {
                setAreaId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {(areas as OptionRow[]).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.area_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Bill List{" "}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({total})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} cols={10} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No bills found.</div>
          ) : (
            <>
              <div className="w-full max-w-full overflow-auto max-h-[70vh] relative">
                <table className="w-full min-w-[1100px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="whitespace-nowrap min-w-56">Invoice No</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Month</TableHead>
                      <TableHead className="whitespace-nowrap">Customer</TableHead>
                      <TableHead className="whitespace-nowrap">BIN</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Prev Bal</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Current</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Discount</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Grand Total</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="w-12 text-center">More</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono">
                          <Link to="/bills/$id" params={{ id: b.id }} className="hover:underline whitespace-nowrap">
                            {b.bill_no}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{b.bill_date}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {String(b.billing_month).slice(0, 7)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {b.customer?.company_name || b.customer?.name || "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {b.customer?.bin_number || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(b.previous_balance)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(b.subtotal)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(b.discount_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {fmt(b.grand_total)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              b.status === "FINALIZED"
                                ? "default"
                                : b.status === "CANCELLED"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions menu">
                                <MoreHorizontal className="h-4 w-4" />

                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/bills/$id/print" params={{ id: b.id }}>
                                  <Eye className="h-4 w-4 mr-2" /> Print Preview
                                </Link>
                              </DropdownMenuItem>
                              {b.status === "DRAFT" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleFinalize(b.id)}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Finalize
                                  </DropdownMenuItem>
                                </>
                              )}
                              {b.status !== "CANCELLED" && (
                                <DropdownMenuItem
                                  onClick={() => handleCancel(b.id)}
                                  className="text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" /> Cancel
                                </DropdownMenuItem>
                              )}
                              {isAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(b.id, b.bill_no)}
                                    className="text-destructive"
                                  >
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PaginationControls } from "@/components/pagination-controls";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listCollections,
  cancelCollection,
  deleteCollection,
  getReceiptData,
} from "@/lib/collection.functions";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, XCircle, Plus, Search, Trash2, Eye, Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/collections/")({
  head: () => ({
    meta: [{ title: "One | Collections" }],
  }),
  component: CollectionList,
});

const PAGE_SIZE = 20;
const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket",
  BANK: "Bank", CHEQUE: "Cheque", OTHER: "Other",
};

function CollectionList() {
  const fetchAll = useServerFn(listCollections);
  const cancel = useServerFn(cancelCollection);
  const remove = useServerFn(deleteCollection);
  const get = useServerFn(getReceiptData);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "CANCELLED">("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      payment_method: paymentMethod,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [search, status, paymentMethod, fromDate, toDate, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["collections", filters],
    queryFn: () => fetchAll({ data: filters }),
    placeholderData: keepPreviousData,
  });

  const rows = (data?.rows ?? []) as any[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleErr = (e: any) => {
    const msg =
      typeof e?.message === "string" && e.message
        ? e.message
        : typeof e?.data?.message === "string" && e.data.message
          ? e.data.message
          : String(e ?? "Failed");
    toast.error(msg);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this collection?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Collection cancelled");
      qc.invalidateQueries({ queryKey: ["collections"] });
    } catch (e) { handleErr(e); }
  };
  const handleDelete = async (id: string, no: string) => {
    if (!confirm(`Delete collection ${no}? This cannot be undone.`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Collection deleted");
      qc.invalidateQueries({ queryKey: ["collections"] });
    } catch (e) { handleErr(e); }
  };

  const handleMemoPdf = async (id: string, mode: "download" | "print" | "view") => {
    try {
      const [data, { buildMemoPdf }] = await Promise.all([
        get({ data: { id } }),
        import("@/lib/memo-pdf"),
      ]);
      await buildMemoPdf({
        collection: data.collection as any,
        company: (data as any).company,
        previous_balance: Number((data as any).previous_due ?? 0),
      }, mode);
      if (mode === "download") toast.success("Memo downloaded");
    } catch (e) { handleErr(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="text-sm text-muted-foreground">All customer payment receipts</p>
        </div>
        <Button onClick={() => navigate({ to: "/collections/new" })}>
          <Plus className="h-4 w-4 mr-1" /> New Collection
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Receipt No, Customer or Mobile..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-8 text-sm" />
            </div>
            <Input type="date" value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="h-8 text-sm" />
            <Input type="date" value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="h-8 text-sm" />
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Collection List{" "}
            {total > 0 && <span className="text-sm font-normal text-muted-foreground">({total})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No collections found.</div>
          ) : (
            <>
              <div className="w-full max-w-full overflow-auto max-h-[70vh] relative">
                <table className="w-full min-w-[900px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-background [&_th]:bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Receipt No</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Customer</TableHead>
                      <TableHead className="whitespace-nowrap">BIN</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                      <TableHead className="whitespace-nowrap">Method</TableHead>
                      <TableHead className="whitespace-nowrap">Reference</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="w-12 text-center">More</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => navigate({ to: "/collections/$id", params: { id: c.id } })}
                          >
                            {c.receipt_no}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{c.collection_date}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {c.customer?.company_name || c.customer?.name || "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {c.customer?.bin_number || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {fmt(c.amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {PAYMENT_LABELS[c.payment_method] ?? c.payment_method}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {c.reference_no || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "ACTIVE" ? "default" : "destructive"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() =>
                                navigate({ to: "/collections/$id", params: { id: c.id } })
                              }>
                                <Eye className="h-4 w-4 mr-2" /> View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMemoPdf(c.id, "view")}>
                                <Eye className="h-4 w-4 mr-2" /> View Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMemoPdf(c.id, "print")}>
                                <Printer className="h-4 w-4 mr-2" /> Print Memo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMemoPdf(c.id, "download")}>
                                <Download className="h-4 w-4 mr-2" /> Download PDF
                              </DropdownMenuItem>
                              {isAdmin && c.status === "ACTIVE" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() =>
                                    navigate({ to: "/collections/new", search: { editId: c.id } })
                                  }>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleCancel(c.id)}
                                    className="text-destructive">
                                    <XCircle className="h-4 w-4 mr-2" /> Cancel
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(c.id, c.receipt_no)}
                                    className="text-destructive">
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

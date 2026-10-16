import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  getCustomerLedger,
  searchLedgerCustomers,
} from "@/lib/ledger.functions";
import {
  ReportFilters,
  ReportTitle,
  downloadCsv,
  printReport,
  fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

const searchSchema = z.object({
  customer_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ledger/customer")({
  head: () => ({ meta: [{ title: "One | Customer Ledger" }] }),
  validateSearch: searchSchema,
  component: CustomerLedgerPage,
});

function CustomerLedgerPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const searchFn = useServerFn(searchLedgerCustomers);
  const fetchLedger = useServerFn(getCustomerLedger);

  const [customerId, setCustomerId] = useState<string>(search.customer_id ?? "");
  const [from, setFrom] = useState<string>(search.from ?? "");
  const [to, setTo] = useState<string>(search.to ?? "");

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navigate({
      search: {
        customer_id: customerId || undefined,
        from: from || undefined,
        to: to || undefined,
      },
      replace: true,
    });
  }, [customerId, from, to, navigate]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["ledger-cust-search", q],
    queryFn: () =>
      q.trim().length >= 2
        ? searchFn({ data: { q: q.trim() } })
        : Promise.resolve([] as any[]),
    enabled: q.trim().length >= 2 && open,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["customer-ledger", customerId, from, to],
    queryFn: () =>
      fetchLedger({
        data: {
          customer_id: customerId,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: !!customerId,
  });

  const rows = data?.rows ?? [];

  const balLabel = (n: number) => {
    if (n === 0) return "0.00";
    return n > 0 ? `${fmt(n)} CR` : `${fmt(-n)} DR`;
  };

  const closingTone = (n: number) =>
    n > 0 ? "text-green-600" : n < 0 ? "text-destructive" : "";

  const onCsv = () => {
    if (!data) return;
    downloadCsv(
      `customer-ledger-${data.customer.name}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Ref No", "Description", "Debit", "Credit", "Balance"],
      [
        ["", "Opening Balance", "", "", "", "", balLabel(data.opening_balance)],
        ...rows.map((r) => [
          r.date,
          r.type,
          r.ref_no,
          r.description,
          r.debit ? fmt(r.debit) : "",
          r.credit ? fmt(r.credit) : "",
          balLabel(r.balance),
        ]),
        ["", "Total", "", "", fmt(data.totals.debit), fmt(data.totals.credit), ""],
        ["", "Closing Balance", "", "", "", "", balLabel(data.closing_balance)],
      ],
    );
  };

  const selectedSummary = useMemo(() => {
    if (!data) return null;
    return data.customer;
  }, [data]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ReportTitle title="Customer Ledger" />

      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1 relative" ref={wrapRef}>
              <Label className="text-xs">Customer</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={
                    selectedSummary
                      ? selectedSummary.name
                      : "Search by name, mobile, BIN..."
                  }
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                />
              </div>
              {open && searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md">
                  {searchResults.map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                      onClick={() => {
                        setCustomerId(c.id);
                        setQ("");
                        setOpen(false);
                      }}
                    >
                      <div className="font-medium">
                        {c.company_name || c.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.mobile} • {c.bin_number || "—"} •{" "}
                        {c.area?.area_name ?? ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!customerId ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Select a customer to view their ledger.
          </CardContent>
        </Card>
      ) : isLoading || !data ? (
        <Card>
          <CardContent className="p-4">
            <TableSkeleton />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  {data.customer.name}{" "}
                  <Badge variant={data.customer.is_active ? "default" : "secondary"}>
                    {data.customer.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.customer.mobile}
                  {data.customer.bin_number && ` • BIN: ${data.customer.bin_number}`}
                  {data.customer.area_name && ` • ${data.customer.area_name}`}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Opening</div>
                  <div className="text-base font-semibold tabular-nums">
                    {balLabel(data.opening_balance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Debit</div>
                  <div className="text-base font-semibold tabular-nums">
                    {fmt(data.totals.debit)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Credit</div>
                  <div className="text-base font-semibold tabular-nums">
                    {fmt(data.totals.credit)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Closing</div>
                  <div
                    className={`text-base font-semibold tabular-nums ${closingTone(data.closing_balance)}`}
                  >
                    {balLabel(data.closing_balance)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ReportFilters
            showDate={false}
            onPrint={printReport}
            onCsv={onCsv}
          />

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-36">Ref No</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="font-medium">Opening Balance</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {balLabel(data.opening_balance)}
                    </TableCell>
                  </TableRow>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        No transactions in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => (
                      <TableRow key={`${r.type}-${r.ref_no}-${i}`}>
                        <TableCell className="tabular-nums">{r.date}</TableCell>
                        <TableCell>{r.ref_no}</TableCell>
                        <TableCell>{r.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.debit ? fmt(r.debit) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.credit ? fmt(r.credit) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {balLabel(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(data.totals.debit)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(data.totals.credit)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="font-semibold">Closing Balance</TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${closingTone(data.closing_balance)}`}
                    >
                      {balLabel(data.closing_balance)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

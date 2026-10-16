import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { getCompanyLedger, getCompanyNetPosition, type CompanyLedgerEntry } from "@/lib/balance-sheet.functions";
import {
  ReportFilters,
  ReportTitle,
  SummaryCards,
  downloadCsv,
  printReport,
  fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/finance/company-ledger")({
  head: () => ({ meta: [{ title: "Company Ledger | One" }] }),
  validateSearch: searchSchema,
  component: CompanyLedgerPage,
});

const TYPE_LABEL: Record<CompanyLedgerEntry["type"], { label: string; tone: "income" | "expense" | "loan-in" | "loan-out" }> = {
  BILL_COLLECTION: { label: "Bill Collection", tone: "income" },
  OTHERS_INCOME: { label: "Others Income", tone: "income" },
  EXPENSE: { label: "Expense", tone: "expense" },
  LOAN_COLLECTION: { label: "Loan Receipt", tone: "loan-in" },
  LOAN_REPAYMENT: { label: "Loan Repayment", tone: "loan-out" },
  LOAN_INTEREST: { label: "Loan Interest", tone: "loan-out" },
  LOAN_GIVEN: { label: "Loan Given", tone: "loan-out" },
  LOAN_TAKEN: { label: "Loan Taken", tone: "loan-in" },
};

function TypeBadge({ type }: { type: CompanyLedgerEntry["type"] }) {
  const { label, tone } = TYPE_LABEL[type];
  const cls =
    tone === "income"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : tone === "expense"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      : tone === "loan-in"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return <Badge variant="secondary" className={`${cls} border-0 text-[10px] font-medium`}>{label}</Badge>;
}

function CompanyLedgerPage() {
  const { role } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchLedger = useServerFn(getCompanyLedger);
  const fetchNetPosition = useServerFn(getCompanyNetPosition);

  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(search.from ?? "");
  const [to, setTo] = useState<string>(search.to ?? today);

  const { data, isLoading } = useQuery({
    queryKey: ["company-ledger", from, to],
    queryFn: () => fetchLedger({ data: { from: from || undefined, to: to || undefined } }),
    enabled: role === "admin",
  });

  const { data: net } = useQuery({
    queryKey: ["company-net-position"],
    queryFn: () => fetchNetPosition(),
    enabled: role === "admin",
    staleTime: 30_000,
  });

  // Default From Date to the first transaction date once loaded
  useEffect(() => {
    if (!from && data?.entries && data.entries.length > 0) {
      setFrom(data.entries[0].date);
    }
  }, [from, data]);

  const entries = data?.entries ?? [];
  const opening = data?.opening ?? 0;
  const totals = data?.totals ?? { debit: 0, credit: 0 };
  const closing = data?.closing ?? 0;

  const rowsWithBalance = useMemo(() => {
    let bal = opening;
    return entries.map((e) => {
      bal = bal + e.credit - e.debit;
      return { ...e, balance: bal };
    });
  }, [entries, opening]);

  const applyFilters = () => {
    navigate({ search: { from: from || undefined, to: to || undefined }, replace: true });
  };

  const handleCsv = () => {
    downloadCsv(
      `company-ledger_${from || "all"}_${to || "all"}.csv`,
      ["Date", "Type", "Reference", "Description", "Payment", "Account", "Debit", "Credit", "Balance"],
      [
        ["", "", "", "Opening Balance", "", "", "", "", fmt(opening)],
        ...rowsWithBalance.map((r) => [
          r.date,
          TYPE_LABEL[r.type].label,
          r.reference,
          r.description,
          r.payment_method,
          r.bank_account,
          r.debit ? fmt(r.debit) : "",
          r.credit ? fmt(r.credit) : "",
          fmt(r.balance),
        ]),
        ["", "", "", "Totals", "", "", fmt(totals.debit), fmt(totals.credit), fmt(closing)],
      ],
    );
  };

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-2 p-4 text-center">
        <h2 className="text-lg font-semibold">Admin only</h2>
        <p className="text-sm text-muted-foreground">You don't have access to the Company Ledger.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <ReportTitle
          title="Company Ledger"
          subtitle="All bill collections, other incomes, expenses, and loan transactions in one running ledger."
        />
      </div>

      <ReportFilters
        from={from}
        to={to}
        onFromChange={(v) => { setFrom(v); }}
        onToChange={(v) => { setTo(v); }}
        onPrint={() => { applyFilters(); setTimeout(printReport, 100); }}
        onCsv={() => { applyFilters(); handleCsv(); }}
        printLabel="Print Report"
      />

      <div className="print:hidden">
        <SummaryCards
          items={[
            { label: "Opening Balance", value: fmt(opening), tone: opening < 0 ? "danger" : "default" },
            { label: "Total Credit (In)", value: fmt(totals.credit), tone: "success" },
            { label: "Total Debit (Out)", value: fmt(totals.debit), tone: "danger" },
            { label: "Closing Balance", value: fmt(closing), tone: closing < 0 ? "danger" : "success" },
          ]}
        />
      </div>

      {net && (
        <div className="space-y-2 print:hidden">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">Overall Net Position (as of today)</h3>
          <SummaryCards
            items={[
              { label: "Cash in Hand", value: fmt(net.cashInHand), tone: net.cashInHand < 0 ? "danger" : "success" },
              { label: "Customers Due", value: fmt(net.customersDue), tone: "default" },
              { label: "Loans Receivable", value: fmt(net.loansReceivable), tone: "default" },
              { label: "Loans Payable", value: fmt(net.loansPayable), tone: net.loansPayable > 0 ? "danger" : "default" },
              {
                label: "Net Cash After Loans",
                value: fmt(net.cashInHand - net.loansPayable),
                tone: net.cashInHand - net.loansPayable < 0 ? "danger" : "success",
              },
              { label: "Net Worth", value: fmt(net.netWorth), tone: net.netWorth < 0 ? "danger" : "success" },
              {
                label: "Net Worth (if Loans Given unrecovered)",
                value: fmt(net.netWorth - net.loansReceivable),
                tone: net.netWorth - net.loansReceivable < 0 ? "danger" : "success",
              },
            ]}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* Print-only header (mirrors customer ledger print layout) */}
          <div className="hidden print:block px-4 pt-4 pb-2 border-b">
            <h1 className="text-xl font-bold text-center">Company Ledger</h1>
            <p className="text-center text-xs">
              Period: {from || "—"} to {to || "—"}
            </p>
            <div className="grid grid-cols-4 gap-2 text-xs mt-2">
              <div><span className="text-muted-foreground">Opening:</span> <span className="font-semibold tabular-nums">{fmt(opening)}</span></div>
              <div><span className="text-muted-foreground">Total Credit:</span> <span className="font-semibold tabular-nums">{fmt(totals.credit)}</span></div>
              <div><span className="text-muted-foreground">Total Debit:</span> <span className="font-semibold tabular-nums">{fmt(totals.debit)}</span></div>
              <div><span className="text-muted-foreground">Closing:</span> <span className="font-semibold tabular-nums">{fmt(closing)}</span></div>
            </div>
          </div>


          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[130px]">Type</TableHead>
                  <TableHead className="w-[110px]">Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[90px]">Payment</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right w-[110px]">Debit</TableHead>
                  <TableHead className="text-right w-[110px]">Credit</TableHead>
                  <TableHead className="text-right w-[130px]">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell colSpan={6}>Opening Balance</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(opening)}</TableCell>
                </TableRow>
                {rowsWithBalance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No transactions in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rowsWithBalance.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                      <TableCell><TypeBadge type={r.type} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className="text-xs">{r.payment_method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.bank_account || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {r.debit ? fmt(r.debit) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {r.credit ? fmt(r.credit) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmt(r.balance)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={6}>Totals</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.credit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(closing)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

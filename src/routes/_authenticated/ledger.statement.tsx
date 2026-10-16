import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  getCustomerLedger,
  getReferenceStatement,
  getStatementCompany,
  searchLedgerCustomers,
  searchReferences,
} from "@/lib/ledger.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Search, FileText } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["customer", "reference"]).optional(),
  customer_id: z.string().uuid().optional(),
  reference_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/ledger/statement")({
  head: () => ({ meta: [{ title: "One | Customer Statement" }] }),
  validateSearch: searchSchema,
  component: StatementPage,
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const balLabel = (n: number) => {
  if (!n) return "0.00";
  return n > 0 ? `${fmt(n)} CR` : `${fmt(-n)} DR`;
};

const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function StatementPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const searchFn = useServerFn(searchLedgerCustomers);
  const searchRefFn = useServerFn(searchReferences);
  const fetchLedger = useServerFn(getCustomerLedger);
  const fetchRefStmt = useServerFn(getReferenceStatement);
  const fetchCompany = useServerFn(getStatementCompany);

  const [mode, setMode] = useState<"customer" | "reference">(search.mode ?? "customer");
  const [customerId, setCustomerId] = useState(search.customer_id ?? "");
  const [referenceId, setReferenceId] = useState(search.reference_id ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navigate({
      search: {
        mode,
        customer_id: mode === "customer" ? customerId || undefined : undefined,
        reference_id: mode === "reference" ? referenceId || undefined : undefined,
        from: from || undefined,
        to: to || undefined,
      },
      replace: true,
    });
  }, [mode, customerId, referenceId, from, to, navigate]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const { data: custResults = [] } = useQuery({
    queryKey: ["statement-cust-search", q],
    queryFn: () =>
      q.trim().length >= 2
        ? searchFn({ data: { q: q.trim() } })
        : Promise.resolve([] as any[]),
    enabled: mode === "customer" && q.trim().length >= 2 && open,
  });

  const { data: refResults = [] } = useQuery({
    queryKey: ["statement-ref-search", q],
    queryFn: () =>
      q.trim().length >= 2
        ? searchRefFn({ data: { q: q.trim() } })
        : Promise.resolve([] as any[]),
    enabled: mode === "reference" && q.trim().length >= 2 && open,
  });

  const { data: company } = useQuery({
    queryKey: ["statement-company"],
    queryFn: () => fetchCompany(),
  });

  const { data: custData, isLoading: custLoading } = useQuery({
    queryKey: ["statement-ledger", customerId, from, to],
    queryFn: () =>
      fetchLedger({
        data: {
          customer_id: customerId,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: mode === "customer" && !!customerId,
  });

  const {
    data: refData,
    isLoading: refLoading,
    error: refError,
  } = useQuery({
    queryKey: ["statement-ref", referenceId, from, to],
    queryFn: () =>
      fetchRefStmt({
        data: {
          reference_id: referenceId,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: mode === "reference" && !!referenceId,
  });

  const rows = custData?.rows ?? [];
  const showCust = mode === "customer" && !!custData;
  const showRef = mode === "reference" && !!refData;
  const ready = showCust || showRef;
  const needsSelection =
    (mode === "customer" && !customerId) ||
    (mode === "reference" && !referenceId);
  const loading =
    (mode === "customer" && !!customerId && (custLoading || !custData)) ||
    (mode === "reference" && !!referenceId && (refLoading || !refData));

  return (
    <div className="p-4 md:p-6 space-y-4 print:p-0 print:space-y-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Customer Statement
        </h1>
        {ready && (
          <Button onClick={() => window.print()} size="sm">
            <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
          </Button>
        )}
      </div>

      <Card className="print:hidden">
        <CardContent className="p-4 space-y-3">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as "customer" | "reference");
              setQ("");
              setOpen(false);
            }}
          >
            <TabsList>
              <TabsTrigger value="customer">By Customer</TabsTrigger>
              <TabsTrigger value="reference">By Reference</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1 relative" ref={wrapRef}>
              <Label className="text-xs">
                {mode === "customer" ? "Customer" : "Reference"}
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={
                    mode === "customer"
                      ? custData
                        ? custData.customer.name
                        : "Search by name, mobile, BIN..."
                      : refData
                        ? refData.reference.name
                        : "Search reference by name or mobile..."
                  }
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                />
              </div>
              {open && mode === "customer" && custResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md">
                  {custResults.map((c: any) => (
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
                        {c.mobile} • {c.bin_number || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {open && mode === "reference" && refResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md">
                  {refResults.map((r: any) => (
                    <button
                      type="button"
                      key={r.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                      onClick={() => {
                        setReferenceId(r.id);
                        setQ("");
                        setOpen(false);
                      }}
                    >
                      <div className="font-medium">{r.reference_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.mobile_number || "—"}
                        {r.whatsapp_number ? ` • WA: ${r.whatsapp_number}` : ""}
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

      {needsSelection ? (
        <Card className="print:hidden">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {mode === "customer"
              ? "Select a customer to generate their statement."
              : "Select a reference to generate the aggregated statement."}
          </CardContent>
        </Card>
      ) : refError && mode === "reference" ? (
        <Card className="print:hidden">
          <CardContent className="p-8 text-center text-sm text-destructive">
            {(refError as Error).message}
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="print:hidden">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Loading statement...
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white text-black mx-auto max-w-4xl shadow-sm print:shadow-none print:max-w-none">
          <div className="p-6 md:p-10 print:p-0">
            {/* Letterhead */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
              <div className="flex items-start gap-3">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt=""
                    className="h-16 w-16 object-contain"
                  />
                )}
                <div>
                  <div className="text-2xl font-bold">
                    {company?.company_name || "Company Name"}
                  </div>
                  {company?.address && (
                    <div className="text-xs text-gray-700 mt-0.5">
                      {company.address}
                    </div>
                  )}
                  <div className="text-xs text-gray-700 mt-0.5">
                    {company?.phone && <span>Phone: {company.phone}</span>}
                    {company?.email && <span> • {company.email}</span>}
                    {company?.website && <span> • {company.website}</span>}
                  </div>
                  {(company?.bin_number || company?.vat_registration_no) && (
                    <div className="text-xs text-gray-700 mt-0.5">
                      {company?.bin_number && <span>BIN: {company.bin_number}</span>}
                      {company?.vat_registration_no && (
                        <span> • VAT: {company.vat_registration_no}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mt-5">
              <div className="text-xl font-bold tracking-wide">
                {showRef
                  ? "STATEMENT OF ACCOUNT — BY REFERENCE"
                  : "STATEMENT OF ACCOUNT"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Period: {fmtDate(from)} &nbsp;to&nbsp; {fmtDate(to)}
              </div>
              <div className="text-xs text-gray-600">
                Issued on: {fmtDate(new Date().toISOString().slice(0, 10))}
              </div>
            </div>

            {showCust && custData && (
              <>
                {/* Customer Info */}
                <div className="mt-5 grid grid-cols-2 gap-4 border border-gray-300 p-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 font-semibold">
                      Statement To
                    </div>
                    <div className="font-semibold mt-0.5">{custData.customer.name}</div>
                    {custData.customer.contact_name &&
                      custData.customer.contact_name !== custData.customer.name && (
                        <div className="text-xs">{custData.customer.contact_name}</div>
                      )}
                    {custData.customer.address && (
                      <div className="text-xs">{custData.customer.address}</div>
                    )}
                    {custData.customer.mobile && (
                      <div className="text-xs">Mobile: {custData.customer.mobile}</div>
                    )}
                  </div>
                  <div className="text-right">
                    {custData.customer.bin_number && (
                      <div className="text-xs">
                        <span className="text-gray-500">BIN:</span>{" "}
                        {custData.customer.bin_number}
                      </div>
                    )}
                    {custData.customer.area_name && (
                      <div className="text-xs">
                        <span className="text-gray-500">Area:</span>{" "}
                        {custData.customer.area_name}
                      </div>
                    )}
                    {custData.customer.reference_name && (
                      <div className="text-xs">
                        <span className="text-gray-500">Reference:</span>{" "}
                        {custData.customer.reference_name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transactions Table */}
                <table className="w-full mt-4 text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-y border-gray-400">
                      <th className="text-left py-2 px-2 font-semibold">Date</th>
                      <th className="text-left py-2 px-2 font-semibold">Particulars</th>
                      <th className="text-left py-2 px-2 font-semibold">Ref No</th>
                      <th className="text-right py-2 px-2 font-semibold">Debit</th>
                      <th className="text-right py-2 px-2 font-semibold">Credit</th>
                      <th className="text-right py-2 px-2 font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="py-1.5 px-2">{fmtDate(from) || "—"}</td>
                      <td className="py-1.5 px-2 font-medium">Opening Balance</td>
                      <td className="py-1.5 px-2">—</td>
                      <td className="py-1.5 px-2 text-right">—</td>
                      <td className="py-1.5 px-2 text-right">—</td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">
                        {balLabel(custData.opening_balance)}
                      </td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center py-6 text-gray-500 italic"
                        >
                          No transactions in this period.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr
                          key={`${r.type}-${r.ref_no}-${i}`}
                          className="border-b border-gray-200"
                        >
                          <td className="py-1.5 px-2 tabular-nums">{fmtDate(r.date)}</td>
                          <td className="py-1.5 px-2">{r.description}</td>
                          <td className="py-1.5 px-2">{r.ref_no}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {r.debit ? fmt(r.debit) : ""}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {r.credit ? fmt(r.credit) : ""}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {balLabel(r.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-400 bg-gray-50">
                      <td colSpan={3} className="py-2 px-2 font-semibold">
                        Total
                      </td>
                      <td className="py-2 px-2 text-right font-semibold tabular-nums">
                        {fmt(custData.totals.debit)}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold tabular-nums">
                        {fmt(custData.totals.credit)}
                      </td>
                      <td className="py-2 px-2"></td>
                    </tr>
                    <tr className="border-y-2 border-gray-800 bg-gray-100">
                      <td colSpan={5} className="py-2 px-2 font-bold">
                        Closing Balance {fmtDate(to) ? `as of ${fmtDate(to)}` : ""}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-base tabular-nums">
                        {balLabel(custData.closing_balance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Summary box */}
                <div className="mt-4 flex justify-end">
                  <div className="border border-gray-400 w-72 text-xs">
                    <div className="flex justify-between px-3 py-1.5 border-b border-gray-300">
                      <span>Opening Balance</span>
                      <span className="font-semibold tabular-nums">
                        {balLabel(custData.opening_balance)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 border-b border-gray-300">
                      <span>Total Bills (Debit)</span>
                      <span className="font-semibold tabular-nums">
                        {fmt(custData.totals.debit)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 border-b border-gray-300">
                      <span>Total Collections (Credit)</span>
                      <span className="font-semibold tabular-nums">
                        {fmt(custData.totals.credit)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-gray-100">
                      <span className="font-bold">Outstanding</span>
                      <span className="font-bold tabular-nums">
                        {balLabel(custData.closing_balance)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {showRef && refData && (
              <>
                {/* Reference Info */}
                <div className="mt-5 grid grid-cols-2 gap-4 border border-gray-300 p-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 font-semibold">
                      Reference
                    </div>
                    <div className="font-semibold mt-0.5">{refData.reference.name}</div>
                    {refData.reference.mobile_number && (
                      <div className="text-xs">
                        Mobile: {refData.reference.mobile_number}
                      </div>
                    )}
                    {refData.reference.whatsapp_number && (
                      <div className="text-xs">
                        WhatsApp: {refData.reference.whatsapp_number}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs">
                      <span className="text-gray-500">Total Customers:</span>{" "}
                      <span className="font-semibold">
                        {refData.reference.customer_count}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Monthly Transactions Table */}
                <table className="w-full mt-4 text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-y border-gray-400">
                      <th className="text-left py-2 px-2 font-semibold">Month</th>
                      <th className="text-right py-2 px-2 font-semibold">Debit (Bills)</th>
                      <th className="text-right py-2 px-2 font-semibold">Credit (Collections)</th>
                      <th className="text-right py-2 px-2 font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="py-1.5 px-2 font-medium">
                        Opening Balance {fmtDate(from) !== "—" ? `(as of ${fmtDate(from)})` : ""}
                      </td>
                      <td className="py-1.5 px-2 text-right">—</td>
                      <td className="py-1.5 px-2 text-right">—</td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">
                        {balLabel(refData.opening_balance)}
                      </td>
                    </tr>
                    {(refData.rows ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-gray-500 italic">
                          No transactions in this period.
                        </td>
                      </tr>
                    ) : (
                      (refData.rows ?? []).map((r) => {
                        const [y, m] = r.month.split("-");
                        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
                        return (
                          <tr key={r.month} className="border-b border-gray-200">
                            <td className="py-1.5 px-2">{label}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {r.debit ? fmt(r.debit) : ""}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {r.credit ? fmt(r.credit) : ""}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {balLabel(r.balance)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-400 bg-gray-50">
                      <td className="py-2 px-2 font-semibold">Total</td>
                      <td className="py-2 px-2 text-right font-semibold tabular-nums">
                        {fmt(refData.totals.debit)}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold tabular-nums">
                        {fmt(refData.totals.credit)}
                      </td>
                      <td className="py-2 px-2"></td>
                    </tr>
                    <tr className="border-y-2 border-gray-800 bg-gray-100">
                      <td colSpan={3} className="py-2 px-2 font-bold">
                        Closing Balance {fmtDate(to) !== "—" ? `as of ${fmtDate(to)}` : ""}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-base tabular-nums">
                        {balLabel(refData.closing_balance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Aggregated Summary */}
                <div className="mt-6 flex justify-center">
                  <div className="border border-gray-400 w-full max-w-md text-sm">
                    <div className="bg-gray-100 border-b border-gray-400 px-3 py-2 font-bold text-center">
                      Aggregated Summary
                    </div>
                    <div className="flex justify-between px-3 py-2 border-b border-gray-300">
                      <span>Opening Balance {fmtDate(from) !== "—" ? `(as of ${fmtDate(from)})` : ""}</span>
                      <span className="font-semibold tabular-nums">
                        {balLabel(refData.opening_balance)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-2 border-b border-gray-300">
                      <span>Total Bills (Debit)</span>
                      <span className="font-semibold tabular-nums">
                        {fmt(refData.totals.debit)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-2 border-b border-gray-300">
                      <span>Total Collections (Credit)</span>
                      <span className="font-semibold tabular-nums">
                        {fmt(refData.totals.credit)}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-3 bg-gray-100 border-t-2 border-gray-800">
                      <span className="font-bold">
                        Closing Outstanding {fmtDate(to) !== "—" ? `as of ${fmtDate(to)}` : ""}
                      </span>
                      <span className="font-bold text-base tabular-nums">
                        {balLabel(refData.closing_balance)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Note */}
            <div className="mt-6 text-[11px] text-gray-600 italic border-t border-gray-300 pt-2">
              Note: DR = Due (amount payable), CR = Advance / Credit.
              Please reconcile this statement with your records and inform us of
              any discrepancy within 7 days from the date of issue.
            </div>

            {/* Signatures */}
            <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
              <div className="text-center">
                <div className="border-t border-gray-800 pt-1">
                  {showRef ? "Reference Signature" : "Customer Signature"}
                </div>
              </div>
              <div className="text-center">
                {company?.print_signature_url && (
                  <img
                    src={company.print_signature_url}
                    alt=""
                    className="h-12 mx-auto object-contain mb-1"
                  />
                )}
                <div className="border-t border-gray-800 pt-1">
                  {company?.print_signature_label || "Authorized Signatory"}
                </div>
              </div>
            </div>

            {/* Footer */}
            {company?.invoice_footer_text && (
              <div className="mt-8 text-center text-[10px] text-gray-500 border-t border-gray-300 pt-2">
                {company.invoice_footer_text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

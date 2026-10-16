import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCollectionReport, getCollectionByRefSummary } from "@/lib/reports.functions";
import { listAreas, listReferences } from "@/lib/erp.functions";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  ReportFilters, SummaryCards, ReportTitle, downloadCsv, printReport, fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthPicker } from "@/components/month-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarRange, CalendarDays, UserRound } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/reports/collection")({
  head: () => ({ meta: [{ title: "One | Collection Report" }] }),
  component: CollectionReportPage,
});

const fmtMonth = (ym: string) => {
  if (!ym) return "";
  const d = new Date(ym);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

function CollectionReportPage() {
  const fetchReport = useServerFn(getCollectionReport);
  const fetchByRefSummary = useServerFn(getCollectionByRefSummary);
  const fetchAreas = useServerFn(listAreas);
  const fetchReferences = useServerFn(listReferences);

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const currentMonth = today.slice(0, 7);

  const [mode, setMode] = useState<"date" | "month" | "ref">("date");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [uptoDate, setUptoDate] = useState("");
  const [refMonth, setRefMonth] = useState("");
  const [areaId, setAreaId] = useState("");
  const [referenceId, setReferenceId] = useState("");

  const filters = useMemo(() => ({
    filter_by: (mode === "ref" ? "month" : mode) as "date" | "month",
    from: mode === "date" ? (from || undefined) : undefined,
    to: mode === "date" ? (to || undefined) : undefined,
    month: mode === "month" ? (month || undefined) : undefined,
    area_id: areaId || undefined,
    reference_id: referenceId || undefined,
  }), [mode, from, to, month, areaId, referenceId]);

  const { data, isLoading } = useQuery({
    queryKey: ["report-collection", filters],
    queryFn: () => fetchReport({ data: filters }),
    enabled: mode !== "ref",
  });

  const { data: areas } = useQuery({
    queryKey: ["areas-all"],
    queryFn: () => fetchAreas(),
  });

  const { data: references } = useQuery<Array<{ id: string; reference_name: string }>>({
    queryKey: ["references-all"],
    queryFn: () => fetchReferences() as Promise<Array<{ id: string; reference_name: string }>>,
  });

  const rows = data?.rows ?? [];
  const s = data?.summary;

  const { session, role } = useAuth();

  const fmtDateLabel = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${pad(d.getDate())}-${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()}`;
  };

  const refPeriodLabel = uptoDate
    ? `Upto ${fmtDateLabel(uptoDate)}`
    : refMonth
      ? `Month of ${fmtMonth(refMonth + "-01")}`
      : "All time";

  const subtitle = mode === "month"
    ? `By Month: ${fmtMonth(month + "-01")}`
    : mode === "ref"
      ? `By Reference: ${refPeriodLabel}`
      : `${from} → ${to}`;

  const onCsv = () => {
    const tag = mode === "date" ? `${from}_to_${to}` : month;
    downloadCsv(
      `collection-report-${tag}.csv`,
      ["Receipt No", "Date", "Customer", "Mobile", "Area", "Reference", "Method", "Collected By", "Amount"],
      rows.map((r) => [r.receipt_no, r.collection_date, r.customer_name, r.mobile, r.area_name, r.reference_name, r.payment_method, r.collected_by, fmt(r.amount)]),
    );
  };

  const buildByRefPosData = async () => {
    const uid = session?.user?.id;
    const [{ data: company }, summaryRes, profileRes] = await Promise.all([
      supabase
        .from("company_settings")
        .select("company_name, address, phone")
        .limit(1)
        .maybeSingle(),
      fetchByRefSummary({ data: { reference_id: referenceId, upto: uptoDate || undefined, month: refMonth || undefined } }),
      uid
        ? supabase.from("profiles").select("name").eq("id", uid).maybeSingle()
        : Promise.resolve({ data: null as { name: string | null } | null }),
    ]);
    const ref = (references ?? []).find((r) => r.id === referenceId);
    const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : "User";
    const email = session?.user?.email ?? "";
    const name = profileRes?.data?.name?.trim() || email.split("@")[0] || "—";

    const monthLabel = refMonth ? fmtMonth(refMonth + "-01") : "";
    let billingMonthLabel = "";
    if (refMonth) {
      const [yy, mm] = refMonth.split("-").map(Number);
      const py = mm === 1 ? yy - 1 : yy;
      const pm = mm === 1 ? 12 : mm - 1;
      billingMonthLabel = fmtMonth(`${py}-${String(pm).padStart(2, "0")}-01`);
    }
    const openingAsOf = refMonth ? `01 ${monthLabel}` : "";
    const closingDate = uptoDate ? new Date(uptoDate) : new Date();
    const closingAsOf = `${String(closingDate.getDate()).padStart(2, "0")} ${closingDate.toLocaleString("en-US", { month: "short" })} ${closingDate.getFullYear()}`;

    return {
      company: company ?? null,
      reference_name: ref?.reference_name ?? "—",
      upto_label: refPeriodLabel,
      month_label: monthLabel || undefined,
      billing_month_label: billingMonthLabel || undefined,
      opening_as_of_label: openingAsOf || undefined,
      closing_as_of_label: closingAsOf,
      summary: summaryRes.summary,
      generated_by: `${roleLabel}${company?.company_name ? `, ${company.company_name}` : ""}`,
    };
  };


  const onPrint = async () => {
    if (mode === "ref") {
      if (!referenceId) {
        toast.error("Please select a reference");
        return;
      }
      const { openByRefCollectionPosViewer } = await import("@/lib/collection-by-ref-pos");
      openByRefCollectionPosViewer(await buildByRefPosData());
      return;
    }
    printReport();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ReportTitle title="Collection Report" subtitle={subtitle} />

      <div className="print:hidden">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "date" | "month" | "ref")}>
          <TabsList className="h-12 p-1.5 bg-gradient-to-br from-muted/80 to-muted/40 rounded-2xl border border-border/60 shadow-sm gap-1 backdrop-blur-sm">
            <TabsTrigger
              value="date"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <CalendarRange className="h-4 w-4" />
              By Period
            </TabsTrigger>
            <TabsTrigger
              value="month"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <CalendarDays className="h-4 w-4" />
              By Month
            </TabsTrigger>
            <TabsTrigger
              value="ref"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <UserRound className="h-4 w-4" />
              By Ref
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ReportFilters
        showDate={mode === "date"}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
        areaId={areaId} onAreaChange={setAreaId}
        areas={(areas ?? []) as Array<{ id: string; area_name: string }>}
        onPrint={onPrint}
        printLabel={mode === "ref" ? "View" : "Print"}
        printIcon={mode === "ref" ? "eye" : "printer"}
        onCsv={mode === "ref" ? undefined : onCsv}
        extraSlot={
          <>
            {mode === "month" ? (
              <div>
                <Label className="text-xs">Month</Label>
                <MonthPicker value={month} onChange={setMonth} />
              </div>
            ) : null}
            {mode === "ref" ? (
              <>
                <div>
                  <Label className="text-xs">Month</Label>
                  <MonthPicker value={refMonth} onChange={setRefMonth} />
                </div>
                <div>
                  <Label className="text-xs">Upto Date</Label>
                  <input
                    type="date"
                    value={uptoDate}
                    onChange={(e) => setUptoDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </>
            ) : null}
            <div>
              <Label className="text-xs">Reference{mode === "ref" ? " *" : ""}</Label>
              <Select value={referenceId ? referenceId : "all"} onValueChange={(v) => setReferenceId(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={mode === "ref" ? "Select reference" : "All references"} /></SelectTrigger>
                <SelectContent>
                  {mode !== "ref" && <SelectItem value="all">All references</SelectItem>}
                  {(references ?? []).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>{ref.reference_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {mode === "ref" ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            {!referenceId ? (
              <>Please select a reference (optionally filter by Month or Upto Date) to view the collection summary receipt.</>
            ) : (
              <>Click <span className="font-semibold">View</span> to open the printable Collection Report receipt.</>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards items={[
            { label: "Total Receipts", value: s?.total_count ?? 0 },
            { label: "Total Collected", value: fmt(s?.total_amount ?? 0), tone: "success" },
          ]} />
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4"><TableSkeleton /></div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No collections found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Collected By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.receipt_no}</TableCell>
                        <TableCell>{r.collection_date}</TableCell>
                        <TableCell>{r.customer_name}<div className="text-xs text-muted-foreground">{r.mobile}</div></TableCell>
                        <TableCell>{r.area_name}</TableCell>
                        <TableCell>{r.reference_name}</TableCell>
                        <TableCell>{r.payment_method}</TableCell>
                        <TableCell>{r.collected_by}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

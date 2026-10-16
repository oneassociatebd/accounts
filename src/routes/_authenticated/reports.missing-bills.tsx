import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMissingBillsReport } from "@/lib/reports.functions";
import { listAreas, listReferences } from "@/lib/erp.functions";
import {
  ReportFilters, SummaryCards, ReportTitle, printReport, fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/month-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FilePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/missing-bills")({
  head: () => ({ meta: [{ title: "One | Missing Bills Report" }] }),
  component: MissingBillsReportPage,
});

const fmtMonth = (ym: string) => {
  if (!ym) return "";
  const d = new Date(ym);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

function MissingBillsReportPage() {
  const fetchReport = useServerFn(getMissingBillsReport);
  const fetchAreas = useServerFn(listAreas);
  const fetchReferences = useServerFn(listReferences);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const [month, setMonth] = useState(currentMonth);
  const [areaId, setAreaId] = useState("");
  const [referenceId, setReferenceId] = useState("");

  const filters = useMemo(() => ({
    month,
    area_id: areaId || undefined,
    reference_id: referenceId || undefined,
  }), [month, areaId, referenceId]);

  const { data, isLoading } = useQuery({
    queryKey: ["report-missing-bills", filters],
    queryFn: () => fetchReport({ data: filters }),
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
  const subtitle = `Missing for: ${fmtMonth(month + "-01")}`;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ReportTitle title="Missing Bills Report" subtitle={subtitle} />

      <ReportFilters
        showDate={false}
        from="" to=""
        onFromChange={() => {}} onToChange={() => {}}
        areaId={areaId} onAreaChange={setAreaId}
        areas={(areas ?? []) as Array<{ id: string; area_name: string }>}
        onPrint={printReport}
        extraSlot={
          <>
            <div>
              <Label className="text-xs">Month</Label>
              <MonthPicker value={month} onChange={setMonth} />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Select value={referenceId ?? "all"} onValueChange={(v) => setReferenceId(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All references" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All references</SelectItem>
                  {(references ?? []).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>{ref.reference_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      <SummaryCards items={[
        { label: "Total Active Clients", value: s?.total_active ?? 0 },
        { label: "Billed", value: s?.billed ?? 0, tone: "success" as const },
        { label: "Missing Bills", value: s?.missing ?? 0, tone: "warning" as const },
      ]} />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              All eligible customers have bills for this month.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Monthly Fee</TableHead>
                  <TableHead className="print:hidden text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {r.customer_name}
                      {r.address ? <div className="text-xs text-muted-foreground">{r.address}</div> : null}
                    </TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    <TableCell>{r.area_name}</TableCell>
                    <TableCell>{r.reference_name}</TableCell>
                    <TableCell className="text-right">{fmt(r.monthly_fee)}</TableCell>
                    <TableCell className="print:hidden text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/bills/new">
                          <FilePlus className="h-4 w-4 mr-1" /> Create Bill
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

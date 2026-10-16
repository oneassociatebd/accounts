import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDueReport } from "@/lib/reports.functions";
import { listAreas, listReferences } from "@/lib/erp.functions";
import { sendDueRemindersSms } from "@/lib/whatsapp.functions";
import {
  ReportFilters, SummaryCards, ReportTitle, downloadCsv, printReport, fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/reports/due")({
  head: () => ({ meta: [{ title: "One | Due Report" }] }),
  component: DueReportPage,
});

function DueReportPage() {
  const fetchReport = useServerFn(getDueReport);
  const fetchAreas = useServerFn(listAreas);
  const fetchReferences = useServerFn(listReferences);
  const sendBulkSms = useServerFn(sendDueRemindersSms);

  const [areaId, setAreaId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [dueSort, setDueSort] = useState<"desc" | "asc">("desc");
  const [sending, setSending] = useState(false);

  const filters = useMemo(() => ({
    area_id: areaId || undefined,
    reference_id: referenceId || undefined,
  }), [areaId, referenceId]);

  const { data, isLoading } = useQuery({
    queryKey: ["report-due", filters],
    queryFn: () => fetchReport({ data: filters }),
  });

  const { data: areas } = useQuery({
    queryKey: ["areas-all"],
    queryFn: () => fetchAreas(),
  });

  const { data: references } = useQuery({
    queryKey: ["references-all"],
    queryFn: () => fetchReferences(),
  });

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    return [...list].sort((a, b) => dueSort === "desc" ? b.due - a.due : a.due - b.due);
  }, [data?.rows, dueSort]);

  const s = data?.summary;
  const dueRows = rows.filter((r) => r.due > 0);
  const dueCount = dueRows.length;
  const maxDueAmt = dueCount ? Math.max(...dueRows.map((r) => r.due)) : 0;

  const onCsv = () => {
    downloadCsv(
      `due-report-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Serial", "Client Name", "Mobile", "Due Amount", "Area", "Reference"],
      rows.map((r, i) => [String(i + 1), r.customer_name, r.mobile, fmt(r.due), r.area_name, r.reference_name ?? ""]),
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ReportTitle title="Due Report" subtitle="Outstanding balances by customer" />
      <ReportFilters
        showDate={false}
        areaId={areaId} onAreaChange={setAreaId}
        areas={(areas ?? []) as any}
        referenceId={referenceId} onReferenceChange={setReferenceId}
        references={(references ?? []) as any}
        onPrint={printReport} onCsv={onCsv}
      />
      <SummaryCards items={[
        { label: "Total Clients", value: s?.total_customers ?? 0 },
        { label: "Clients with Due", value: dueCount, tone: "danger" },
        { label: "Max Due", value: fmt(maxDueAmt), tone: "danger" },
        { label: "Total Due", value: fmt(s?.total_due ?? 0), tone: "danger" },
      ]} />
      {dueCount > 0 && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Send SMS to all due clients ({dueCount})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  SMS will be sent to {dueCount} due clients according to the current filter. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setSending(true);
                    const t = toast.loading("Sending SMS...");
                    try {
                      const res = await sendBulkSms({ data: filters });
                      toast.success(
                        `${res.sent}/${res.total} SMS sent successfully` +
                          (res.failed ? ` • ${res.failed} failed` : "") +
                          (res.skipped ? ` • ${res.skipped} skipped` : ""),
                        { id: t },
                      );
                      if (res.errors?.length) {
                        console.warn("Bulk SMS errors:", res.errors);
                      }
                    } catch (e: any) {
                      toast.error(e?.message || "Failed to send SMS", { id: t });
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  Send
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No outstanding balances.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Serial</TableHead>
                  <TableHead>Client Name, Mobile</TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => setDueSort((prev) => (prev === "desc" ? "asc" : "desc"))}
                  >
                    Due Amount {dueSort === "desc" ? "↓" : "↑"}
                  </TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{r.customer_name}<div className="text-xs text-muted-foreground">{r.mobile}</div></TableCell>
                    <TableCell className="text-right font-medium text-destructive">{fmt(r.due)}</TableCell>
                    <TableCell>{r.area_name}</TableCell>
                    <TableCell>{r.reference_name}</TableCell>
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

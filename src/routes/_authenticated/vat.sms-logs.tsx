import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listVatSmsLogs } from "@/lib/vat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/vat/sms-logs")({
  head: () => ({ meta: [{ title: "SMS Logs" }] }),
  component: VatSmsLogsPage,
});

function VatSmsLogsPage() {
  const fetchAll = useServerFn(listVatSmsLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["vat-sms-logs"],
    queryFn: () => fetchAll({ data: { limit: 200 } }),
  });
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">SMS Logs</h1>
        <p className="text-sm text-muted-foreground">All VAT-related SMS notifications</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Logs ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={6} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No SMS logs yet.</div> : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[900px] text-sm">
                <TableHeader className="sticky top-0 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.sent_at).toLocaleString()}</TableCell>
                      <TableCell>{r.submission?.customer?.company_name || r.submission?.customer?.name || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.recipient_mobile}</TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={r.message}>{r.message}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "SENT" ? "default" : r.status === "FAILED" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.provider_response}>{r.provider_response || "-"}</TableCell>
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

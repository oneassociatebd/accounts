import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listVatAuditLogs } from "@/lib/vat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/vat/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs" }] }),
  component: VatAuditLogsPage,
});

function VatAuditLogsPage() {
  const fetchAll = useServerFn(listVatAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["vat-audit-logs"],
    queryFn: () => fetchAll({ data: { limit: 200 } }),
  });
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Track all VAT submission actions</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Activity ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <TableSkeleton rows={6} cols={5} /> :
            rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No audit logs yet.</div> : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full min-w-[700px] text-sm">
                <TableHeader className="sticky top-0 bg-background [&_th]:bg-background">
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{r.user_name || "-"}</TableCell>
                      <TableCell><Badge variant="secondary">{r.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.reference || "-"}</TableCell>
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

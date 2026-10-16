import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listBkashPayments } from "@/lib/bkash.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/finance/bkash-payments")({
  head: () => ({ meta: [{ title: "One | bKash Payments" }] }),
  component: BkashPaymentsPage,
});

type Row = {
  id: string;
  bill_id: string;
  customer_id: string;
  amount: number;
  payment_id: string | null;
  trx_id: string | null;
  status: string;
  collection_id: string | null;
  created_at: string;
  bill: { bill_no: string } | null;
  customer: { name: string | null; company_name: string | null; mobile: string | null } | null;
};

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toFixed(2);
}

function BkashPaymentsPage() {
  const { role } = useAuth();
  const listFn = useServerFn(listBkashPayments);
  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["bkash-payments"],
    queryFn: () => listFn() as unknown as Promise<Row[]>,
    enabled: role === "admin",
  });

  if (role && role !== "admin") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You don't have permission to view bKash payments.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">bKash Payments</h1>
        <p className="text-sm text-muted-foreground">
          Customer bKash payment attempts made from the public bill link.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Attempts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trx ID</TableHead>
                <TableHead>Payment ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No bKash payments yet</TableCell></TableRow>
              ) : (
                data.map((r, i) => {
                  const name = r.customer?.company_name || r.customer?.name || "—";
                  const variant =
                    r.status === "SUCCESS" ? "default" :
                    r.status === "FAILED" ? "destructive" :
                    r.status === "CANCELLED" ? "secondary" : "outline";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell>{r.bill?.bill_no ?? "—"}</TableCell>
                      <TableCell>{name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.amount)}</TableCell>
                      <TableCell><Badge variant={variant as any}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.trx_id ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.payment_id ?? "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

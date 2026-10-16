import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listRateHistory } from "@/lib/erp.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/service-rates/$itemId/history")({
  head: () => ({
    meta: [{ title: "One | Rate History" }],
  }),
  component: RateHistoryPage,
});

type Rate = {
  id: string;
  service_item_id: string;
  regular_rate: number;
  minimum_charge: number;
  effective_from: string;
  created_at: string;
  created_by: string | null;
  service_item: { id: string; item_name: string } | null;
};

function RateHistoryPage() {
  const { itemId } = Route.useParams();
  const fn = useServerFn(listRateHistory);
  const { data: rows = [], isLoading } = useQuery<Rate[]>({
    queryKey: ["rate-history", itemId],
    queryFn: () => fn({ data: { service_item_id: itemId } }) as Promise<Rate[]>,
  });

  const name = rows[0]?.service_item?.item_name ?? "—";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rate History</h1>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/master/service-rates">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead className="text-right">Regular Rate</TableHead>
                <TableHead className="text-right">Min. Charge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <TableSkeleton rows={4} cols={6} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No history
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{r.effective_from}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.regular_rate).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.minimum_charge).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {i === 0 ? (
                        <Badge variant="default">Latest</Badge>
                      ) : (
                        <Badge variant="secondary">Historic</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

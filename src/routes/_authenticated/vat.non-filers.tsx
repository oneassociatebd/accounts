import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { listVatNonFilers } from "@/lib/vat.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { MonthPicker } from "@/components/month-picker";
import { Plus, Search } from "lucide-react";

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const searchSchema = z.object({ period: z.string().optional() });

export const Route = createFileRoute("/_authenticated/vat/non-filers")({
  head: () => ({ meta: [{ title: "Non-Filer Clients" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: VatNonFilersPage,
});

function defaultPeriod() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${MN[d.getMonth()]} ${d.getFullYear()}`;
}

function periodToMonthStr(period: string): string {
  const [mm, yy] = period.split(" ");
  const idx = MN.indexOf(mm);
  if (idx < 0 || !yy) return "";
  return `${yy}-${String(idx + 1).padStart(2, "0")}`;
}

function monthStrToPeriod(m: string): string {
  const [y, mo] = m.split("-");
  const idx = parseInt(mo, 10) - 1;
  if (idx < 0 || idx > 11) return "";
  return `${MN[idx]} ${y}`;
}

function VatNonFilersPage() {
  const search = Route.useSearch();
  const [period, setPeriod] = useState<string>(search.period || defaultPeriod());
  const [query, setQuery] = useState("");

  const fetchFn = useServerFn(listVatNonFilers);
  const { data, isLoading } = useQuery({
    queryKey: ["vat-non-filers", period],
    queryFn: () => fetchFn({ data: { tax_period: period } }),
  });

  const rows = useMemo(() => {
    const list = (data ?? []) as any[];
    const s = query.toLowerCase().trim();
    if (!s) return list;
    return list.filter((c) =>
      (c.company_name || "").toLowerCase().includes(s) ||
      (c.name || "").toLowerCase().includes(s) ||
      (c.bin_number || "").toLowerCase().includes(s) ||
      (c.mobile || "").includes(s)
    );
  }, [data, query]);

  const monthStr = periodToMonthStr(period);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Non-Filer Clients</h1>
          <p className="text-sm text-muted-foreground">
            Active clients without a finalized VAT return for {period}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tax Period</label>
              <MonthPicker
                value={monthStr}
                onChange={(m) => setPeriod(monthStrToPeriod(m) || period)}
              />
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Company / Name / BIN / Mobile"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Non-Filer{rows.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No non-filer clients for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>BIN</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.company_name || "-"}</TableCell>
                      <TableCell>{c.name || "-"}</TableCell>
                      <TableCell>{c.bin_number || "-"}</TableCell>
                      <TableCell>{c.mobile || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/vat/new">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Submit
                          </Link>
                        </Button>
                      </TableCell>
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

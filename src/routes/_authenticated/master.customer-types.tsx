import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCustomerTypes, createCustomerType, toggleCustomerType } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/customer-types")({
  head: () => ({
    meta: [{ title: "One | Customer Types" }],
  }),
  component: CustomerTypesPage,
});

type CustomerType = { id: string; type_name: string; is_active: boolean };

function CustomerTypesPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listCustomerTypes);
  const createFn = useServerFn(createCustomerType);
  const toggleFn = useServerFn(toggleCustomerType);
  const { data: types = [], isLoading } = useQuery<CustomerType[]>({
    queryKey: ["customer-types"],
    queryFn: () => fetchFn() as Promise<CustomerType[]>,
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createFn({ data: { type_name: name.trim() } });
      setName("");
      toast.success("Customer type added");
      qc.invalidateQueries({ queryKey: ["customer-types"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (id: string, v: boolean) => {
    try {
      await toggleFn({ data: { id, is_active: v } });
      qc.invalidateQueries({ queryKey: ["customer-types"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Customer Types</h1>
        <p className="text-sm text-muted-foreground">Master list of customer categories (e.g. Retail, Wholesale, Corporate)</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Add Customer Type</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex gap-2">
            <Input placeholder="Type name (e.g. Retail)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            <Button type="submit" disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3}><TableSkeleton rows={4} cols={3} /></TableCell></TableRow>
              ) : types.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No customer types yet</TableCell></TableRow>
              ) : types.map((t, i) => (
                <TableRow key={t.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{t.type_name}</TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={(v) => onToggle(t.id, v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listLocations, createLocation, toggleLocation } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/locations")({
  head: () => ({
    meta: [{ title: "One | Locations" }],
  }),
  component: LocationsPage,
});

function LocationsPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listLocations);
  const createFn = useServerFn(createLocation);
  const toggleFn = useServerFn(toggleLocation);
  const { data: locations = [], isLoading } = useQuery({ queryKey: ["locations"], queryFn: () => fetchFn() });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createFn({ data: { location_name: name.trim() } });
      setName("");
      toast.success("Location added");
      qc.invalidateQueries({ queryKey: ["locations"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (id: string, v: boolean) => {
    await toggleFn({ data: { id, is_active: v } });
    qc.invalidateQueries({ queryKey: ["locations"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Locations</h1>
      <Card>
        <CardHeader><CardTitle>Add Location</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex gap-2">
            <Input placeholder="Location name" value={name} onChange={(e) => setName(e.target.value)} required />
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
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3}><TableSkeleton rows={4} cols={3} /></TableCell></TableRow>
              ) : locations.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No locations yet</TableCell></TableRow>
              ) : locations.map((l: any, i: number) => (
                <TableRow key={l.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{l.location_name}</TableCell>
                  <TableCell>
                    <Switch checked={l.is_active} onCheckedChange={(v) => onToggle(l.id, v)} />
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

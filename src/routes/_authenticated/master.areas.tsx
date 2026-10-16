import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAreas, createArea, toggleArea, listLocations } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/areas")({
  head: () => ({
    meta: [{ title: "One | Areas" }],
  }),
  component: AreasPage,
});

function AreasPage() {
  const qc = useQueryClient();
  const fetchAreasFn = useServerFn(listAreas);
  const fetchLocs = useServerFn(listLocations);
  const createFn = useServerFn(createArea);
  const toggleFn = useServerFn(toggleArea);

  const { data: areas = [], isLoading } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreasFn() });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });

  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !locationId) return;
    setBusy(true);
    try {
      await createFn({ data: { area_name: name.trim(), location_id: locationId } });
      setName("");
      toast.success("Area added");
      qc.invalidateQueries({ queryKey: ["areas"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (id: string, v: boolean) => {
    await toggleFn({ data: { id, is_active: v } });
    qc.invalidateQueries({ queryKey: ["areas"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Areas</h1>
      <Card>
        <CardHeader><CardTitle>Add Area</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.location_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Area name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Button type="submit" disabled={busy || !locationId}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
          {locations.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Create a location first.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4}><TableSkeleton rows={4} cols={4} /></TableCell></TableRow>
              ) : areas.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No areas yet</TableCell></TableRow>
              ) : areas.map((a: any, i: number) => (
                <TableRow key={a.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{a.area_name}</TableCell>
                  <TableCell>{a.location?.location_name ?? "—"}</TableCell>
                  <TableCell>
                    <Switch checked={a.is_active} onCheckedChange={(v) => onToggle(a.id, v)} />
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

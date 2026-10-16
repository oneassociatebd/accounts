import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMushakItems, createMushakItem, updateMushakItem, deleteMushakItem } from "@/lib/mushak.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Save, Trash2, Edit2, X } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/mushak-items")({
  head: () => ({ meta: [{ title: "Mushak 4.3 Items" }] }),
  component: MushakItemsPage,
});

type Item = { id: string; item_name: string; is_active: boolean };

function MushakItemsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listMushakItems);
  const createFn = useServerFn(createMushakItem);
  const updateFn = useServerFn(updateMushakItem);
  const deleteFn = useServerFn(deleteMushakItem);

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ["mushak-items"],
    queryFn: () => fetchAll({ data: { only_active: false } }) as Promise<Item[]>,
  });

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createFn({ data: { item_name: name.trim() } });
      setName("");
      toast.success("Item added");
      qc.invalidateQueries({ queryKey: ["mushak-items"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusy(false); }
  };

  const toggle = async (id: string, is_active: boolean) => {
    try {
      await updateFn({ data: { id, is_active } });
      qc.invalidateQueries({ queryKey: ["mushak-items"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const saveEdit = async (id: string) => {
    const v = editing[id]?.trim();
    if (!v) return;
    try {
      await updateFn({ data: { id, item_name: v } });
      setEditing((p) => { const n = { ...p }; delete n[id]; return n; });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["mushak-items"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const remove = async (id: string, n: string) => {
    if (!confirm(`Delete item "${n}"?`)) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["mushak-items"] });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Mushak 4.3 Item List</h1>
        <p className="text-sm text-muted-foreground">Master list of importable items for Mushak 4.3 declarations</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Item</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="e.g. Coal" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            <Button type="submit" disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Items {items.length > 0 && <span className="text-sm font-normal text-muted-foreground">({items.length})</span>}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4}><TableSkeleton rows={4} cols={4} /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No items yet</TableCell></TableRow>
              ) : items.map((t, i) => {
                const isEditing = editing[t.id] !== undefined;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={editing[t.id]} onChange={(e) => setEditing((p) => ({ ...p, [t.id]: e.target.value }))} maxLength={100} />
                      ) : (
                        <span className="font-medium">{t.item_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.is_active} onCheckedChange={(v) => toggle(t.id, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => saveEdit(t.id)}><Save className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing((p) => { const n = { ...p }; delete n[t.id]; return n; })}><X className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditing((p) => ({ ...p, [t.id]: t.item_name }))}><Edit2 className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(t.id, t.item_name)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

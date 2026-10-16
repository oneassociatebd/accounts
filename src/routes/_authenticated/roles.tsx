import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users, Save, Loader2 } from "lucide-react";
import { listRolePermissions, updateRolePermissions } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [{ title: "One | Roles & Permissions" }],
  }),
  component: RolesPage,
});

type Row = {
  id: string;
  role: "admin" | "manager";
  module: string;
  action: string;
  permission_key: string;
  allowed: boolean;
};

function RolesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const fetchPerms = useServerFn(listRolePermissions);
  const savePerms = useServerFn(updateRolePermissions);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPerms();
      setRows(data as Row[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { module: string; action: string; permission_key: string; admin?: Row; manager?: Row }>();
    for (const r of rows) {
      const key = r.permission_key;
      const existing = map.get(key) ?? { module: r.module, action: r.action, permission_key: key };
      if (r.role === "admin") existing.admin = r;
      else existing.manager = r;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [rows]);

  const toggle = (id: string, value: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, allowed: value } : r)));
    setDirty((d) => ({ ...d, [id]: true }));
  };

  const save = async () => {
    const changed = rows.filter((r: Row) => dirty[r.id]);
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await savePerms({ data: changed.map((r: Row) => ({ id: r.id, allowed: r.allowed })) });
      toast.success("Permissions saved");
      setDirty({});
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(dirty).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Toggle what each role can do. Changes apply to UI visibility.
          </p>
        </div>
        <Button onClick={save} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Admin</CardTitle>
              <p className="text-xs text-muted-foreground">Full system access</p>
            </div>
            <Badge className="ml-auto" variant="default">System</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Manages users, master data, settings, and access to all customers and reports.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Manager</CardTitle>
              <p className="text-xs text-muted-foreground">Area-scoped access</p>
            </div>
            <Badge className="ml-auto" variant="secondary">Operational</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Works with customers in assigned areas based on enabled permissions.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-center w-24">Admin</TableHead>
                  <TableHead className="text-center w-24">Manager</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((g) => (
                  <TableRow key={g.permission_key}>
                    <TableCell className="font-medium">{g.module}</TableCell>
                    <TableCell>{g.action}</TableCell>
                    <TableCell className="text-center">
                      {g.admin && (
                        <Checkbox
                          checked={g.admin.allowed}
                          onCheckedChange={(v) => toggle(g.admin!.id, Boolean(v))}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {g.manager && (
                        <Checkbox
                          checked={g.manager.allowed}
                          onCheckedChange={(v) => toggle(g.manager!.id, Boolean(v))}
                        />
                      )}
                    </TableCell>
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

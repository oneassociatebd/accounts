import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagersMultiSelect } from "@/components/managers-multi-select";
import { listAssignments, listManagers, assignManagers } from "@/lib/erp.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Save, Search, Users, Users2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({ meta: [{ title: "One | Assignments" }] }),
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  if (role && !isAdmin) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You don't have permission to manage assignments.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Manage which managers are assigned to which customers.
        </p>
      </div>

      <Tabs defaultValue="customers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="customers" className="gap-2">
            <Users className="h-4 w-4" /> Customer Assignment
          </TabsTrigger>
          <TabsTrigger value="shared" className="gap-2">
            <Users2 className="h-4 w-4" /> Shared Customers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="m-0">
          <CustomersTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="shared" className="m-0">
          <SharedTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CustomersTab({ isAdmin }: { isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "assigned" | "shared" | "unassigned">("all");
  const [pending, setPending] = useState<Record<string, string[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const qc = useQueryClient();
  const fetchList = useServerFn(listAssignments);
  const fetchManagers = useServerFn(listManagers);
  const saveFn = useServerFn(assignManagers);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["assignments", "customers", filter],
    queryFn: () =>
      fetchList({
        data: {
          shared_only: filter === "shared",
          unassigned_only: filter === "unassigned",
        },
      }),
    enabled: isAdmin,
  });
  const { data: managers = [] } = useQuery({
    queryKey: ["managers", "active"],
    queryFn: () => fetchManagers(),
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = rows as any[];
    if (filter === "assigned") list = list.filter((r) => r.manager_ids.length > 0);
    if (!s) return list;
    return list.filter(
      (r) =>
        r.company_name?.toLowerCase().includes(s) ||
        r.bin_number?.toLowerCase().includes(s) ||
        r.mobile?.toLowerCase().includes(s),
    );
  }, [rows, search, filter]);

  const handleSave = async (customerId: string, currentIds: string[]) => {
    const next = pending[customerId] ?? currentIds;
    setSavingId(customerId);
    try {
      await saveFn({ data: { customer_id: customerId, manager_ids: next } });
      toast.success("Assignments saved");
      setPending((p) => {
        const c = { ...p };
        delete c[customerId];
        return c;
      });
      await qc.invalidateQueries({ queryKey: ["assignments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Customers ({filtered.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "assigned", "shared", "unassigned"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / BIN / mobile"
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[420px]">Assigned Managers</TableHead>
                <TableHead className="w-[100px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => {
                  const current = (r.manager_ids ?? []).map(String);
                  const selected = pending[r.id] ?? current;
                  const dirty =
                    pending[r.id] !== undefined &&
                    (selected.length !== current.length ||
                      selected.some((x) => !current.includes(x)));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link to="/customers/$id" params={{ id: r.id }} className="font-medium hover:underline">
                          {r.company_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {r.bin_number || "—"} · {r.mobile || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.area?.area_name ?? "—"}
                        {r.area?.location?.location_name && (
                          <div className="text-xs text-muted-foreground">{r.area.location.location_name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Active" : "Disabled"}
                        </Badge>
                        {current.length >= 2 && (
                          <Badge variant="outline" className="ml-1">Shared</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ManagersMultiSelect
                          managers={managers as any}
                          selected={selected}
                          onChange={(ids) => setPending((p) => ({ ...p, [r.id]: ids }))}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={!dirty || savingId === r.id}
                          onClick={() => handleSave(r.id, current)}
                        >
                          <Save className="h-3.5 w-3.5 mr-1" />
                          {savingId === r.id ? "Saving…" : "Save"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SharedTab({ isAdmin }: { isAdmin: boolean }) {
  const [search, setSearch] = useState("");

  const fetchList = useServerFn(listAssignments);
  const fetchManagers = useServerFn(listManagers);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["assignments", "shared"],
    queryFn: () => fetchList({ data: { shared_only: true } }),
    enabled: isAdmin,
  });
  const { data: managers = [] } = useQuery({
    queryKey: ["managers", "active"],
    queryFn: () => fetchManagers(),
    enabled: isAdmin,
  });
  const mgrMap = useMemo(() => {
    const m = new Map<string, { name: string; username?: string | null }>();
    (managers as any[]).forEach((x) => m.set(String(x.id), { name: x.name, username: x.username }));
    return m;
  }, [managers]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows as any[];
    return (rows as any[]).filter(
      (r) =>
        r.company_name?.toLowerCase().includes(s) ||
        r.bin_number?.toLowerCase().includes(s) ||
        r.mobile?.toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4" /> Shared ({filtered.length})
          </CardTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / BIN / mobile"
              className="pl-8 w-64"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Managers</TableHead>
                <TableHead className="w-[80px] text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No shared customers.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to="/customers/$id" params={{ id: r.id }} className="font-medium hover:underline">
                        {r.company_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.bin_number || "—"} · {r.mobile || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.area?.area_name ?? "—"}
                      {r.area?.location?.location_name && (
                        <div className="text-xs text-muted-foreground">{r.area.location.location_name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.manager_ids as string[]).map((mid) => {
                          const m = mgrMap.get(String(mid));
                          return (
                            <Badge key={mid} variant="secondary">
                              {m?.name ?? mid}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.manager_ids.length}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

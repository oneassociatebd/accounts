import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, toggleUserActive, listAreas, getMe, deleteUser } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Eye, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/users/")({
  head: () => ({
    meta: [{ title: "One | Users" }],
  }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const fetchAreas = useServerFn(listAreas);
  const toggleFn = useServerFn(toggleUserActive);
  const deleteFn = useServerFn(deleteUser);
  const fetchMe = useServerFn(getMe);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
    enabled: me?.role === "admin",
  });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreas() });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u: any) => {
      if (q && !`${u.name} ${u.username} ${u.email} ${u.mobile ?? ""}`.toLowerCase().includes(q)) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (areaFilter !== "all") {
        const ids = (u.areas ?? []).map((a: any) => a.id);
        if (!ids.includes(areaFilter) && u.area_id !== areaFilter) return false;
      }
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, areaFilter, statusFilter]);

  const handleToggle = async (id: string, value: boolean) => {
    try {
      await toggleFn({ data: { id, is_active: value } });
      toast.success(value ? "User enabled" : "User disabled");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { id: deleteTarget.id } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  if (me && me.role !== "admin") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You don't have permission to access user management.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage system users and access</p>
        </div>
        <Button asChild>
          <Link to="/users/new">
            <Plus className="h-4 w-4 mr-2" /> Add User
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            placeholder="Search name, mobile, email, username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
            </SelectContent>
          </Select>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {areas.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9}><TableSkeleton rows={5} cols={9} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
              ) : (
                filtered.map((u: any, i: number) => (
                  <TableRow key={u.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.mobile || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {(() => {
                        const list: any[] = u.areas && u.areas.length > 0
                          ? u.areas
                          : u.area ? [u.area] : [];
                        if (list.length === 0) return "—";
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <span className="text-xs cursor-pointer hover:underline text-primary">
                                {list.length} area{list.length > 1 ? "s" : ""} selected
                              </span>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-3">
                              <div className="text-xs font-medium mb-2">Areas:</div>
                              <ol className="list-decimal pl-5 space-y-1 text-sm">
                                {list.map((a: any) => (
                                  <li key={a.id}>
                                    {a.area_name}
                                    {a.location?.location_name && (
                                      <span className="text-muted-foreground"> ({a.location.location_name})</span>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          disabled={u.id === me?.profile?.id}
                          onCheckedChange={(v) => handleToggle(u.id, v)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.id === me?.profile?.id ? "You" : u.is_active ? "Active" : "Disabled"}
                        </span>
                      </div>

                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link to="/users/$id" params={{ id: u.id }}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={u.id === me?.profile?.id}
                          onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title={u.id === me?.profile?.id ? "Cannot delete your own account" : "Delete user"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>? This will remove the user's account, roles, and area assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

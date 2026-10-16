import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, listAreas, updateUser, resetUserPassword } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreasMultiSelect } from "@/components/areas-multi-select";
import { toast } from "sonner";
import { FormSkeleton } from "@/components/skeleton-loader";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users/$id")({
  head: () => ({
    meta: [{ title: "One | User Details" }],
  }),
  component: EditUser,
});

function EditUser() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const fetchAreas = useServerFn(listAreas);
  const update = useServerFn(updateUser);

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => fetchUsers() });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreas() });
  const user: any = users.find((u: any) => u.id === id);

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    role: "manager" as "admin" | "manager",
    area_ids: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user && hydratedUserId !== user.id) {
      const assignedAreaIds = (user.areas && user.areas.length > 0)
        ? user.areas.map((a: any) => String(a.id))
        : user.area_id
          ? [String(user.area_id)]
          : [];
      setForm({
        name: user.name ?? "",
        mobile: user.mobile ?? "",
        role: user.role,
        area_ids: assignedAreaIds,
      });
      setHydratedUserId(user.id);
    }
  }, [user, hydratedUserId]);

  if (!user) {
    return <FormSkeleton fields={4} />;
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === "manager" && form.area_ids.length === 0) {
      toast.error("At least one assigned area is required for managers.");
      return;
    }
    setBusy(true);
    try {
      await update({ data: { id, ...form } });
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
      navigate({ to: "/users" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit User</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v: "admin" | "manager") => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "manager" && (
              <div className="space-y-2">
                <Label>Assigned Areas * <span className="text-xs text-muted-foreground font-normal">(search & select)</span></Label>
                <AreasMultiSelect
                  areas={areas as any}
                  selected={form.area_ids}
                  onChange={(ids) => setForm({ ...form, area_ids: ids })}
                />
              </div>
            )}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/users" })}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <PasswordResetCard userId={id} />
    </div>
  );
}

function PasswordResetCard({ userId }: { userId: string }) {
  const resetPwd = useServerFn(resetUserPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetPwd({ data: { id: userId, password } });
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Reset Password</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              placeholder="Re-enter new password"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy || !password || !confirm}>
              {busy ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

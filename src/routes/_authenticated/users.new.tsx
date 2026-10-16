import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createUser, listAreas } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AreasMultiSelect } from "@/components/areas-multi-select";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users/new")({
  head: () => ({
    meta: [{ title: "One | Add User" }],
  }),
  component: NewUser,
});

function NewUser() {
  const navigate = useNavigate();
  const create = useServerFn(createUser);
  const fetchAreas = useServerFn(listAreas);
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => fetchAreas() });

  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    role: "manager" as "admin" | "manager",
    area_ids: [] as string[],
    is_active: true,
  });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === "manager" && form.area_ids.length === 0) {
      toast.error("At least one assigned area is required for managers.");
      return;
    }
    setBusy(true);
    try {
      const username = form.email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "_");
      await create({
        data: {
          ...form,
          username,
        },
      });
      toast.success("User created");
      navigate({ to: "/users" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add User</h1>
        <p className="text-sm text-muted-foreground">Create a new system user</p>
      </div>
      <Card>
        <CardHeader><CardTitle>User Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
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
            <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">User can sign in when active</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/users" })}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create User"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

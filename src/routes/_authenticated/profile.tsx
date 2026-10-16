import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [{ title: "One | My Profile" }],
  }),
  component: Profile,
});

function Profile() {
  const fetchMe = useServerFn(getMe);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const p = data?.profile;
  if (!p) return <FormSkeleton fields={6} />;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">My Profile</h1>
      <Card>
        <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Row label="Username" value={p.username} />
          <Row label="Email" value={p.email} />
          <Row label="Mobile" value={p.mobile || "—"} />
          <Row label="Role"><Badge className="capitalize">{data?.role}</Badge></Row>
          <Row label="Area" value={p.area?.area_name ? `${p.area.area_name} (${p.area.location?.location_name})` : "—"} />
          <Row label="Status">
            <Badge variant={p.is_active ? "default" : "destructive"}>{p.is_active ? "Active" : "Disabled"}</Badge>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children ?? value}</span>
    </div>
  );
}

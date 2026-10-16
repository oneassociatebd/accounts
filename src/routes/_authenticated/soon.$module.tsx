import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/soon/$module")({
  head: () => ({
    meta: [{ title: "One | Coming Soon" }],
  }),
  component: ComingSoon,
});

function ComingSoon() {
  const { module } = Route.useParams();
  const label = module.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  return (
    <Card>
      <CardContent className="p-12 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Construction className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">{label}</h2>
        <p className="text-sm text-muted-foreground">
          This module will be built in the next step. The foundation (auth, users, roles, locations, areas) is ready.
        </p>
      </CardContent>
    </Card>
  );
}

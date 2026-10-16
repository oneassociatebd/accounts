import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/erp.functions";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { ColorfulSpinner } from "@/components/ui/spinner";
import { ActiveUsersBadge } from "@/components/active-users-badge";
import { SmsBalanceBadge } from "@/components/sms-balance-badge";
import { useHeartbeat } from "@/hooks/use-heartbeat";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, role } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);

  const { data: me } = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: () => fetchMe(),
    enabled: !!session,
  });

  useHeartbeat(!!session);


  useEffect(() => {
    if (me?.profile && !me.profile.is_active) {
      supabase.auth.signOut().then(() => navigate({ to: "/login" }));
    }
  }, [me, navigate]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (!session || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <ColorfulSpinner size="lg" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full min-w-0 bg-muted/30">
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col h-screen">
          <header className="sticky top-0 z-30 shrink-0 h-14 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <h1 className="text-sm font-medium text-muted-foreground">
                Billing & Client Management System
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {role === "admin" && <SmsBalanceBadge />}
              {(role === "admin" || role === "manager") && <ActiveUsersBadge />}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>

  );
}

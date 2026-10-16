import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { getActiveUsers } from "@/lib/activity.functions";

export function pathLabel(path: string | null): string {
  if (!path) return "—";
  const p = path.split("?")[0].replace(/\/$/, "") || "/";
  const map: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/bills": "Bills",
    "/bills/new": "New Bill",
    "/bills/drafts": "Bill Drafts",
    "/collections": "Collections",
    "/collections/new": "New Collection",
    "/customers": "Customers",
    "/customers/new": "New Customer",
    "/ledger/customer": "Customer Ledger",
    "/ledger/statement": "Ledger Statement",
    "/reports/billing": "Billing Report",
    "/reports/collection": "Collection Report",
    "/reports/customer": "Customer Report",
    "/reports/due": "Due Report",
    "/reports/missing-bills": "Missing Bills Report",
    "/profile": "Profile",
    "/roles": "Roles",
    "/users": "Users",
    "/users/new": "New User",
    "/settings/company": "Company Settings",
    "/settings/invoice": "Invoice Settings",
    "/settings/system": "System Settings",
    "/settings/system-info": "System Info",
    "/master/areas": "Areas",
    "/master/customer-types": "Customer Types",
    "/master/locations": "Locations",
    "/master/references": "References",
    "/master/service-items": "Service Items",
    "/master/service-rates": "Service Rates",
  };
  if (map[p]) return map[p];
  if (p.startsWith("/bills/")) return "Bill Details";
  if (p.startsWith("/collections/")) return "Collection Details";
  if (p.startsWith("/customers/")) return "Customer Details";
  if (p.startsWith("/users/")) return "User Details";
  if (p.startsWith("/master/")) return "Master";
  if (p.startsWith("/reports/")) return "Report";
  if (p.startsWith("/settings/")) return "Settings";
  return p;
}

export function ActiveUsersBadge() {
  const fetchActive = useServerFn(getActiveUsers);
  const { data } = useQuery({
    queryKey: ["active-users"],
    queryFn: () => fetchActive(),
    refetchInterval: 30_000,
  });
  const onlineCount = data?.onlineCount ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const users = data?.users ?? [];
  const onlineWin = data?.online_window_minutes ?? 30;
  const activeWin = data?.active_window_minutes ?? 5;

  const relTime = (iso: string | null) => {
    if (!iso) return "—";
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  const isActive = (u: { last_interaction_at: string | null }) =>
    u.last_interaction_at &&
    new Date(u.last_interaction_at).getTime() >= Date.now() - activeWin * 60 * 1000;

  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 shadow-sm hover:shadow-md transition-all cursor-default"
          aria-label="Active users"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <UserCheck className="h-4 w-4" />
          <span className="tabular-nums font-semibold">{onlineCount}</span>
          <span className="text-xs text-muted-foreground">Online</span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="tabular-nums font-semibold text-amber-600 dark:text-amber-400">{activeCount}</span>
          <span className="text-xs text-muted-foreground">Active</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-96 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <div className="text-sm font-semibold">
            {onlineCount} Online / {activeCount} Active
          </div>
          <div className="text-[11px] text-muted-foreground">
            Online = last {onlineWin} min heartbeat · Active = worked in last {activeWin} min
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {users.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No users online right now
            </div>
          ) : (
            <ul className="space-y-1">
              {users.map((u) => {
                const userActive = isActive(u);
                return (
                  <li
                    key={u.id}
                    className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 animate-pulse ${
                            userActive ? "bg-emerald-500" : "bg-amber-400"
                          }`}
                        />
                        <span className="truncate text-sm font-medium">{u.name}</span>
                        {u.role && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] capitalize">
                            {u.role}
                          </Badge>
                        )}
                        {!userActive && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                            idle
                          </Badge>
                        )}
                      </div>
                      {u.email && (
                        <div className="truncate pl-3 text-[10px] text-muted-foreground">
                          {u.email}
                        </div>
                      )}
                      <div className="pl-3 text-[11px] text-emerald-700 dark:text-emerald-300">
                        📍 {pathLabel(u.last_path)}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                      {relTime(u.last_interaction_at || u.last_seen_at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

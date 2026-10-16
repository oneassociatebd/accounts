import { useState, useEffect, useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users as UsersIcon,
  Receipt,
  Wallet,
  BookOpen,
  BarChart3,
  Share2,
  Settings as SettingsIcon,
  ShieldCheck,
  Building2,
  ChevronRight,
  LogOut,
  User,
  FileCheck,
  Banknote,

} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

type MenuItem = { title: string; url: string };
type MenuGroup = { title: string; icon: typeof UsersIcon; url?: string; items?: MenuItem[] };

const adminMenu: MenuGroup[] = [
  {
    title: "Customers",
    icon: UsersIcon,
    items: [
      { title: "Add Customer", url: "/customers/new" },
      { title: "Customer List", url: "/customers" },
      { title: "Assignments", url: "/assignments" },
      { title: "Customer Reports", url: "/reports/customer" },
      { title: "Disabled Customers", url: "/soon/customers-disabled" },
    ],
  },
  {
    title: "Mushak 4.3 Submission",
    icon: FileCheck,
    items: [
      { title: "New Submission", url: "/mushak/new" },
      { title: "Draft Submissions", url: "/mushak/drafts" },
      { title: "Finalised Submissions", url: "/mushak/finalized" },
      { title: "Reports", url: "/mushak/reports" },
    ],
  },
  {
    title: "VAT Return Submission",
    icon: FileCheck,
    items: [
      { title: "New Submission", url: "/vat/new" },
      { title: "Draft Submissions", url: "/vat/drafts" },
      { title: "Finalized Submissions", url: "/vat/finalized" },
      { title: "Return Report", url: "/vat/reports" },
      { title: "SMS Logs", url: "/vat/sms-logs" },
      { title: "Audit Logs", url: "/vat/audit-logs" },
    ],
  },
  {
    title: "Billing",
    icon: Receipt,
    items: [
      { title: "New Bill", url: "/bills/new" },
      { title: "Bill List", url: "/bills" },
      { title: "Draft Bills", url: "/bills/drafts" },
      { title: "Monthly Bills", url: "/soon/bills-monthly" },
      { title: "Billing Reports", url: "/reports/billing" },
      { title: "Missing Bills", url: "/reports/missing-bills" },
    ],
  },
  {
    title: "Collections",
    icon: Wallet,
    items: [
      { title: "New Collection", url: "/collections/new" },
      { title: "Collection List", url: "/collections" },
      { title: "Collection Reports", url: "/reports/collection" },
      { title: "Due Reports", url: "/reports/due" },
    ],
  },

  {
    title: "Finance",
    icon: BookOpen,
    items: [
      { title: "Accounts Overview", url: "/balance-sheet" },
      { title: "Company Ledger", url: "/finance/company-ledger" },
      { title: "Customer Ledger", url: "/ledger/customer" },
      { title: "Customer Statement", url: "/ledger/statement" },
      { title: "bKash Payments", url: "/finance/bkash-payments" },
    ],
  },
  {
    title: "Users & Roles",
    icon: ShieldCheck,
    items: [
      { title: "Users", url: "/users" },
      { title: "Roles & Permissions", url: "/roles" },
    ],
  },
  {
    title: "Payroll",
    icon: Banknote,
    url: "/payroll",
  },

  {
    title: "Settings",
    icon: SettingsIcon,
    items: [
      { title: "Customer Types", url: "/master/customer-types" },
      { title: "Locations", url: "/master/locations" },
      { title: "Areas", url: "/master/areas" },
      { title: "References", url: "/master/references" },
      { title: "Mushak 4.3 Items", url: "/master/mushak-items" },
      { title: "Service Items", url: "/master/service-items" },
      { title: "Service Rates", url: "/master/service-rates" },
      { title: "Company Settings", url: "/settings/company" },
      { title: "Invoice Settings", url: "/settings/invoice" },
      { title: "SMS Templates", url: "/settings/sms-templates" },
      { title: "System Settings", url: "/settings/system" },
      { title: "System Info", url: "/settings/system-info" },
    ],
  },
];

const managerMenu: MenuGroup[] = [
  {
    title: "Customers",
    icon: UsersIcon,
    items: [
      { title: "Add Customer", url: "/customers/new" },
      { title: "Customer List", url: "/customers" },
      { title: "Customer Reports", url: "/reports/customer" },
    ],
  },
  {
    title: "Mushak 4.3 Submission",
    icon: FileCheck,
    items: [
      { title: "New Submission", url: "/mushak/new" },
      { title: "Draft Submissions", url: "/mushak/drafts" },
      { title: "Finalised Submissions", url: "/mushak/finalized" },
      { title: "Reports", url: "/mushak/reports" },
    ],
  },
  {
    title: "VAT Return Submission",
    icon: FileCheck,
    items: [
      { title: "New Submission", url: "/vat/new" },
      { title: "Draft Submissions", url: "/vat/drafts" },
      { title: "Finalized Submissions", url: "/vat/finalized" },
      { title: "Return Report", url: "/vat/reports" },
      { title: "SMS Logs", url: "/vat/sms-logs" },
      { title: "Audit Logs", url: "/vat/audit-logs" },
    ],
  },
  {
    title: "Billing",
    icon: Receipt,
    items: [
      { title: "New Bill", url: "/bills/new" },
      { title: "Bill List", url: "/bills" },
      { title: "Draft Bills", url: "/bills/drafts" },
      { title: "Missing Bills", url: "/reports/missing-bills" },
    ],
  },
  {
    title: "Collections",
    icon: Wallet,
    items: [
      { title: "New Collection", url: "/collections/new" },
      { title: "Due Reports", url: "/reports/due" },
    ],
  },
  {
    title: "Payroll",
    icon: Banknote,
    url: "/payroll",
  },
];


export function AppSidebar() {
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { role, signOut, can } = useAuth();
  const rawMenu = role === "admin" ? adminMenu : managerMenu;
  const menu: MenuGroup[] = useMemo(() => {
    const permMap: Record<string, string | string[]> = {
      "/bills/new": "bills.create",
      "/bills": "bills.view_list",
      "/bills/drafts": "bills.view_drafts",
      "/reports/missing-bills": "bills.view_missing",
      "/collections/new": "collections.create",
      "/reports/due": "collections.view_due",
      "/payroll": ["payroll.view_earnings", "payroll.view_payouts"],
    };
    const allowed = (key: string | string[] | undefined) => {
      if (!key) return true;
      if (Array.isArray(key)) return key.some((k) => can(k));
      return can(key);
    };
    return rawMenu
      .map((group): MenuGroup => {
        if (!group.items) return group;
        const items = group.items.filter((i) => allowed(permMap[i.url]));
        return { ...group, items };
      })
      .filter((g) => {
        if (g.items) return g.items.length > 0;
        return allowed(permMap[g.url ?? ""]);
      });
  }, [rawMenu, can]);





  const expandSidebar = () => {
    if (isMobile) setOpenMobile(true);
    else if (collapsed) setOpen(true);
  };

  const isActive = (url: string) => pathname === url.split("?")[0];

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const activeGroup = menu.find((group) => group.items?.some((i) => isActive(i.url)));
    return activeGroup ? activeGroup.title : null;
  });

  // Sync openGroup when pathname changes (for direct navigation or back/forward)
  useEffect(() => {
    const activeGroup = menu.find((group) => group.items?.some((i) => isActive(i.url)));
    if (activeGroup) {
      setOpenGroup(activeGroup.title);
    }
  }, [pathname, menu]);

  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=sidebar]]:!bg-background/95 [&_[data-sidebar=sidebar]]:backdrop-blur [&_[data-sidebar=sidebar]]:supports-[backdrop-filter]:!bg-background/75"
    >
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">One Associate</span>
              <span className="text-xs text-muted-foreground capitalize">{role ?? "user"}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>


        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/dashboard")}>
                  <Link
                    to="/dashboard"
                    activeOptions={{ exact: true }}
                    activeProps={{ "data-active": "true" } as any}
                    inactiveProps={{ "data-active": "false" } as any}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {menu.map((group) => {
                // Single-link group (no children) — render as a flat menu item.
                if (!group.items || group.items.length === 0) {
                  const url = group.url ?? "#";
                  return (
                    <SidebarMenuItem key={group.title}>
                      <SidebarMenuButton asChild isActive={isActive(url)}>
                        <Link
                          to={url}
                          activeOptions={{ exact: true }}
                          activeProps={{ "data-active": "true" } as any}
                          inactiveProps={{ "data-active": "false" } as any}
                        >
                          <group.icon className="h-4 w-4" />
                          <span>{group.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const isOpen = openGroup === group.title;
                return (
                  <Collapsible
                    key={group.title}
                    open={isOpen && !collapsed}
                    onOpenChange={(open) => {
                      if (collapsed) {
                        expandSidebar();
                        setOpenGroup(group.title);
                        return;
                      }
                      setOpenGroup(open ? group.title : null);
                    }}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          onClick={() => {
                            if (collapsed) {
                              expandSidebar();
                              setOpenGroup(group.title);
                            }
                          }}
                        >
                          <group.icon className="h-4 w-4" />
                          <span>{group.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.title}>
                              <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                                <Link
                                  to={item.url}
                                  activeOptions={{ exact: true }}
                                  activeProps={{ "data-active": "true" } as any}
                                  inactiveProps={{ "data-active": "false" } as any}
                                >
                                  {item.title}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}

                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/profile")}>
                  <Link
                    to="/profile"
                    activeOptions={{ exact: true }}
                    activeProps={{ "data-active": "true" } as any}
                    inactiveProps={{ "data-active": "false" } as any}
                  >
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Users, Building2, Wallet, TrendingUp, TrendingDown, Receipt, BadgePercent, Lock, ArrowRight, ChevronLeft, ChevronRight, UserCheck, Percent,
  User, CheckCircle2, UserX, UserPlus, UserMinus, BarChart3, FileText, Award, Target, CalendarCheck, Ban, Clock, ShieldCheck, LogOut,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line, LabelList,
  ComposedChart, Area,
} from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDashboardStats, closeYear, getDashboardUserCounts } from "@/lib/dashboard.functions";
import { getPayrollSummary, getManagerPayrollBreakdown } from "@/lib/payroll.functions";
import { getBalanceSheetData, getLoans } from "@/lib/balance-sheet.functions";
import { MonthPicker } from "@/components/month-picker";
import { HandCoins, Coins, Banknote, Landmark } from "lucide-react";
import { getVatDashboardStats, getVatFilingSummary } from "@/lib/vat.functions";
import { getMushakDashboardStats } from "@/lib/mushak.functions";
import { Link } from "@tanstack/react-router";
import { FileCheck, FileEdit, MessageSquare, MessageSquareX, Calendar, Star, ClipboardList, AlertCircle } from "lucide-react";
import { getActiveUsers } from "@/lib/activity.functions";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { ActiveUsersBadge } from "@/components/active-users-badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "One | Dashboard" }] }),
  component: Dashboard,
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLOR = {
  collection: "hsl(142 71% 45%)", // green
  due: "hsl(0 84% 60%)",          // red
  bill: "hsl(262 83% 58%)",       // purple
  discount: "hsl(38 92% 50%)",    // amber
};

function StatCard({
  label, value, icon: Icon, tone, intensity = 0.6,
}: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "danger" | "info" | "warn" | "white" | "whiteDanger";
  /** 0..1 — proportionally scales gradient richness based on metric magnitude */
  intensity?: number;
}) {
  const palette = {
    default: { from: "100 116 139", via: "148 163 184", to: "203 213 225", text: "text-foreground", iconGrad: "from-slate-500 to-slate-400", bar: null as null | string },
    success: { from: "20 184 166", via: "16 185 129", to: "34 197 94", text: "text-emerald-700 dark:text-emerald-300", iconGrad: "from-teal-500 via-emerald-500 to-green-500", bar: null },
    danger: { from: "244 63 94", via: "239 68 68", to: "249 115 22", text: "text-rose-700 dark:text-rose-300", iconGrad: "from-rose-500 via-red-500 to-orange-500", bar: null },
    info: { from: "99 102 241", via: "139 92 246", to: "168 85 247", text: "text-indigo-700 dark:text-indigo-300", iconGrad: "from-indigo-500 via-violet-500 to-purple-500", bar: null },
    warn: { from: "245 158 11", via: "249 115 22", to: "234 179 8", text: "text-amber-700 dark:text-amber-300", iconGrad: "from-amber-500 via-orange-500 to-yellow-500", bar: null },
    white: { from: "255 255 255", via: "248 250 252", to: "241 245 249", text: "text-foreground", iconGrad: "from-slate-300 to-slate-200", bar: null },
    whiteDanger: { from: "255 255 255", via: "248 250 252", to: "241 245 249", text: "text-rose-600 dark:text-rose-400", iconGrad: "from-rose-500 via-red-500 to-orange-500", bar: "244 63 94" },
  }[tone ?? "default"];

  const t = Math.max(0.18, Math.min(1, intensity));
  const a1 = (0.10 + t * 0.32).toFixed(3);
  const a2 = (0.06 + t * 0.24).toFixed(3);
  const a3 = (0.02 + t * 0.14).toFixed(3);
  const blobOpacity = (0.18 + t * 0.45).toFixed(3);
  const ringGlow = `0 8px 28px -10px rgb(${palette.from} / ${(0.18 + t * 0.35).toFixed(3)})`;

  return (
    <Card
      className="relative overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-xl"
      style={{ boxShadow: ringGlow }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(135deg, rgb(${palette.from} / ${a1}) 0%, rgb(${palette.via} / ${a2}) 55%, rgb(${palette.to} / ${a3}) 100%)` }}
      />
      <div
        className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle at 30% 30%, rgb(${palette.from} / 0.9), rgb(${palette.to} / 0.4) 60%, transparent 75%)`,
          opacity: blobOpacity,
        }}
      />
      <div
        className="pointer-events-none absolute left-0 top-0 h-full w-1"
        style={{
          background: `linear-gradient(180deg, rgb(${palette.from}) 0%, rgb(${palette.via}) 50%, rgb(${palette.to}) 100%)`,
          opacity: (0.5 + t * 0.5).toFixed(3),
        }}
      />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${palette.iconGrad} text-white shadow-lg shadow-black/10 ring-1 ring-white/20`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className={`text-lg font-bold tracking-tight ${palette.text}`}>{value}</div>
        <div className="mt-2 h-1 w-full rounded-full bg-foreground/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round(t * 100)}%`,
              background: palette.bar
                ? `linear-gradient(90deg, rgb(${palette.bar}), rgb(${palette.bar}))`
                : `linear-gradient(90deg, rgb(${palette.from}), rgb(${palette.via}), rgb(${palette.to}))`,
              boxShadow: `0 0 10px rgb(${palette.bar ?? palette.from} / 0.6)`,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function GroupStatCard({
  title, icon: Icon, items, accent = "violet",
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { label: string; value: string | number; tone: "info" | "success" | "danger" }[];
  accent?: "violet" | "sky";
}) {
  const toneStyles = {
    info: {
      text: "text-violet-700 dark:text-violet-300",
      dot: "bg-violet-500",
      chip: "bg-violet-500/10 ring-violet-500/20",
    },
    success: {
      text: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
      chip: "bg-emerald-500/10 ring-emerald-500/20",
    },
    danger: {
      text: "text-rose-700 dark:text-rose-300",
      dot: "bg-rose-500",
      chip: "bg-rose-500/10 ring-rose-500/20",
    },
  };
  const accentBg = accent === "violet"
    ? "from-indigo-500/20 via-purple-500/10 to-pink-500/5"
    : "from-teal-500/20 via-emerald-500/10 to-lime-500/5";
  const iconBg = accent === "violet"
    ? "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/40 ring-1 ring-white/20"
    : "bg-gradient-to-br from-teal-500 via-emerald-500 to-lime-500 text-white shadow-lg shadow-emerald-500/40 ring-1 ring-white/20";
  const accentBorder = accent === "violet"
    ? "before:bg-gradient-to-b before:from-indigo-500 before:via-purple-500 before:to-pink-500"
    : "before:bg-gradient-to-b before:from-teal-500 before:via-emerald-500 before:to-lime-500";
  const [hero, ...rest] = items;
  const heroTone = toneStyles[hero.tone];

  return (
    <Card className={`group relative overflow-hidden border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accentBorder}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentBg}`} />
      <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${accentBg} blur-3xl opacity-80`} />
      <div className={`pointer-events-none absolute -left-20 -bottom-20 h-44 w-44 rounded-full bg-gradient-to-tr ${accentBg} blur-3xl opacity-60`} />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
          <p className="text-[11px] text-muted-foreground">Overview & monthly activity</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg} transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="flex items-end justify-between gap-3 rounded-xl border border-border/40 bg-background/60 px-4 py-3 backdrop-blur">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">{hero.label}</div>
            <div className={`mt-0.5 text-xl font-bold tracking-tight ${heroTone.text}`}>{hero.value}</div>
          </div>
          <div className={`flex h-2 w-2 rounded-full ${heroTone.dot} animate-pulse`} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rest.map((it) => {
            const s = toneStyles[it.tone];
            return (
              <div
                key={it.label}
                className={`rounded-lg px-2.5 py-2 ring-1 ${s.chip} backdrop-blur transition-transform hover:scale-[1.03]`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  <div className="text-[9px] font-semibold tracking-wider text-muted-foreground leading-tight">
                    {it.label}
                  </div>
                </div>
                <div className={`mt-1 text-sm font-bold tracking-tight ${s.text}`}>{it.value}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

function MonthCalendarPicker({
  value, onChange, monthNames,
}: { value: string; onChange: (v: string) => void; monthNames: string[] }) {
  const parse = (s: string) => {
    const [m, y] = s.split(" ");
    const mi = monthNames.indexOf(m);
    return { month: mi >= 0 ? mi : new Date().getMonth(), year: Number(y) || new Date().getFullYear() };
  };
  const current = parse(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState<number>(current.year);
  const [open, setOpen] = useState(false);

  const handleSelect = (monthIdx: number) => {
    onChange(`${monthNames[monthIdx]} ${viewYear}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setViewYear(current.year); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex h-12 items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-4 pr-3 shadow-[0_6px_18px_-6px_rgba(15,23,42,0.12)] hover:shadow-[0_10px_24px_-8px_rgba(15,23,42,0.18)] transition-all"
        >
          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={2.4} />
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{value}</span>
          <ChevronRight className="h-4 w-4 rotate-90 text-blue-600 dark:text-blue-400 transition-transform group-data-[state=open]:-rotate-90" strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 pointer-events-auto" align="end">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold">{viewYear}</div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 w-[240px]">
          {monthNames.map((m, idx) => {
            const isSelected = current.month === idx && current.year === viewYear;
            const isCurrent = today.getMonth() === idx && today.getFullYear() === viewYear;
            const isFuture = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && idx > today.getMonth());
            return (
              <button
                key={m}
                type="button"
                disabled={isFuture}
                onClick={() => handleSelect(idx)}
                className={cn(
                  "h-9 rounded-md text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow"
                    : isCurrent
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  isFuture && "opacity-40 cursor-not-allowed hover:bg-transparent",
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MushakSummarySection() {
  const fetchFn = useServerFn(getMushakDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["mushak-dashboard"],
    queryFn: () => fetchFn({ data: {} }),
  });
  const v: any = data || {};
  const cards = [
    { label: "Total Draft", value: Number(v.draft ?? 0), Icon: FileEdit, color: "from-violet-400 to-purple-500", text: "text-violet-700 dark:text-violet-300", bg: "from-violet-50 to-fuchsia-50 dark:from-violet-950/40 dark:to-fuchsia-950/40" },
    { label: "Total Finalised", value: Number(v.finalized ?? 0), Icon: CheckCircle2, color: "from-green-400 to-emerald-500", text: "text-green-700 dark:text-green-300", bg: "from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40" },
    { label: "This Month", value: Number(v.monthSubs ?? 0), Icon: Calendar, color: "from-cyan-400 to-teal-500", text: "text-teal-700 dark:text-teal-300", bg: "from-cyan-50 to-teal-50 dark:from-cyan-950/40 dark:to-teal-950/40" },
    { label: "Today's Submission", value: Number(v.todaySubs ?? 0), Icon: CalendarCheck, color: "from-amber-400 to-orange-500", text: "text-amber-700 dark:text-amber-300", bg: "from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40" },
  ];

  return (
    <section className="space-y-4 bg-[#f8fbff] dark:bg-slate-950 rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 text-white font-extrabold text-[12px] tracking-wide shadow-[0_12px_28px_-8px_rgba(244,63,94,0.55)]">
            <span className="relative z-10">M4.3</span>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">Mushak 4.3 Submission</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Summary of value declarations (BOE / Item) filed</p>
          </div>
        </div>
        <Link to="/mushak/finalized" className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline">View All →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border bg-gradient-to-br ${c.bg} p-4 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{c.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{isLoading ? "—" : fmt(c.value)}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-white shadow-md`}>
                <c.Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}



function VatReturnSection() {
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const defaultPeriod = (() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  })();
  const [period, setPeriod] = useState<string>(defaultPeriod);

  const fetchVat = useServerFn(getVatDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["vat-dashboard", period],
    queryFn: () => fetchVat({ data: { tax_period: period } }),
  });
  const v: any = data;

  const totalClients = Number(v?.totalClients ?? 0);
  const drafts = Number(v?.monthDrafts ?? 0);
  const todayFinal = Number(v?.todayFinal ?? 0);
  const monthFinal = Number(v?.monthFinal ?? 0);
  const nonFiler = Math.max(0, totalClients - monthFinal);
  const completion = totalClients > 0 ? (monthFinal / totalClients) * 100 : 0;

  const prevMonthDrafts = Number(v?.prevMonthDrafts ?? 0);
  const prevMonthFinal = Number(v?.prevMonthFinal ?? 0);
  const yesterdayFinal = Number(v?.yesterdayFinal ?? 0);
  const prevNonFiler = Number(v?.prevNonFilers ?? 0);

  const pctChange = (curr: number, prev: number): { trend: string; trendUp: boolean } => {
    if (prev === 0) {
      if (curr === 0) return { trend: "No change", trendUp: true };
      return { trend: "New this period", trendUp: true };
    }
    const diff = ((curr - prev) / prev) * 100;
    const up = diff >= 0;
    return { trend: `${Math.abs(Math.round(diff))}% ${up ? "up" : "down"} from last`, trendUp: up };
  };
  const draftsTrend = pctChange(drafts, prevMonthDrafts);
  const todayTrend = pctChange(todayFinal, yesterdayFinal);
  const monthTrend = pctChange(monthFinal, prevMonthFinal);
  const nonFilerTrend = (() => {
    const t = pctChange(nonFiler, prevNonFiler);
    // For non-filer, an increase is bad
    return { trend: t.trend, trendUp: !t.trendUp };
  })();

  const MONTH_TARGET = totalClients;
  const achievement = MONTH_TARGET > 0 ? Math.min(100, (monthFinal / MONTH_TARGET) * 100) : 0;

  const topManagers: Array<{ name: string; count: number }> = Array.isArray(v?.topManagers) ? v.topManagers : [];
  const recent: any[] = Array.isArray(v?.recent) ? v.recent : [];

  // Pretty period label e.g. "May 2026"
  const prettyPeriod = (() => {
    const [m, y] = period.split(" ");
    const idx = MONTH_NAMES.indexOf(m);
    return idx >= 0 ? `${FULL_MONTHS[idx]} ${y}` : period;
  })();

  // KPI configurations — icon-left layout with footer trend bar (matches reference)
  const kpis: Array<{
    label: string;
    value: string | number;
    sub: string;
    Icon: any;
    DecorIcon?: any;          // optional decorative bg icon (defaults to Icon)
    iconGradient: string;     // circular icon bg gradient
    iconShadow: string;       // soft colored shadow under icon
    cardBg: string;           // pastel card gradient
    labelColor: string;       // uppercase label color
    footerBg: string;         // bottom trend bar bg
    footerText: string;       // bottom trend text color
    trend: string;            // e.g. "8% from last month"
    trendUp: boolean;
  }> = [
    {
      label: "Drafts", value: drafts, sub: "This month", Icon: FileText,
      iconGradient: "from-violet-400 to-purple-500",
      iconShadow: "shadow-[0_8px_20px_-6px_rgba(139,92,246,0.40)]",
      cardBg: "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-violet-950/40 dark:via-slate-950 dark:to-fuchsia-950/40",
      labelColor: "text-violet-700 dark:text-violet-300",
      footerBg: "bg-violet-50/80 dark:bg-violet-950/40 border-t border-violet-100/80 dark:border-violet-900/40",
      footerText: "text-violet-700 dark:text-violet-300",
      trend: draftsTrend.trend, trendUp: draftsTrend.trendUp,
    },
    {
      label: "Finalized", value: todayFinal, sub: "Today", Icon: CalendarCheck, DecorIcon: CalendarCheck,
      iconGradient: "from-cyan-300 to-teal-400",
      iconShadow: "shadow-[0_8px_20px_-6px_rgba(20,184,166,0.40)]",
      cardBg: "bg-gradient-to-br from-cyan-50 via-white to-teal-50 dark:from-cyan-950/40 dark:via-slate-950 dark:to-teal-950/40",
      labelColor: "text-teal-700 dark:text-teal-300",
      footerBg: "bg-teal-50/80 dark:bg-teal-950/40 border-t border-teal-100/80 dark:border-teal-900/40",
      footerText: "text-teal-700 dark:text-teal-300",
      trend: todayTrend.trend, trendUp: todayTrend.trendUp,
    },
    {
      label: "Finalized", value: monthFinal, sub: "This month", Icon: Award, DecorIcon: BarChart3,
      iconGradient: "from-green-400 to-emerald-500",
      iconShadow: "shadow-[0_8px_20px_-6px_rgba(34,197,94,0.40)]",
      cardBg: "bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-green-950/40 dark:via-slate-950 dark:to-emerald-950/40",
      labelColor: "text-green-700 dark:text-green-300",
      footerBg: "bg-green-50/80 dark:bg-green-950/40 border-t border-green-100/80 dark:border-green-900/40",
      footerText: "text-green-700 dark:text-green-300",
      trend: monthTrend.trend, trendUp: monthTrend.trendUp,
    },
    {
      label: "Non-Filer", value: nonFiler, sub: "Not submitted yet", Icon: UserX,
      iconGradient: "from-rose-400 to-red-500",
      iconShadow: "shadow-[0_8px_20px_-6px_rgba(244,63,94,0.40)]",
      cardBg: "bg-gradient-to-br from-rose-50 via-white to-red-50 dark:from-rose-950/40 dark:via-slate-950 dark:to-red-950/40",
      labelColor: "text-rose-700 dark:text-rose-300",
      footerBg: "bg-rose-50/80 dark:bg-rose-950/40 border-t border-rose-100/80 dark:border-rose-900/40",
      footerText: "text-rose-700 dark:text-rose-300",
      trend: nonFilerTrend.trend, trendUp: nonFilerTrend.trendUp,
    },
  ];

  // Circular progress geometry
  const R = 58, C = 2 * Math.PI * R;
  const compLen = (completion / 100) * C;

  return (
    <section className="space-y-4 bg-[#f8fbff] dark:bg-slate-950 rounded-2xl p-4 sm:p-6">
      {/* Header — flat on bg, large gradient VAT tile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white font-extrabold text-[13px] tracking-wide shadow-[0_12px_28px_-8px_rgba(124,58,237,0.55)]">
            <span className="relative z-10">VAT</span>
            <span className="absolute top-1 right-1 h-2 w-2 rounded-sm bg-white/40" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">VAT Return Submission</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Overview of VAT return submission activities</p>
          </div>
        </div>
        <MonthCalendarPicker value={period} onChange={setPeriod} monthNames={MONTH_NAMES} />
      </div>

      {/* KPI Row — minimal cards with left accent bar, number-first hierarchy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const TrendIcon = k.trendUp ? TrendingUp : TrendingDown;
          return (
            <div
              key={k.label}
              className="group relative overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(15,23,42,0.18)] h-[104px] flex"
            >
              {/* left accent bar */}
              <div className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b", k.iconGradient)} />

              <div className="pl-5 pr-4 py-3 flex flex-col justify-between flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-[11px] font-semibold uppercase tracking-wider truncate", k.labelColor)}>
                    {k.label}
                  </span>
                  <k.Icon className={cn("h-3.5 w-3.5 opacity-70 shrink-0", k.labelColor)} strokeWidth={2.2} />
                </div>

                <h3 className="text-2xl font-extrabold tabular-nums leading-none text-slate-900 dark:text-slate-100">
                  {isLoading ? "…" : (typeof k.value === "number" ? fmt(k.value) : k.value)}
                </h3>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{k.sub}</p>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0",
                    k.trendUp
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
                  )}>
                    <TrendIcon className="h-3 w-3" strokeWidth={2.5} />
                    {k.trend.split(" ")[0]}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>


      {/* Combined — Completion + Today's Achievement */}
      <div className="group relative overflow-hidden rounded-3xl p-4 border border-emerald-100/80 dark:border-emerald-900/40 shadow-[0_12px_40px_-12px_rgba(16,185,129,0.20)] bg-gradient-to-br from-white via-emerald-50/30 to-amber-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/30 transition-all duration-500 hover:shadow-[0_18px_50px_-12px_rgba(249,115,22,0.28)]">
        {/* radial glows */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-500/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-500/10" />
        {/* dot grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '14px 14px', color: '#059669' }} />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* LEFT — Completion */}
          <div className="flex items-center gap-4 min-w-0">
            {/* Circular progress */}
            <div className="relative h-[120px] w-[120px] shrink-0">
              <div aria-hidden className="absolute inset-2 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-[inset_0_2px_6px_rgba(15,23,42,0.06)]" />
              <svg viewBox="0 0 140 140" className="relative h-full w-full -rotate-90 drop-shadow-[0_4px_10px_rgba(16,185,129,0.25)]">
                <circle cx="70" cy="70" r={R} fill="none" stroke="#E5E7EB" strokeWidth="10" className="dark:stroke-slate-800" />
                {completion > 0 && (
                  <circle
                    cx="70" cy="70" r={R} fill="none" stroke="url(#grad-comp-ring)" strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={`${compLen} ${C - compLen}`}
                    className="transition-all duration-1000"
                  />
                )}
                <defs>
                  <linearGradient id="grad-comp-ring" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#84cc16" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <strong className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{completion.toFixed(2)}%</strong>
                <small className="mt-1 block text-[9px] font-bold tracking-[0.12em] text-slate-500">Completion</small>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Overall submission for this month.</p>

              {/* Progress bar with floating tooltip */}
              <div className="relative mt-6 mb-3">
                <div
                  className="absolute -top-9 -translate-x-1/2 transition-all duration-1000 z-10"
                  style={{ left: `${Math.min(100, Math.max(0, completion))}%` }}
                >
                  <div className="relative rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-emerald-500/40 tabular-nums ring-2 ring-white dark:ring-slate-900">
                    {completion.toFixed(2)}%
                    <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px h-0 w-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-green-600" />
                  </div>
                </div>
                <div className="relative h-3 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden ring-1 ring-inset ring-slate-300/40 dark:ring-slate-700/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-green-500 to-lime-500 shadow-[0_2px_10px_rgba(34,197,94,0.55)] transition-all duration-1000 relative overflow-hidden"
                    style={{ width: `${Math.min(100, completion)}%` }}
                  >
                    <span aria-hidden className="absolute inset-0 bg-[linear-gradient(110deg,transparent_40%,rgba(255,255,255,0.5)_50%,transparent_60%)] bg-[length:200%_100%] animate-[shimmer_2.5s_infinite]" />
                  </div>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm border border-emerald-200/70 dark:border-emerald-800/50 px-3 py-1.5 shadow-sm">
                <Target className="h-4 w-4 text-green-600 dark:text-green-400" strokeWidth={2.5} />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">Target: <span className="font-bold">100%</span></span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div aria-hidden className="hidden lg:block h-32 w-px bg-gradient-to-b from-transparent via-slate-300/60 to-transparent dark:via-slate-700/60" />
          <div aria-hidden className="lg:hidden h-px w-full bg-gradient-to-r from-transparent via-slate-300/60 to-transparent dark:via-slate-700/60" />

          {/* RIGHT — Achievement */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">This Month's Achievement</h3>

              <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm border border-emerald-200/60 dark:border-emerald-900/40 px-2.5 py-1.5 shadow-sm">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Finalized</span>
                  <strong className="mt-0.5 block text-lg font-bold leading-none text-green-600 dark:text-green-400 tabular-nums">{fmt(monthFinal)}</strong>
                </div>
                <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm border border-orange-200/60 dark:border-orange-900/40 px-2.5 py-1.5 shadow-sm">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Target</span>
                  <strong className="mt-0.5 block text-lg font-bold leading-none text-orange-500 dark:text-orange-400 tabular-nums">{fmt(MONTH_TARGET)}</strong>
                </div>
                <div className="rounded-lg bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm border border-blue-200/60 dark:border-blue-900/40 px-2.5 py-1.5 shadow-sm">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Achievement</span>
                  <strong className="mt-0.5 block text-lg font-bold leading-none text-blue-600 dark:text-blue-400 tabular-nums">{achievement.toFixed(0)}%</strong>
                </div>
              </div>

              <div className="relative h-3 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden ring-1 ring-inset ring-slate-300/40 dark:ring-slate-700/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400 shadow-[0_2px_10px_rgba(249,115,22,0.55)] transition-all duration-1000 relative overflow-hidden"
                  style={{ width: `${Math.max(2, achievement)}%` }}
                >
                  <span aria-hidden className="absolute inset-0 bg-[linear-gradient(110deg,transparent_40%,rgba(255,255,255,0.5)_50%,transparent_60%)] bg-[length:200%_100%] animate-[shimmer_2.5s_infinite]" />
                </div>
              </div>

              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm border border-amber-200/70 dark:border-amber-800/50 px-3 py-1.5 shadow-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" strokeWidth={2} />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Keep going! You're doing great.</span>
              </div>
            </div>

            {/* Trophy with sparkles */}
            <div className="relative shrink-0 w-[90px] h-[90px] flex items-center justify-center">
              <div aria-hidden className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-200/60 via-orange-100/40 to-transparent dark:from-amber-500/20 dark:via-orange-500/10 blur-md" />
              <div aria-hidden className="absolute inset-3 rounded-full bg-white/50 dark:bg-slate-900/40 backdrop-blur-sm border border-amber-200/50 dark:border-amber-800/30" />
              <span aria-hidden className="absolute -top-1 -left-1 text-purple-400 text-xs animate-pulse">✦</span>
              <span aria-hidden className="absolute top-1 right-0 text-pink-400 text-[10px] animate-pulse [animation-delay:300ms]">✦</span>
              <span aria-hidden className="absolute bottom-2 -right-1 text-indigo-400 text-xs animate-pulse [animation-delay:600ms]">✦</span>
              <span aria-hidden className="absolute bottom-0 left-0 text-amber-400 text-[10px] animate-pulse [animation-delay:900ms]">✦</span>
              <div className="relative text-[60px] leading-none select-none drop-shadow-[0_8px_12px_rgba(245,158,11,0.5)] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">🏆</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Finalized Returns */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_6px_18px_rgba(15,23,42,0.06)] bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-sm">📄</span>
            Recent Finalized Returns
          </h3>
          <Link to="/vat/finalized" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                {["Client Name","BIN","Tax Period","Submission ID","Submission Date","Submitted By","Status",""].map((h, idx) => (
                  <th key={idx} className="text-left text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 px-3 py-3 first:pl-5 last:pr-5 last:w-10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No finalized submissions for this period yet.
                  </td>
                </tr>
              ) : recent.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.customer?.company_name || r.customer?.name || "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums font-mono">{r.customer?.bin_number || "—"}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">{r.tax_period}</td>
                  <td className="px-3 py-3 text-xs text-blue-600 dark:text-blue-400 font-bold font-mono underline-offset-2 hover:underline">{r.submission_id}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {r.submission_date
                      ? new Date(r.submission_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{r.finalized_by_name || "—"}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      Finalized
                    </span>
                  </td>
                  <td className="px-3 py-3 pr-5 text-right">
                    <CheckCircle2 className="inline-block h-4 w-4 text-green-500" strokeWidth={2.5} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-t border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-center text-sm flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
          Total Finalized This Month: <span className="tabular-nums text-sm">{fmt(monthFinal)}</span>
        </div>
      </div>

      {/* Bottom Grid — Top Managers + Non-Filer */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
        {/* Top Performing Managers */}
        <div className="rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-[0_6px_18px_rgba(15,23,42,0.06)] bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-sm">🏆</span>
              Top Performing Manager <span className="text-xs font-medium text-slate-500">(This Month)</span>
            </h3>
            <Link to="/vat/finalized" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline">
              View all →
            </Link>
          </div>
          {topManagers.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">No finalized submissions yet.</div>
          ) : (
            <div
              className={cn(
                "grid gap-3",
                topManagers.length === 1 && "grid-cols-1",
                topManagers.length === 2 && "grid-cols-1 sm:grid-cols-2",
                topManagers.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {topManagers.slice(0, 3).map((m, i) => {
                const rankStyles = [
                  { badge: "bg-amber-400 text-white", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40", count: "text-green-600 dark:text-green-400" },
                  { badge: "bg-slate-400 text-white", bg: "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50", count: "text-violet-600 dark:text-violet-400" },
                  { badge: "bg-orange-500 text-white", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/40", count: "text-orange-600 dark:text-orange-400" },
                ];
                const s = rankStyles[i] || rankStyles[2];
                const initials = (m.name || "?").split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={i} className={cn("rounded-xl p-3 border flex items-center gap-3 min-w-0", s.bg)}>
                    <div className="relative shrink-0">
                      <div className={cn("absolute -top-1 -left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold shadow", s.badge)}>
                        {i + 1}
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 ring-2 ring-white dark:ring-slate-900 shadow">
                        {initials}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={m.name}>{m.name}</div>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <strong className={cn("text-base font-bold leading-none tabular-nums", s.count)}>{m.count}</strong>
                        <span className={cn("text-[11px] font-semibold", s.count)}>Finalized</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Non-Filer Card */}
        <div className="relative overflow-hidden rounded-2xl p-5 border border-rose-200 dark:border-rose-900/40 shadow-[0_6px_18px_rgba(15,23,42,0.06)] bg-gradient-to-br from-rose-50 via-white to-red-50 dark:from-rose-950/30 dark:via-slate-900 dark:to-red-950/20 flex items-center gap-4">
          {/* decorative blob */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-200/50 dark:bg-rose-900/30 blur-2xl" />

          {/* Clipboard icon */}
          <div className="relative shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-900/50 dark:to-rose-800/50 shadow-inner">
              <ClipboardList className="h-7 w-7 text-rose-500" strokeWidth={2.25} />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md ring-2 ring-white dark:ring-slate-900">
              <AlertCircle className="h-3 w-3" strokeWidth={3} />
            </span>
          </div>

          <div className="relative z-10 flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Focus on Non-Filer Clients</h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              You have <strong className="font-bold text-rose-600 dark:text-rose-400">{fmt(nonFiler)} clients</strong> who haven't submitted their VAT returns yet.
              Let's reach out and complete the submissions.
            </p>
          </div>

          <Link
            to="/vat/non-filers"
            search={{ period } as any}
            aria-label="View Non-Filers"
            className="relative z-10 shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 transition-colors"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}







type UserStats = {
  total?: number; active?: number; inactive?: number;
  new_this_month?: number; inactive_this_month?: number;
} | undefined;

type TileTone = "green" | "red" | "blue" | "orange";

const toneStyles: Record<TileTone, {
  dot: string;
  text: string;
  iconBg: string;
  iconColor: string;
  bar: string;
  barTrack: string;
}> = {
  green: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-100/70 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    barTrack: "bg-emerald-200/60 dark:bg-emerald-500/20",
  },
  red: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-100/70 dark:bg-rose-500/15",
    iconColor: "text-rose-500 dark:text-rose-400",
    bar: "bg-rose-500",
    barTrack: "bg-rose-200/60 dark:bg-rose-500/20",
  },
  blue: {
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-100/70 dark:bg-sky-500/15",
    iconColor: "text-sky-500 dark:text-sky-400",
    bar: "bg-sky-500",
    barTrack: "bg-sky-200/60 dark:bg-sky-500/20",
  },
  orange: {
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-100/70 dark:bg-orange-500/15",
    iconColor: "text-orange-500 dark:text-orange-400",
    bar: "bg-orange-500",
    barTrack: "bg-orange-200/60 dark:bg-orange-500/20",
  },
};

function StatTile({
  value, icon: Icon, tone, label, total,
}: {
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: TileTone;
  label: string;
  total?: number;
}) {
  const s = toneStyles[tone];
  const pct = total && total > 0
    ? Math.max(6, Math.min(100, Math.round((value / total) * 100)))
    : value > 0 ? 35 : 6;
  return (
    <TooltipProvider delayDuration={100}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group/tile relative flex flex-col items-center text-center rounded-2xl cursor-default",
            "border border-slate-200/80 dark:border-slate-800",
            "bg-white dark:bg-slate-900/40 px-3 pt-5 pb-5",
            "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-sm",
          )}
        >
          {/* Pastel icon circle */}
          <div className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center",
            "transition-transform duration-300 group-hover/tile:scale-105",
            s.iconBg,
          )}>
            <Icon className={cn("h-3.5 w-3.5", s.iconColor)} />
          </div>

          {/* Value */}
          <div className="mt-2 text-lg font-bold tabular-nums leading-none tracking-tight text-slate-900 dark:text-slate-50">
            {fmt(value)}
          </div>

          {/* Progress bar */}
          <div className={cn("mt-3 h-1 w-12 rounded-full overflow-hidden", s.barTrack)}>
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-out", s.bar)}
              style={{ width: pct + "%" }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}






function ProgressRing({ pct, color, trackColor, label, sub }: {
  pct: number; color: string; trackColor: string; label: string; sub: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={trackColor} strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
        <circle cx="50" cy={50 - r} r="3.5" fill={color} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100 leading-none">{label}</span>
        {sub && <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">{sub}</span>}
      </div>
    </div>
  );
}

function GroupCard({
  title, icon: Icon, accent, data,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "violet" | "emerald";
  data: UserStats;
}) {
  const total = Number(data?.total ?? 0);
  const active = Number(data?.active ?? 0);
  const inactive = Number(data?.inactive ?? 0);
  const pending = Number(data?.new_this_month ?? 0);
  const blocked = Number(data?.inactive_this_month ?? 0);
  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

  const accentMap = {
    violet: {
      border: "border-violet-200/70 dark:border-violet-500/20",
      bg: "bg-white dark:bg-slate-900",
      iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
      iconRing: "ring-violet-100 dark:ring-violet-500/10",
      title: "text-slate-900 dark:text-slate-100",
      sub: "text-slate-500 dark:text-slate-400",
      num: "text-violet-600 dark:text-violet-300",
      heroBg: "bg-violet-50/70 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20",
      ringColor: "#8b5cf6",
      ringTrack: "rgba(139,92,246,0.18)",
      pillBg: "bg-violet-100 dark:bg-violet-500/20",
      pillIcon: "text-violet-600 dark:text-violet-300",
      heroNum: "text-violet-600 dark:text-violet-300",
      divider: "via-violet-200/70 dark:via-violet-500/20",
    },
    emerald: {
      border: "border-emerald-200/70 dark:border-emerald-500/20",
      bg: "bg-white dark:bg-slate-900",
      iconBg: "bg-gradient-to-br from-emerald-400 to-teal-500",
      iconRing: "ring-emerald-100 dark:ring-emerald-500/10",
      title: "text-slate-900 dark:text-slate-100",
      sub: "text-slate-500 dark:text-slate-400",
      num: "text-emerald-600 dark:text-emerald-300",
      heroBg: "bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20",
      ringColor: "#10b981",
      ringTrack: "rgba(16,185,129,0.18)",
      pillBg: "bg-emerald-100 dark:bg-emerald-500/20",
      pillIcon: "text-emerald-600 dark:text-emerald-300",
      heroNum: "text-emerald-600 dark:text-emerald-300",
      divider: "via-emerald-200/70 dark:via-emerald-500/20",
    },
  } as const;
  const a = accentMap[accent];
  const HeroIcon = accent === "violet" ? User : ShieldCheck;

  return (
    <div className={cn("group relative rounded-3xl border p-6 shadow-sm hover:shadow-md transition-all duration-300", a.border, a.bg)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl shadow-md flex items-center justify-center shrink-0 ring-2", a.iconBg, a.iconRing)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-sm font-semibold tracking-tight leading-tight", a.title)}>{title}</h3>
        </div>
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
          <div className={cn("text-xl font-bold tabular-nums leading-none", a.num)}>{fmt(total)}</div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={active} icon={ShieldCheck} tone="green" label="Active" total={total} />
        <StatTile value={inactive} icon={UserX} tone="red" label="Inactive" total={total} />
        <StatTile value={pending} icon={UserPlus} tone="blue" label="New This Month" total={total} />
        <StatTile value={blocked} icon={LogOut} tone="orange" label="Left This Month" total={total} />
      </div>
    </div>
  );
}

function ComparisonCard({ mTotal, cTotal, showManagers }: { mTotal: number; cTotal: number; showManagers: boolean }) {
  const total = mTotal + cTotal;
  const mPct = total > 0 ? (mTotal / total) * 100 : 0;
  const cPct = total > 0 ? (cTotal / total) * 100 : (showManagers ? 0 : 100);
  const max = Math.max(mTotal, cTotal, 1);
  const niceMax = Math.max(10, Math.ceil(max / 10) * 10);
  const ticks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];

  const R = 52;
  const C = 2 * Math.PI * R;
  const violetLen = (mPct / 100) * C;
  const emeraldLen = (cPct / 100) * C;

  return (
    <Card
      className="overflow-hidden border-border/60 shadow-sm"
      style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.04) 0%, rgba(16,185,129,0.04) 100%)" }}
    >
      <CardContent className="p-4 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-100 to-emerald-100 dark:from-violet-500/20 dark:to-emerald-500/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Comparison</h3>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            {showManagers && (
              <div className="flex items-center gap-3">
                <div className="w-20 text-xs font-medium text-muted-foreground shrink-0">Managers</div>
                <div className="flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
                    style={{ width: `${(mTotal / niceMax) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right text-sm font-bold text-violet-600 dark:text-violet-300 tabular-nums">{fmt(mTotal)}</div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-20 text-xs font-medium text-muted-foreground shrink-0">Clients</div>
              <div className="flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{ width: `${(cTotal / niceMax) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right text-sm font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">{fmt(cTotal)}</div>
            </div>
            <div className="flex items-center gap-3 pt-0.5">
              <div className="w-20 shrink-0" />
              <div className="flex-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                {ticks.map((t) => <span key={t}>{Math.round(t)}</span>)}
              </div>
              <div className="w-10 shrink-0" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative h-32 w-32">
              <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
                <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.25" />
                {showManagers && mTotal > 0 && (
                  <circle
                    cx="70" cy="70" r={R} fill="none"
                    stroke="rgb(139,92,246)" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${violetLen} ${C - violetLen}`}
                    strokeDashoffset={0}
                  />
                )}
                {cTotal > 0 && (
                  <circle
                    cx="70" cy="70" r={R} fill="none"
                    stroke="rgb(16,185,129)" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${emeraldLen} ${C - emeraldLen}`}
                    strokeDashoffset={-violetLen}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">{cPct.toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">Clients</div>
              </div>
            </div>
            <div className="flex gap-4 text-[11px]">
              {showManagers && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="text-muted-foreground">Managers</span>
                  <span className="font-semibold text-violet-600 dark:text-violet-300 tabular-nums">{mPct.toFixed(1)}%</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Clients</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums">{cPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserOverviewCard({
  showManagers, managers, clients,
}: { showManagers: boolean; managers: UserStats; clients: UserStats }) {
  const mTotal = Number(managers?.total ?? 0);
  const cTotal = Number(clients?.total ?? 0);

  return (
    <div className="space-y-4">
      {/* Group cards — total + breakdown in one polished panel */}
      <div className={cn("grid gap-4", showManagers ? "md:grid-cols-2" : "grid-cols-1")}>
        {showManagers && <GroupCard title="Managers" icon={Users} accent="violet" data={managers} />}
        <GroupCard title="Clients" icon={Building2} accent="emerald" data={clients} />
      </div>
    </div>
  );
}

function Dashboard() {
  const { role } = useAuth();
  const fetchStats = useServerFn(getDashboardStats);
  const runCloseYear = useServerFn(closeYear);
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [closing, setClosing] = useState(false);
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", year],
    queryFn: () => fetchStats({ data: { year } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    refetchInterval: 30_000,
  });

  const fetchUserCounts = useServerFn(getDashboardUserCounts);
  const { data: userCounts, isLoading: userCountsLoading } = useQuery({
    queryKey: ["dashboard-user-counts"],
    queryFn: () => fetchUserCounts({ data: undefined }),
    staleTime: 60_000,
  });


  const handleCloseYear = async () => {
    setClosing(true);
    try {
      const res = await runCloseYear({ data: { year } });
      toast.success(`${year} year closed — ${res.count} customers snapshot saved`);
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-user-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Year close failed");
    } finally {
      setClosing(false);
    }
  };


  const finance = data?.finance;
  const managers = userCounts?.managers;
  const clients = userCounts?.clients;
  const topColl = data?.top_collection ?? [];
  const topDue = data?.top_due ?? [];
  const monthly = (data?.monthly ?? []).map((m) => ({
    ...m,
    label: new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short" }),
  }));
  const last3 = (data?.last_3_months ?? []).map((m) => ({
    ...m,
    label: new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  }));
  const WINDOW = 4;
  const [winEnd, setWinEnd] = useState<number>(0);
  // default to current (latest) month when data loads
  const effectiveEnd = last3.length === 0 ? 0 : (winEnd === 0 ? last3.length - 1 : Math.min(winEnd, last3.length - 1));
  const winStart = Math.max(0, effectiveEnd - WINDOW + 1);
  const visibleMonths = last3.slice(winStart, effectiveEnd + 1);
  const canPrev = winStart > 0;
  const canNext = effectiveEnd < last3.length - 1;
  const overview = finance
    ? [
        { name: "Bill", value: finance.total_bill, fill: COLOR.bill },
        { name: "Collection", value: finance.total_collection, fill: COLOR.collection },
        { name: "Due", value: finance.total_due, fill: COLOR.due },
      ]
    : [];

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back. You're signed in as <span className="capitalize font-medium">{role}</span>.
          </p>
        </div>
        
      </div>


      {/* User Overview - consolidated card */}
      {userCountsLoading || !managers || !clients ? (
        <Skeleton className="h-44" />
      ) : (
        <UserOverviewCard
          showManagers={role === "admin"}
          managers={managers}
          clients={clients}
        />
      )}

      {/* VAT Return Submission */}
      <VatReturnSection />

      {/* Mushak 4.3 Submission Summary */}
      <MushakSummarySection />







      {/* Financial - admin only (Collection Overview hidden from managers) */}
      <section className="space-y-5">
        {role === "admin" && (<>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3"

          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(20,184,166,0.05) 50%, rgba(244,114,182,0.04) 100%)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 text-white shadow-md shadow-indigo-500/30">
              <Wallet className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold tracking-wider bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
              Collection Overview
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Year</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[110px] bg-background/70 backdrop-blur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === "admin" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-background/70 backdrop-blur" disabled={closing}>
                    <Lock className="h-3.5 w-3.5" />
                    {closing ? "Closing..." : `Close ${year}`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{year} Do you want to close the year?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Opening, bills, collections, and closing balance for each customer for the year {year} will be saved.
                      This will be carried forward as the opening due for the year {year + 1}. Running this operation again will update the snapshot.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCloseYear}>Confirm Close</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Year ledger flow: Opening → Bills → Collections → Closing */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</>
          ) : (() => {
            const vals = [
              Math.abs(finance?.opening_due ?? 0),
              Math.abs(finance?.year_bills ?? 0),
              Math.abs(finance?.year_collections ?? 0),
              Math.abs(finance?.closing_due ?? 0),
            ];
            const max = Math.max(1, ...vals);
            const intensityOf = (v: number) => Math.abs(v) / max;
            const closing = finance?.closing_due ?? 0;
            return (
              <>
                <StatCard
                  label={`Opening Due (1 Jan ${year})`}
                  value={fmtMoney(finance?.opening_due ?? 0)}
                  icon={ArrowRight}
                  tone="info"
                  intensity={intensityOf(finance?.opening_due ?? 0)}
                />
                <StatCard
                  label={`Bills (${year}) +`}
                  value={fmtMoney(finance?.year_bills ?? 0)}
                  icon={Receipt}
                  tone="warn"
                  intensity={intensityOf(finance?.year_bills ?? 0)}
                />
                <StatCard
                  label={`Collections (${year}) −`}
                  value={fmtMoney(finance?.year_collections ?? 0)}
                  icon={Wallet}
                  tone="success"
                  intensity={intensityOf(finance?.year_collections ?? 0)}
                />
                <StatCard
                  label={`Closing Due (31 Dec ${year})`}
                  value={fmtMoney(closing)}
                  icon={closing >= 0 ? TrendingDown : TrendingUp}
                  tone={closing > 0 ? "whiteDanger" : "white"}
                  intensity={Math.min(0.35, intensityOf(closing))}
                />
              </>
            );
          })()}
        </div>

        {!isLoading && (() => {
          const bills = finance?.year_bills ?? 0;
          const opening = finance?.opening_due ?? 0;
          const collections = finance?.year_collections ?? 0;
          const discount = finance?.year_discount ?? 0;
          const ratio = bills > 0 ? Math.min(1, discount / bills) : 0;
          const denom = opening + bills;
          const rate = denom > 0 ? Math.min(100, (collections / denom) * 100) : 0;
          const rateTone: "success" | "warn" | "danger" = rate >= 75 ? "success" : rate >= 40 ? "warn" : "danger";
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label={`Total Discount (${year})`}
                value={fmtMoney(discount)}
                icon={BadgePercent}
                tone="default"
                intensity={Math.max(0.2, ratio * 4)}
              />
              <StatCard
                label={`Collection Rate (${year})`}
                value={`${rate.toFixed(1)}%`}
                icon={Percent}
                tone={rateTone}
                intensity={rate / 100}
              />
            </div>
          );
        })()}
        </>)}

        {/* Manager Payroll Summary — managers see own; admin sees aggregate inside Account Summary */}
        {role === "manager" && <PayrollSummaryCards isAdmin={false} />}
      </section>



      {role === "admin" && (
      <>
      {/* Last 4 Months — Bill vs Collection */}
      <Card className="border-border/60 shadow-sm overflow-hidden p-0">
        <div
          className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(20,184,166,0.06) 50%, rgba(244,114,182,0.05) 100%)",
          }}
        >
          <h3 className="text-sm font-semibold bg-gradient-to-r from-indigo-600 via-sky-600 to-teal-600 bg-clip-text text-transparent">
            {visibleMonths.length > 0
              ? `${visibleMonths[0].label} – ${visibleMonths[visibleMonths.length - 1].label} — Bill vs Collection`
              : "Bill vs Collection"}
          </h3>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canPrev}
                onClick={() => setWinEnd(Math.max(WINDOW - 1, effectiveEnd - 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canNext}
                onClick={() => setWinEnd(Math.min(last3.length - 1, effectiveEnd + 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">Bill</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">Coll.</span>
              </div>
            </div>
          </div>
        </div>

        {last3.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <TrendingUp className="mr-2 h-4 w-4" /> No data yet
          </div>
        ) : (
          <>
            {(() => {
              const maxBill = Math.max(1, ...visibleMonths.map((m) => m.bill));
              const maxColl = Math.max(1, ...visibleMonths.map((m) => m.collection));
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/60">
                  {visibleMonths.map((m) => {
                    const billPct = Math.min(100, (m.bill / maxBill) * 100);
                    const collPct = Math.min(100, (m.collection / maxColl) * 100);
                    const now = new Date();
                    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                    const isCurrent = m.month === currentKey;
                    return (
                      <div
                        key={m.month}
                        className={`relative p-4 flex flex-col items-center transition-all ${
                          isCurrent
                            ? "bg-gradient-to-b from-indigo-50/80 to-teal-50/60 dark:from-indigo-950/40 dark:to-teal-950/30 ring-1 ring-inset ring-indigo-400/40"
                            : "hover:bg-gradient-to-b hover:from-indigo-50/60 hover:to-teal-50/40 dark:hover:from-indigo-950/30 dark:hover:to-teal-950/20"
                        }`}
                      >
                        {isCurrent && (
                          <span className="absolute top-1.5 right-1.5 text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-teal-500 text-white shadow-sm">
                            Now
                          </span>
                        )}
                        <span className={`text-[10px] font-bold tracking-wider mb-3 ${isCurrent ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}>{m.label}</span>
                        <div className="space-y-3 w-full">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-semibold font-mono tabular-nums bg-gradient-to-r from-indigo-600 to-sky-600 bg-clip-text text-transparent">{fmtMoney(m.bill)}</span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium tabular-nums mt-0.5">{m.bill_count} bills · {m.bill_client_count} clients</span>
                            <div className="w-full h-1.5 bg-indigo-500/10 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${billPct}%`,
                                  background: "linear-gradient(90deg, #6366f1 0%, #0ea5e9 100%)",
                                  boxShadow: "0 0 6px rgba(99,102,241,0.55)",
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-semibold font-mono tabular-nums bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent">{fmtMoney(m.collection)}</span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium tabular-nums mt-0.5">{m.collection_count} coll. · {m.collection_client_count} clients</span>
                            <div className="w-full h-1.5 bg-teal-500/10 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${collPct}%`,
                                  background: "linear-gradient(90deg, #14b8a6 0%, #10b981 100%)",
                                  boxShadow: "0 0 6px rgba(20,184,166,0.55)",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div
              className="px-5 py-2 border-t border-border/60"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(20,184,166,0.05) 100%)",
              }}
            >
              <p className="text-[10px] text-slate-600 dark:text-slate-400 text-center italic font-medium">Consolidated billing vs actual collection performance</p>
            </div>
          </>
        )}
      </Card>

      {/* Charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={`Top 5 Clients — Highest Collection (${year})`} subtitle="Sum within selected year">
          {topColl.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topColl} layout="vertical" margin={{ left: 12, right: 56, top: 8, bottom: 8 }} barCategoryGap="28%">
                <defs>
                  <linearGradient id="gradCollection" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                    <stop offset="55%" stopColor="#22c55e" stopOpacity={1} />
                    <stop offset="100%" stopColor="#86efac" stopOpacity={1} />
                  </linearGradient>
                  <filter id="shadowCollection" x="-10%" y="-30%" width="120%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.4" />
                  </filter>
                </defs>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} strokeDasharray="3 4" />
                <XAxis type="number" tickFormatter={(v) => fmt(v)} fontSize={11} tickLine={false} axisLine={{ strokeOpacity: 0.2 }} />
                <YAxis type="category" dataKey="name" width={120} fontSize={11} interval={0} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  formatter={(v: number) => fmtMoney(v)}
                  cursor={{ fill: "#10b98114" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #10b98144", boxShadow: "0 8px 24px -8px rgba(16,185,129,0.35)" }}
                />
                <Bar dataKey="amount" fill="url(#gradCollection)" radius={[0, 10, 10, 0]} filter="url(#shadowCollection)" barSize={18}>
                  <LabelList dataKey="amount" position="right" formatter={(v: number) => fmtMoney(v)} fontSize={11} fill="#059669" style={{ fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Top 5 Clients — Highest Due (${year})`} subtitle="Ledger closing due for selected year">
          {topDue.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDue} layout="vertical" margin={{ left: 12, right: 56, top: 8, bottom: 8 }} barCategoryGap="28%">
                <defs>
                  <linearGradient id="gradDue" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e11d48" stopOpacity={1} />
                    <stop offset="55%" stopColor="#fb7185" stopOpacity={1} />
                    <stop offset="100%" stopColor="#fda4af" stopOpacity={1} />
                  </linearGradient>
                  <filter id="shadowDue" x="-10%" y="-30%" width="120%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#f43f5e" floodOpacity="0.4" />
                  </filter>
                </defs>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} strokeDasharray="3 4" />
                <XAxis type="number" tickFormatter={(v) => fmt(v)} fontSize={11} tickLine={false} axisLine={{ strokeOpacity: 0.2 }} />
                <YAxis type="category" dataKey="name" width={120} fontSize={11} interval={0} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  formatter={(v: number) => fmtMoney(v)}
                  cursor={{ fill: "#f43f5e14" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #f43f5e44", boxShadow: "0 8px 24px -8px rgba(244,63,94,0.35)" }}
                />
                <Bar dataKey="amount" fill="url(#gradDue)" radius={[0, 10, 10, 0]} filter="url(#shadowDue)" barSize={18}>
                  <LabelList dataKey="amount" position="right" formatter={(v: number) => fmtMoney(v)} fontSize={11} fill="#e11d48" style={{ fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Bill vs Collection vs Due (${year})`} subtitle="Monthly breakdown">
          {monthly.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ left: 12, right: 16, top: 12, bottom: 8 }}>
                <defs>
                  <linearGradient id="areaBill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="areaColl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="areaDue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeOpacity={0.15} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={{ strokeOpacity: 0.2 }} />
                <YAxis tickFormatter={(v) => fmt(v)} fontSize={11} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  formatter={(v: number) => fmtMoney(v)}
                  cursor={{ stroke: "#8b5cf6", strokeOpacity: 0.25, strokeWidth: 2 }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.2)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                <Area type="monotone" dataKey="bill" name="Bill" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#areaBill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                <Area type="monotone" dataKey="collection" name="Collection" stroke="#22c55e" strokeWidth={2.5} fill="url(#areaColl)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                <Area type="monotone" dataKey="due" name="Due" stroke="#f43f5e" strokeWidth={2.5} fill="url(#areaDue)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Monthly Net Payable vs Collection (${year})`} subtitle="Cylinder fill = collected portion of each month's bill">
          {monthly.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="relative h-full overflow-hidden rounded-xl bg-white p-2 ring-1 ring-slate-200 sm:p-3 md:p-4">
              <div className="relative grid h-full grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 md:grid-cols-12 md:gap-3">
                {monthly.map((m) => {
                  const payable = Number(m.bill) || 0;
                  const collected = Number(m.collection) || 0;
                  const pct = payable > 0 ? Math.min(100, (collected / payable) * 100) : 0;
                  // Single clean teal palette like the reference
                  const fillTop = "#2b8a9e";
                  const fillBottom = "#1d6b7d";
                  const rimColor = "#cfd8dc";
                  return (
                    <div
                      key={m.month}
                      className="group flex flex-col items-center justify-end gap-1 sm:gap-1.5"
                      title={`${m.label}\nPayable: ${fmtMoney(payable)}\nCollection: ${fmtMoney(collected)}\nFilled: ${pct.toFixed(0)}%`}
                    >
                      <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none text-white shadow-sm sm:text-[10px]">
                        {pct.toFixed(0)}%
                      </span>
                      <div className="relative w-full max-w-[34px] flex-1 sm:max-w-[40px] md:max-w-[44px]">
                        {/* soft shadow under cylinder */}
                        <div className="pointer-events-none absolute -bottom-1 left-1/2 h-2 w-[85%] -translate-x-1/2 rounded-[50%] bg-slate-300/40 blur-[3px]" />

                        {/* empty glass tube */}
                        <div
                          className="relative h-full w-full overflow-hidden rounded-[18px] bg-white sm:rounded-[20px] md:rounded-[22px]"
                          style={{
                            boxShadow: `inset 6px 0 10px -6px rgba(0,0,0,0.10), inset -6px 0 10px -6px rgba(0,0,0,0.18), 0 0 0 1px ${rimColor}`,
                          }}
                        >
                          {/* liquid fill — clean teal */}
                          <div
                            className="absolute bottom-0 left-0 right-0 overflow-visible transition-[height] duration-700 ease-out"
                            style={{
                              height: `${pct}%`,
                              background: `linear-gradient(to bottom, ${fillTop} 0%, ${fillBottom} 100%)`,
                              boxShadow: `inset 6px 0 10px -6px rgba(0,0,0,0.25), inset -6px 0 10px -6px rgba(255,255,255,0.18), inset 0 6px 8px -4px rgba(255,255,255,0.15)`,
                            }}
                          >
                            {/* top ellipse of liquid */}
                            {pct > 0 && pct < 99.5 && (
                              <div
                                className="pointer-events-none absolute -top-[5px] left-0 right-0 h-[10px] rounded-[50%]"
                                style={{
                                  background: fillTop,
                                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)`,
                                }}
                              />
                            )}
                            {/* value % inside liquid */}
                            {pct > 18 && (
                              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold tabular-nums text-white sm:text-[10px]">
                                {pct.toFixed(0)}%
                              </span>
                            )}
                          </div>

                          {/* glass side highlights */}
                          <div className="pointer-events-none absolute inset-y-2 left-[14%] w-[2px] rounded-full bg-white/60" />
                          <div className="pointer-events-none absolute inset-y-3 right-[16%] w-[1.5px] rounded-full bg-white/30" />

                          {/* top opening rim */}
                          <div
                            className="pointer-events-none absolute -top-[4px] left-0 right-0 h-[8px] rounded-[50%] bg-white"
                            style={{ boxShadow: `0 0 0 1px ${rimColor}, inset 0 1px 0 rgba(255,255,255,0.9)` }}
                          />
                        </div>
                      </div>

                      <span className="text-[10px] font-medium text-slate-600 sm:text-[11px]">{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>
      </section>
      </>
      )}

      {/* Balance Sheet financial summary - admin only (placed last) */}
      {role === "admin" && <FinancialSummarySection />}
    </div>


  );
}




function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <TrendingUp className="mr-2 h-4 w-4" /> No data yet
    </div>
  );
}

function AdminManagerPayrollCards({ month, year }: { month: number; year: number }) {
  const fetchFn = useServerFn(getPayrollSummary);
  const { data } = useQuery({
    queryKey: ["payroll-summary", "all", month, year],
    queryFn: () => fetchFn({ data: { month, year } }),
    staleTime: 30_000,
  });
  const f = (n?: number) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bill = data?.total_bill ?? 0;
  const paid = data?.total_paid ?? 0;
  const pending = data?.pending ?? 0;
  return (
    <>
      <Card className="bg-fuchsia-50 dark:bg-fuchsia-950/20 border-fuchsia-100 dark:border-fuchsia-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Manager Bill</CardTitle>
          <Receipt className="h-4 w-4 text-fuchsia-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-fuchsia-700">{f(data?.current_month_bill ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">Till Date: {f(bill)}</p>
        </CardContent>

      </Card>

      <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Manager Paid</CardTitle>
          <Wallet className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-700">{f(data?.current_month_paid ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">Till Date: {f(paid)}</p>
        </CardContent>
      </Card>

      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Manager Due</CardTitle>
          <Clock className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-700">{f(data?.current_month_pending ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">Till Date: {f(pending)}</p>
        </CardContent>
      </Card>
    </>
  );
}

function ManagerPayrollBreakdownTable() {
  const fetchFn = useServerFn(getManagerPayrollBreakdown);
  const { data, isLoading } = useQuery({
    queryKey: ["payroll-breakdown", "all"],
    queryFn: () => fetchFn(),
    staleTime: 30_000,
  });
  const rows = data?.rows ?? [];
  const f = (n: number) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const idx = Number(mm) - 1;
    return idx >= 0 && idx < 12 ? `${EN_MONTHS[idx]} ${y}` : m;
  };

  if (!isLoading && rows.length === 0) return null;

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Manager-wise Monthly Payroll</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Bill</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Loading...</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={`${r.manager_id}-${r.month}`}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.manager_name}</TableCell>
                  <TableCell>{monthLabel(r.month)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fuchsia-700">{f(r.bill)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{f(r.paid)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${r.due > 0 ? "text-amber-700" : "text-muted-foreground"}`}>{f(r.due)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PayrollSummaryCards({ isAdmin }: { isAdmin: boolean }) {
  const fetchFn = useServerFn(getPayrollSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["payroll-summary", isAdmin ? "all" : "self"],
    queryFn: () => fetchFn(),
    staleTime: 30_000,
  });
  const title = isAdmin ? "Manager Payroll (All)" : "My Payroll";
  const billLabel = isAdmin ? "Total Manager Bill" : "My Work Bill";
  const paidLabel = isAdmin ? "Total Paid to Managers" : "Total Received";
  const curLabel = isAdmin ? "Current Month Due" : "Current Month Due";
  const tillLabel = isAdmin ? "Till Date Due" : "Till Date Due";
  const bill = data?.total_bill ?? 0;
  const paid = data?.total_paid ?? 0;
  const pending = data?.pending ?? 0;
  const curPending = data?.current_month_pending ?? 0;
  const max = Math.max(1, bill, paid, pending, curPending);
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-md">
          <HandCoins className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-bold tracking-wider bg-gradient-to-r from-fuchsia-600 to-pink-600 bg-clip-text text-transparent">
          {title}
        </h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</>
        ) : (
          <>
            <StatCard label={billLabel} value={fmtMoney(bill)} icon={Receipt} tone="info" intensity={bill / max} />
            <StatCard label={paidLabel} value={fmtMoney(paid)} icon={Wallet} tone="success" intensity={paid / max} />
            <StatCard label={curLabel} value={fmtMoney(curPending)} icon={Clock} tone={curPending > 0 ? "whiteDanger" : "white"} intensity={curPending / max} />
            <StatCard label={tillLabel} value={fmtMoney(pending)} icon={Clock} tone={pending > 0 ? "whiteDanger" : "white"} intensity={pending / max} />
          </>
        )}
      </div>
    </div>
  );
}


function FinancialSummarySection() {
  const fetchBs = useServerFn(getBalanceSheetData);
  const fetchLoans = useServerFn(getLoans);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthYear, setMonthYear] = useState(currentMonth);
  const m = monthYear ? parseInt(monthYear.split("-")[1]) : 0;
  const y = monthYear ? parseInt(monthYear.split("-")[0]) : 0;

  const { data: stats } = useQuery({
    queryKey: ["dash-bs", m, y],
    queryFn: () => fetchBs({ data: { month: m, year: y } }),
  });
  const { data: allStats } = useQuery({
    queryKey: ["dash-bs", "all"],
    queryFn: () => fetchBs({ data: { month: 0, year: 0 } }),
  });
  const { data: loans } = useQuery({
    queryKey: ["dash-loans"],
    queryFn: () => fetchLoans({ data: undefined }),
  });

  const f = (n?: number) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const list = (loans || []) as any[];
  const taken = list.filter(l => String(l.type).toLowerCase() === "taken" && l.status === "ACTIVE")
    .reduce((s, l) => s + Number(l.amount || 0), 0);
  const given = list.filter(l => String(l.type).toLowerCase() === "given" && l.status === "ACTIVE")
    .reduce((s, l) => s + Number(l.amount || 0), 0);
  const takenAll = list.filter(l => String(l.type).toLowerCase() === "taken")
    .reduce((s, l) => s + Number(l.amount || 0), 0);
  const givenAll = list.filter(l => String(l.type).toLowerCase() === "given")
    .reduce((s, l) => s + Number(l.amount || 0), 0);
  const repaid = list.filter(l => String(l.type).toLowerCase() === "taken")
    .flatMap(l => (l.loan_transactions || []) as any[])
    .filter(t => t.type === "REPAYMENT")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const collected = list.filter(l => String(l.type).toLowerCase() === "given")
    .flatMap(l => (l.loan_transactions || []) as any[])
    .filter(t => t.type === "COLLECTION")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const net = given - taken;

  // Deadline notifications: outstanding loans with a due_date
  const now = Date.now();
  type DueRow = { id: string; contact: string; due_date: string; days: number; outstanding: number; type: string };
  const buildDue = (loanType: "taken" | "given"): DueRow[] => list
    .filter(l => String(l.type).toLowerCase() === loanType && l.status === "ACTIVE" && l.due_date)
    .map(l => {
      const paid = ((l.loan_transactions || []) as any[]).reduce((s, t) => s + Number(t.amount || 0), 0);
      const outstanding = Number(l.amount || 0) - paid;
      const days = Math.ceil((new Date(l.due_date).getTime() - now) / 86400000);
      return { id: l.id, contact: l.loan_contacts?.name || "—", due_date: l.due_date, days, outstanding, type: loanType };
    })
    .filter(r => r.outstanding > 0)
    .sort((a, b) => a.days - b.days);

  const repayDue = buildDue("taken");
  const receiveDue = buildDue("given");
  const repayOverdue = repayDue.filter(r => r.days < 0);
  const repaySoon = repayDue.filter(r => r.days >= 0 && r.days <= 7);
  const receiveOverdue = receiveDue.filter(r => r.days < 0);
  const receiveSoon = receiveDue.filter(r => r.days >= 0 && r.days <= 7);
  const sumAmt = (rows: DueRow[]) => rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(20,184,166,0.05) 50%, rgba(244,114,182,0.04) 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 via-orange-500 to-amber-500 text-white shadow-md">
            <Wallet className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold tracking-wider bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 bg-clip-text text-transparent">
            Account Summary
          </h2>
        </div>
        <MonthPicker value={monthYear} onChange={setMonthYear} className="h-9 w-[180px]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-9 gap-4">
        <Card className="bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700">{f(stats?.summary.totalIncome)}</div>
            <p className="text-xs text-muted-foreground mt-1">Coll: {f(stats?.summary.totalCollections)} | Others: {f(stats?.summary.totalOthersIncome)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(allStats?.summary.totalCollections)} | {f(allStats?.summary.totalOthersIncome)}</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expense</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">{f(stats?.summary.totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Office & other expenses</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(allStats?.summary.totalExpenses)}</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <Banknote className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{f(stats?.summary.netBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Income - Expense</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(allStats?.summary.netBalance)}</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cash in Hand</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{f(allStats?.summary.cashBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">All-time cash balance</p>
            <p className="text-xs text-muted-foreground mt-0.5">Period: {f(stats?.summary.cashBalance)}</p>
          </CardContent>
        </Card>

        {(() => {
          const banks = ((allStats as any)?.bankBalances ?? []) as any[];
          const bankTotal = banks.reduce((s, b) => s + Number(b.current_balance || 0), 0);
          const initTotal = banks.reduce((s, b) => s + Number(b.initial_balance || 0), 0);
          return (
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="block w-full text-left">
                  <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900 hover:shadow-md transition cursor-pointer h-full">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
                      <Landmark className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-700">{f(bankTotal)}</div>
                      <p className="text-xs text-muted-foreground mt-1">{banks.length} account{banks.length === 1 ? "" : "s"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Initial: {f(initTotal)}</p>
                    </CardContent>
                  </Card>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bank Accounts</DialogTitle>
                </DialogHeader>
                {banks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No bank accounts added yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Initial</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {banks.map((b: any) => (
                          <TableRow key={b.id}>
                            <TableCell>
                              <div className="font-medium">{b.name}</div>
                              {b.bank_name ? <div className="text-xs text-muted-foreground">{b.bank_name}{b.branch_name ? ` · ${b.branch_name}` : ""}</div> : null}
                            </TableCell>
                            <TableCell className="text-right">{f(b.initial_balance)}</TableCell>
                            <TableCell className="text-right font-bold text-blue-700">{f(b.current_balance)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell className="text-right font-semibold">{f(initTotal)}</TableCell>
                          <TableCell className="text-right font-bold text-blue-700">{f(bankTotal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          );
        })()}

        {(() => {
          const banks = ((allStats as any)?.bankBalances ?? []) as any[];
          const bankTotal = banks.reduce((s, b) => s + Number(b.current_balance || 0), 0);
          const cash = Number(allStats?.summary.cashBalance || 0);
          const total = cash + bankTotal;
          return (
            <Card className="bg-teal-50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                <Coins className="h-4 w-4 text-teal-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-700">{f(total)}</div>
                <p className="text-xs text-muted-foreground mt-1">Cash + Bank</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cash: {f(cash)} | Bank: {f(bankTotal)}</p>
              </CardContent>
            </Card>
          );
        })()}




        <Card className="bg-violet-50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Loans</CardTitle>
            <HandCoins className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{f(Math.abs(net))}</div>
            <p className="text-xs text-muted-foreground mt-1">Given: {f(given)} | Taken: {f(taken)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(givenAll)} | {f(takenAll)}</p>
          </CardContent>
        </Card>

        <Card className="bg-teal-50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Loan Repay</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-700">{f(repaid)}</div>
            <p className="text-xs text-muted-foreground mt-1">Repaid on taken loans</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(repaid)}</p>
          </CardContent>
        </Card>

        <Card className="bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Loan Receive</CardTitle>
            <Coins className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-700">{f(collected)}</div>
            <p className="text-xs text-muted-foreground mt-1">Received on given loans</p>
            <p className="text-xs text-muted-foreground mt-0.5">Till Date: {f(collected)}</p>
          </CardContent>
        </Card>

        <AdminManagerPayrollCards month={m} year={y} />
      </div>

      <ManagerPayrollBreakdownTable />


      {(repayDue.length > 0 || receiveDue.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const cards = [
              {
                key: "repay",
                title: "Repay Deadline",
                subtitle: "Loans you need to pay back",
                rows: repayDue,
                overdue: repayOverdue,
                soon: repaySoon,
                cardCls: "bg-teal-50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900 hover:shadow-md transition",
                iconCls: "h-4 w-4 text-teal-600",
                amountCls: "text-xl font-bold text-teal-700",
              },
              {
                key: "receive",
                title: "Receive Deadline",
                subtitle: "Loans you need to collect",
                rows: receiveDue,
                overdue: receiveOverdue,
                soon: receiveSoon,
                cardCls: "bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900 hover:shadow-md transition",
                iconCls: "h-4 w-4 text-sky-600",
                amountCls: "text-xl font-bold text-sky-700",
              },
            ];
            return cards.map(c => (
              <Dialog key={c.key}>
                <DialogTrigger asChild>
                  <button type="button" className="block w-full text-left">
                    <Card className={c.cardCls + " cursor-pointer"}>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <AlertCircle className={c.iconCls} /> {c.title}
                        </CardTitle>
                        {c.overdue.length > 0 && (
                          <Badge variant="destructive" className="text-[10px]">{c.overdue.length} overdue</Badge>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-baseline gap-3">
                          <div className={c.amountCls}>{f(sumAmt(c.rows))}</div>
                          <span className="text-xs text-muted-foreground">{c.subtitle}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Overdue: <span className="font-semibold text-rose-600">{c.overdue.length}</span>
                          {"  •  "}Due ≤ 7d: <span className="font-semibold text-amber-600">{c.soon.length}</span>
                          {"  •  "}Total: <span className="font-semibold">{c.rows.length}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertCircle className={c.iconCls} /> {c.title} — Details
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border p-2"><div className="text-muted-foreground">Total Outstanding</div><div className={c.amountCls}>{f(sumAmt(c.rows))}</div></div>
                      <div className="rounded-md border p-2"><div className="text-muted-foreground">Overdue</div><div className="text-lg font-bold text-rose-600">{c.overdue.length}</div></div>
                      <div className="rounded-md border p-2"><div className="text-muted-foreground">Due ≤ 7d</div><div className="text-lg font-bold text-amber-600">{c.soon.length}</div></div>
                    </div>
                    {c.rows.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-8">No pending items.</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.rows.map((r, i) => (
                            <TableRow key={r.id}>
                              <TableCell>{i + 1}</TableCell>
                              <TableCell className="font-medium">{r.contact}</TableCell>
                              <TableCell>{r.due_date}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded text-[11px] ${r.days < 0 ? "bg-rose-100 text-rose-700" : r.days <= 7 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                                  {r.days < 0 ? `${-r.days}d overdue` : `${r.days}d left`}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{f(r.outstanding)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="flex justify-end pt-2">
                      <Link to="/balance-sheet"><Button variant="outline" size="sm">Open Balance Sheet →</Button></Link>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ));
          })()}
        </div>
      )}
    </section>
  );
}

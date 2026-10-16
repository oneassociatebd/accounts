import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getBillingReport } from "@/lib/reports.functions";
import { getMe, listAreas, listReferences } from "@/lib/erp.functions";
import type {
  openBillingByBinPrint,
} from "@/lib/billing-bin-print";

import { sendByRefBillingSms } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  ReportFilters, SummaryCards, ReportTitle, printReport, fmt,
} from "@/components/reports/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeleton-loader";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthPicker } from "@/components/month-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, MessageSquare, Loader2, CalendarRange, CalendarDays, UserRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/billing")({
  head: () => ({ meta: [{ title: "One | Billing Report" }] }),
  component: BillingReportPage,
});

const fmtMonth = (ym: string) => {
  if (!ym) return "";
  const d = new Date(ym);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};


function BillingReportPage() {
  const fetchReport = useServerFn(getBillingReport);
  const fetchAreas = useServerFn(listAreas);
  const fetchReferences = useServerFn(listReferences);
  const fetchMe = useServerFn(getMe);
  const sendByRefSms = useServerFn(sendByRefBillingSms);
  const { session, role } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const currentMonth = today.slice(0, 7); // YYYY-MM

  const [mode, setMode] = useState<"date" | "month" | "ref">("date");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  
  
  const [areaId, setAreaId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  const filters = useMemo(() => ({
    filter_by: mode === "ref" ? ("month" as const) : (mode as "date" | "month"),
    from: mode === "date" ? (from || undefined) : undefined,
    to: mode === "date" ? (to || undefined) : undefined,
    month: (mode === "month" || mode === "ref") ? (month || undefined) : undefined,
    area_id: areaId || undefined,
    reference_id: referenceId || undefined,
  }), [mode, from, to, month, areaId, referenceId]);

  const { data, isLoading } = useQuery({
    queryKey: ["report-billing", filters],
    queryFn: () => fetchReport({ data: filters }),
    enabled: mode !== "ref" || !!referenceId,
  });

  const { data: areas } = useQuery({
    queryKey: ["areas-all"],
    queryFn: () => fetchAreas(),
  });

  const { data: references } = useQuery<Array<{ id: string; reference_name: string; whatsapp_number?: string | null; mobile_number?: string | null }>>({
    queryKey: ["references-all"],
    queryFn: () => fetchReferences() as Promise<Array<{ id: string; reference_name: string; whatsapp_number?: string | null; mobile_number?: string | null }>>,
  });

  const { data: me } = useQuery({
    queryKey: ["current-user-profile", session?.user?.id],
    queryFn: () => fetchMe(),
    enabled: !!session?.user?.id,
  });


  const rows = data?.rows ?? [];
  const s = data?.summary;

  const subtitle = mode === "month"
    ? `Billing Month: ${fmtMonth(month + "-01")}`
    : mode === "ref"
      ? `By Reference: ${fmtMonth(month + "-01")}`
      : `${from} → ${to}`;

  const buildPrintOpts = async () => {
    const { data: company } = await supabase
      .from("company_settings")
      .select("company_name, address, phone, email")
      .limit(1)
      .maybeSingle();

    const areaLabel = areaId
      ? (areas ?? []).find((a: { id: string; area_name: string }) => a.id === areaId)?.area_name ?? "All"
      : "All";
    const referenceLabel = referenceId
      ? (references ?? []).find((r) => r.id === referenceId)?.reference_name ?? "All"
      : "All";
    const billingMonthLabel = fmtMonth(month + "-01");

    return {
      rows: rows as Parameters<typeof openBillingByBinPrint>[0]["rows"],
      company: (company ?? {}) as Parameters<typeof openBillingByBinPrint>[0]["company"],
      billingMonthLabel,
      referenceLabel,
      areaLabel,
      generatedBy: session?.user?.email ?? "—",
      hideAreaColumn: !!areaId,
      hideReferenceColumn: !!referenceId,
    };
  };

  const buildByRefPosData = async () => {
    const { data: company } = await supabase
      .from("company_settings")
      .select("company_name, address, phone, bank_name, bank_branch, bank_account_number")
      .limit(1)
      .maybeSingle();
    const ref = (references ?? []).find((r) => r.id === referenceId);
    const areaLabel = areaId
      ? (areas ?? []).find((a: { id: string; area_name: string }) => a.id === areaId)?.area_name
      : undefined;
    const uniqueClients = new Set(
      rows.map((r) => (r as { customer_id?: string; customer_name?: string }).customer_id ?? r.customer_name),
    ).size;
    let userName = me?.profile?.name || me?.profile?.username || "";
    if (!userName) {
      const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      userName = meta.full_name || meta.name || (session?.user?.email?.split("@")[0]) || "User";
    }
    const effectiveRole = me?.role ?? role;
    const roleLabel = effectiveRole === "admin" ? "Admin" : effectiveRole === "manager" ? "Manager" : "User";
    const safeName = userName || session?.user?.email?.split("@")[0] || "User";
    void safeName;
    const generatedBy = `${roleLabel}${company?.company_name ? `, ${company.company_name}` : ""}`;
    return {
      company: company ?? null,
      reference_name: ref?.reference_name ?? "—",
      billing_month_label: fmtMonth(month + "-01"),
      area_label: areaLabel || undefined,
      summary: {
        total_count: s?.total_count ?? 0,
        total_clients: uniqueClients,
        total_subtotal: s?.total_subtotal ?? 0,
        total_previous: s?.total_previous ?? 0,
        total_payable: s?.total_payable ?? 0,
        total_discount: s?.total_discount ?? 0,
        total_amount: s?.total_amount ?? 0,
      },
      generated_by: generatedBy,
    };
  };

  const { data: posData } = useQuery({
    queryKey: ["by-ref-pos-data", referenceId, month, areaId, rows.length, s?.total_amount],
    queryFn: buildByRefPosData,
    enabled: mode === "ref" && !!referenceId && !!s,
  });

  const onPrint = async () => {
    if (mode === "ref") {
      if (!referenceId) {
        toast.error("Please select a reference");
        return;
      }
      const { openByRefPosViewer } = await import("@/lib/billing-by-ref-pos");
      openByRefPosViewer(await buildByRefPosData());
      return;
    }
    if (mode !== "month") {
      printReport();
      return;
    }
    const { openBillingByBinPrint } = await import("@/lib/billing-bin-print");
    openBillingByBinPrint(await buildPrintOpts());
  };


  const onExcel = async () => {
    if (mode !== "month") return;
    const { downloadBillingByBinExcel } = await import("@/lib/billing-bin-print");
    await downloadBillingByBinExcel(await buildPrintOpts());
  };

  const onSendWhatsapp = async () => {
    if (!referenceId) {
      toast.error("Please select a reference");
      return;
    }
    const ref = (references ?? []).find((r) => r.id === referenceId);
    const mobile = ref?.whatsapp_number?.trim();
    if (!mobile) {
      toast.error("This reference has no WhatsApp number. Add it in Master → References.");
      return;
    }
    try {
      const pd = await buildByRefPosData();
      const [{ buildByRefPosJpgBlob }, { shareBillJpgViaWhatsApp, shareResultToast }] = await Promise.all([
        import("@/lib/billing-by-ref-pos"),
        import("@/lib/share-bill-jpg"),
      ]);
      const { blob, filename } = await buildByRefPosJpgBlob(pd);
      const result = await shareBillJpgViaWhatsApp({ blob, filename, mobile });
      const t = shareResultToast(result);
      if (t.ok) toast.success(t.msg, { duration: t.duration });
      else toast.error(t.msg, { duration: t.duration });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share");
    }
  };

  const selectedRef = (references ?? []).find((r) => r.id === referenceId);
  const refMobile = (selectedRef?.mobile_number?.trim() || selectedRef?.whatsapp_number?.trim() || "");
  const refName = selectedRef?.reference_name || "";

  const onSendSms = () => {
    if (!referenceId) {
      toast.error("Please select a reference");
      return;
    }
    if (!refMobile) {
      toast.error("This reference has no mobile number. Add it in Master → References.");
      return;
    }
    setSmsOpen(true);
  };

  const handleConfirmSms = async () => {
    if (!refMobile) return;

    const bnMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    const [y, m] = month.split("-");
    const monthName = bnMonths[(parseInt(m, 10) || 1) - 1];
    const monthLabel = `${monthName}/${y}`;

    const subtotal = s?.total_subtotal ?? 0;
    const previous = s?.total_previous ?? 0;
    const payable = s?.total_payable ?? 0;
    const discount = s?.total_discount ?? 0;
    const net = Math.max(0, payable - discount);

    const roleLabel = role === "manager" ? "ম্যানেজার" : "অ্যাডমিন";

    const text = `আপনার ${monthLabel} মাসের বিল: ${subtotal}/-, পূর্বের ব্যালেন্স: ${previous}/-, মোট পরিশোধযোগ্য: ${payable}/-, ডিসকাউন্ট: ${discount}/-, নেট পরিশোধযোগ্য: ${net}/-\n\n${roleLabel}\nOne Associate`;

    setSendingSms(true);
    try {
      await sendByRefSms({ data: { mobile: refMobile, message: text, reference_id: referenceId } });
      toast.success("SMS has been sent");
      setSmsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSendingSms(false);
    }
  };


  return (
    <div className="p-4 md:p-6 space-y-4">
      <ReportTitle title="Billing Report" subtitle={subtitle} />

      <div className="print:hidden">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "date" | "month" | "ref")}>
          <TabsList className="h-12 p-1.5 bg-gradient-to-br from-muted/80 to-muted/40 rounded-2xl border border-border/60 shadow-sm gap-1 backdrop-blur-sm">
            <TabsTrigger
              value="date"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <CalendarRange className="h-4 w-4" />
              By Period
            </TabsTrigger>
            <TabsTrigger
              value="month"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <CalendarDays className="h-4 w-4" />
              By Month
            </TabsTrigger>
            <TabsTrigger
              value="ref"
              className="rounded-xl px-4 h-9 text-sm font-medium gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all duration-200"
            >
              <UserRound className="h-4 w-4" />
              By Ref
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ReportFilters
        showDate={mode === "date"}
        from={from} to={to}
        onFromChange={setFrom} onToChange={setTo}
        areaId={areaId} onAreaChange={setAreaId}
        areas={(areas ?? []) as Array<{ id: string; area_name: string }>}
        onPrint={onPrint}
        printLabel={mode === "ref" ? "" : "Print"}
        printIcon={mode === "ref" ? "eye" : "printer"}
        onExcel={mode === "month" ? onExcel : undefined}
        extraSlot={
          <>
            {(mode === "month" || mode === "ref") ? (
              <div>
                <Label className="text-xs">Month</Label>
                <MonthPicker value={month} onChange={setMonth} />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">Reference{mode === "ref" ? " *" : ""}</Label>
              <Select value={referenceId ?? "all"} onValueChange={(v) => setReferenceId(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={mode === "ref" ? "Select reference" : "All references"} /></SelectTrigger>
                <SelectContent>
                  {mode !== "ref" && <SelectItem value="all">All references</SelectItem>}
                  {(references ?? []).map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>{ref.reference_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "ref" && (
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  onClick={onSendWhatsapp}
                  disabled={!referenceId}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Send className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={onSendSms}
                  disabled={!referenceId}
                  variant="outline"
                >
                  <MessageSquare className="h-4 w-4 mr-1" /> SMS
                </Button>
              </div>
            )}

          </>
        }
      />

      {mode === "ref" && !referenceId ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Please select a reference to view the report.
          </CardContent>
        </Card>
      ) : mode === "ref" ? (
        <>
          <SummaryCards items={[
            { label: "Total Bills", value: s?.total_count ?? 0 },
            { label: "Billing Amount", value: fmt(s?.total_subtotal ?? 0) },
            { label: "Previous Balance", value: fmt(s?.total_previous ?? 0) },
            { label: "Total Receivable", value: fmt(s?.total_payable ?? 0) },
            { label: "Discount", value: fmt(s?.total_discount ?? 0), tone: "warning" as const },
            { label: "Net Payable", value: fmt((s?.total_payable ?? 0) - (s?.total_discount ?? 0)), tone: "success" as const },
          ]} />

        </>
      ) : (
        <>
          <SummaryCards items={[
            { label: "Total Active Clients", value: s?.total_active_clients ?? 0 },
            { label: "Total Bills", value: s?.total_count ?? 0 },
            { label: "Billing Amount", value: fmt(s?.total_subtotal ?? 0) },
            { label: "Previous Balance", value: fmt(s?.total_previous ?? 0) },
            { label: "Total Receivable", value: fmt(s?.total_payable ?? 0) },
            { label: "Discount", value: fmt(s?.total_discount ?? 0), tone: "warning" as const },
            { label: "Grand Total", value: fmt((s?.total_payable ?? 0) - (s?.total_discount ?? 0)), tone: "success" as const },
          ]} />
        </>
      )}

      <AlertDialog open={smsOpen} onOpenChange={setSmsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send SMS?</AlertDialogTitle>
            <AlertDialogDescription>
              Billing summary SMS will be sent to the mobile of reference <strong>{refName}</strong> ({refMobile || "No mobile"}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingSms}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSms} disabled={sendingSms}>
              {sendingSms ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              Yes, Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

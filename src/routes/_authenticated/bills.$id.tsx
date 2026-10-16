import { createFileRoute, Link, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getBill, finalizeBill, cancelBill, deleteBill } from "@/lib/billing.functions";
import { getBillShareInfo, sendBillSms } from "@/lib/whatsapp.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table,
} from "@/components/ui/table";
import { ArrowLeft, Download, CheckCircle2, XCircle, Loader2, Eye, Trash2, Pencil, MessageSquare, Link2 } from "lucide-react";
import { WhatsAppSendIcon } from "@/components/whatsapp-icon";
import { sendPaymentLinkSms } from "@/lib/bkash.functions";
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

export const Route = createFileRoute("/_authenticated/bills/$id")({
  head: () => ({
    meta: [{ title: "One | Bill Details" }],
  }),
  validateSearch: (s: Record<string, unknown>): { from?: string; fromPage?: number } => ({
    from: typeof s.from === "string" ? s.from : undefined,
    fromPage: typeof s.fromPage === "string" || typeof s.fromPage === "number" ? Number(s.fromPage) || undefined : undefined,
  }),
  component: BillView,
});

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toFixed(2);
}

type BillLineItem = {
  id: string;
  qty: number | string | null;
  final_amount: number | string | null;
  service?: { item_name?: string | null } | null;
};

function BillView() {
  const { id } = Route.useParams();
  const { from, fromPage } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const isPrintPreview = useRouterState({
    select: (state) => state.location.pathname === `/bills/${id}/print`,
  });
  const get = useServerFn(getBill);
  const finalize = useServerFn(finalizeBill);
  const cancel = useServerFn(cancelBill);
  const remove = useServerFn(deleteBill);
  const shareInfo = useServerFn(getBillShareInfo);
  const sendSmsFn = useServerFn(sendBillSms);
  const sendPayLinkFn = useServerFn(sendPaymentLinkSms);
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [sendingPayLink, setSendingPayLink] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["bill", id],
    queryFn: () => get({ data: { id } }),
  });

  if (isPrintPreview) return <Outlet />;

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { bill, items } = data;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf(data);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error("PDF generation failed:", e);
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleFinalize = async () => {
    try {
      await finalize({ data: { id } });
      toast.success("Bill finalized");
      qc.invalidateQueries({ queryKey: ["bill", id] });
      // Prompt to send WhatsApp right after finalize
      setShareOpen(true);
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };
  const handleCancel = async () => {
    if (!confirm("Cancel this bill?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Bill cancelled");
      qc.invalidateQueries({ queryKey: ["bill", id] });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };
  const handleDelete = async () => {
    if (!confirm(`Delete bill ${bill.bill_no}? This cannot be undone. The invoice number will not be reused.`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Bill deleted");
      qc.invalidateQueries({ queryKey: ["bills"] });
      navigate({ to: "/bills" });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message
          ? e.message
          : typeof e?.data?.message === "string" && e.data.message
            ? e.data.message
            : String(e ?? "Failed");
      toast.error(msg);
    }
  };

  // Download POS-mode invoice JPG and open WhatsApp chat directly with the client.
  // We intentionally skip navigator.share({files}) because WhatsApp shows a
  // contact picker instead of opening the target client's chat.
  const handleConfirmShare = async () => {
    setSendingWa(true);
    try {
      const [info, captured, shareMod] = await Promise.all([
        shareInfo({ data: { id } }),
        import("@/lib/bill-pos-jpg").then((m) => m.buildBillPosJpgBlob(data)),
        import("@/lib/share-bill-jpg"),
      ]);
      const { shareBillJpgViaWhatsApp, shareResultToast } = shareMod;
      const result = await shareBillJpgViaWhatsApp({
        blob: captured.blob,
        filename: captured.filename,
        mobile: info.mobile,
      });
      const t = shareResultToast(result);
      if (t.ok) toast.success(t.msg, { duration: t.duration });
      else toast.error(t.msg, { duration: t.duration });
      qc.invalidateQueries({ queryKey: ["bill", id] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to share invoice");
    } finally {
      setSendingWa(false);
      setShareOpen(false);
    }
  };

  const handleConfirmSms = async () => {
    setSendingSms(true);
    try {
      await sendSmsFn({ data: { id } });
      toast.success("SMS sent");
      qc.invalidateQueries({ queryKey: ["bill", id] });
    } catch (e: any) {
      toast.error(e?.message || "SMS sending failed");
    } finally {
      setSendingSms(false);
      setSmsOpen(false);
    }
  };



  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { if (from) navigate({ to: from as any, search: fromPage ? { page: fromPage } : {} as any }); else if (window.history.length > 1) router.history.back(); else navigate({ to: "/bills" }); }} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {bill.bill_no}
              <Badge
                variant={
                  bill.status === "FINALIZED"
                    ? "default"
                    : bill.status === "CANCELLED"
                      ? "destructive"
                      : "secondary"
                }
              >
                {bill.status}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {bill.bill_date} · Month {String(bill.billing_month).slice(0, 7)}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" title="Preview" aria-label="Preview bill" asChild>
            <Link to="/bills/$id/print" params={{ id }}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="icon" title="Download PDF" aria-label="Download bill as PDF" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          {bill.status === "FINALIZED" && (
            <Button variant="outline" size="icon" title="WhatsApp" aria-label="Send bill via WhatsApp" onClick={() => setShareOpen(true)} disabled={sendingWa} className="text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10 border-[#25D366]/30">
              {sendingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppSendIcon size={18} />}
            </Button>
          )}
          {bill.status === "FINALIZED" && (
            <Button variant="outline" size="icon" title="Send SMS" aria-label="Send bill via SMS" onClick={() => setSmsOpen(true)} disabled={sendingSms} className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 border-blue-500/30">
              {sendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            </Button>
          )}
          {bill.status === "FINALIZED" && (
            <Button
              variant="outline"
              size="icon"
              title="Send bKash payment link via SMS"
              aria-label="Send bKash payment link via SMS"
              disabled={sendingPayLink}
              onClick={async () => {
                setSendingPayLink(true);
                try {
                  const r = await sendPayLinkFn({ data: { bill_id: id } });
                  if (r.ok) toast.success("Payment link SMS sent");
                  else toast.error(`SMS failed: ${r.response}`);
                } catch (e: any) {
                  toast.error(e?.message || "Failed to send payment link");
                } finally {
                  setSendingPayLink(false);
                }
              }}
              className="text-[#e2136e] hover:text-[#c41262] hover:bg-[#e2136e]/10 border-[#e2136e]/30"
            >
              {sendingPayLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            </Button>
          )}
          {data.is_latest && bill.status !== "CANCELLED" && (
            <Button variant="outline" size="icon" title="Edit" aria-label="Edit bill" asChild>
              <Link to="/bills/new" search={{ editId: id }}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {bill.status === "DRAFT" && (
            <Button size="icon" title="Finalize" aria-label="Finalize bill" onClick={handleFinalize}>
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          {bill.status !== "CANCELLED" && (
            <Button variant="destructive" size="icon" title="Cancel" aria-label="Cancel bill" onClick={handleCancel}>
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          {isAdmin && (
            <Button variant="destructive" size="icon" title="Delete" aria-label="Delete bill" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <div className="font-medium">{bill.customer?.company_name || bill.customer?.name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">BIN</div>
            <div className="font-mono">{bill.customer?.bin_number || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Mobile</div>
            <div>{bill.customer?.mobile || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Area</div>
            <div>{bill.customer?.area?.area_name || "-"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Service Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items as BillLineItem[]).map((it, idx) => (
                <TableRow key={it.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>{it.service?.item_name}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(it.qty)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(it.final_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm max-w-md ml-auto">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Previous Balance</span>
            <span
              className={`font-mono ${bill.previous_balance < 0 ? "text-destructive" : bill.previous_balance > 0 ? "text-green-600" : ""}`}
            >
              {bill.previous_balance < 0
                ? `-${fmt(-bill.previous_balance)}`
                : fmt(bill.previous_balance)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current Bill</span>
            <span className="font-mono">{fmt(bill.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-mono">{fmt(bill.discount_amount)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Grand Total</span>
            <span className="font-mono">{fmt(bill.grand_total)}</span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={shareOpen} onOpenChange={setShareOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send via WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice JPG will be created and shared on WhatsApp for client <strong>{bill.customer?.company_name || bill.customer?.name}</strong> ({bill.customer?.mobile || "No mobile"}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingWa}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmShare} disabled={sendingWa}>
              {sendingWa ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <WhatsAppSendIcon size={16} className="mr-1" />}
              Yes, send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={smsOpen} onOpenChange={setSmsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send via SMS?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice SMS will be sent to client <strong>{bill.customer?.company_name || bill.customer?.name}</strong> ({bill.customer?.mobile || "No mobile"}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingSms}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSms} disabled={sendingSms}>
              {sendingSms ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              Yes, send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

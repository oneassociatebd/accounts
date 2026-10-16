import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getCollection,
  getReceiptData,
  cancelCollection,
  deleteCollection,
} from "@/lib/collection.functions";
import { getCollectionShareInfo, sendCollectionSms } from "@/lib/whatsapp.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Download, Printer, Eye, Pencil, XCircle, Trash2, Loader2, MessageSquare } from "lucide-react";
import { WhatsAppSendIcon } from "@/components/whatsapp-icon";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/collections/$id")({
  head: () => ({
    meta: [{ title: "One | Collection Details" }],
  }),
  component: CollectionView,
});

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket",
  BANK: "Bank Transfer", CHEQUE: "Cheque", OTHER: "Other",
};
const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);

function CollectionView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const get = useServerFn(getCollection);
  const getReceipt = useServerFn(getReceiptData);
  const cancel = useServerFn(cancelCollection);
  const remove = useServerFn(deleteCollection);
  const shareInfo = useServerFn(getCollectionShareInfo);
  const sendSms = useServerFn(sendCollectionSms);

  const [busy, setBusy] = useState<"download" | "print" | "view" | null>(null);
  const [sendingWa, setSendingWa] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => get({ data: { id } }),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const c: any = data.collection;
  const allocs = (data as any).allocations || [];

  const handleErr = (e: any) => {
    const msg = typeof e?.message === "string" ? e.message : String(e ?? "Failed");
    toast.error(msg);
  };

  const handlePdf = async (mode: "download" | "print" | "view") => {
    setBusy(mode);
    try {
      const [r, { buildMemoPdf }] = await Promise.all([
        getReceipt({ data: { id } }),
        import("@/lib/memo-pdf"),
      ]);
      await buildMemoPdf({
        collection: r.collection as any,
        company: (r as any).company,
        previous_balance: Number((r as any).previous_due ?? 0),
      }, mode, mode === "view" ? { onWhatsApp: handleConfirmShare } : {});
      if (mode === "download") toast.success("Memo downloaded");
    } catch (e) { handleErr(e); }
    finally { setBusy(null); }
  };


  const handleConfirmShare = async () => {
    setSendingWa(true);
    try {
      const [info, r, memoMod, shareMod] = await Promise.all([
        shareInfo({ data: { id } }),
        getReceipt({ data: { id } }),
        import("@/lib/memo-pdf"),
        import("@/lib/share-bill-jpg"),
      ]);

      const { blob, filename } = await memoMod.buildReceiptJpgBlob({
        collection: r.collection as any,
        company: (r as any).company,
        previous_balance: Number((r as any).previous_due ?? 0),
      });

      const result = await shareMod.shareBillJpgViaWhatsApp({
        blob,
        filename,
        mobile: info.mobile,
      });
      const t = shareMod.shareResultToast(result);
      if (t.ok) toast.success(t.msg, { duration: t.duration });
      else toast.error(t.msg, { duration: t.duration });
      qc.invalidateQueries({ queryKey: ["collection", id] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to prepare receipt share");
    } finally {
      setSendingWa(false);
      setShareOpen(false);
    }
  };



  const handleConfirmSms = async () => {
    setSendingSms(true);
    try {
      await sendSms({ data: { id } });
      toast.success("SMS sent");
      qc.invalidateQueries({ queryKey: ["collection", id] });
    } catch (e: any) {
      toast.error(e?.message || "SMS sending failed");
    } finally {
      setSendingSms(false);
      setSmsOpen(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this collection?")) return;
    try {
      await cancel({ data: { id } });
      toast.success("Collection cancelled");
      qc.invalidateQueries({ queryKey: ["collection", id] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["dash-bs"] });
      qc.invalidateQueries({ queryKey: ["balance-sheet"] });
    } catch (e) { handleErr(e); }
  };
  const handleDelete = async () => {
    if (!confirm(`Delete collection ${c.receipt_no}? This cannot be undone.`)) return;
    try {
      await remove({ data: { id } });
      toast.success("Collection deleted");
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["dash-bs"] });
      qc.invalidateQueries({ queryKey: ["balance-sheet"] });
      navigate({ to: "/collections" });
    } catch (e) { handleErr(e); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/collections" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {c.receipt_no}
              <Badge variant={c.status === "ACTIVE" ? "default" : "destructive"}>{c.status}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {c.collection_date} · {PAYMENT_LABELS[c.payment_method] ?? c.payment_method}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" title="View Receipt" onClick={() => handlePdf("view")} disabled={busy !== null}>
            {busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" title="Print" onClick={() => handlePdf("print")} disabled={busy !== null}>
            {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" title="Download PDF" onClick={() => handlePdf("download")} disabled={busy !== null}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          {c.status === "ACTIVE" && (
            <Button variant="outline" size="icon" title="WhatsApp" onClick={() => setShareOpen(true)} disabled={sendingWa} className="text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10 border-[#25D366]/30">
              {sendingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppSendIcon size={18} />}
            </Button>
          )}
          {c.status === "ACTIVE" && (
            <Button variant="outline" size="icon" title="Send SMS" onClick={() => setSmsOpen(true)} disabled={sendingSms} className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 border-blue-500/30">
              {sendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            </Button>
          )}
          {isAdmin && c.status === "ACTIVE" && data.is_latest && (
            <>
              <Button variant="outline" size="icon" title="Edit" onClick={() => navigate({ to: "/collections/new", search: { editId: id } })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" title="Cancel" onClick={handleCancel}>
                <XCircle className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" title="Delete" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <div className="font-medium">{c.customer?.company_name || c.customer?.name || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">BIN</div>
            <div className="font-mono">{c.customer?.bin_number || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Mobile</div>
            <div>{c.customer?.mobile || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Area</div>
            <div>{c.customer?.area?.area_name || "-"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment Details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Amount</div>
            <div className="font-mono text-lg font-semibold">{fmt(c.amount)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Method</div>
            <div>{PAYMENT_LABELS[c.payment_method] ?? c.payment_method}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Reference</div>
            <div>{c.reference_no || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Collected By</div>
            <div>{c.collector?.name || "-"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-muted-foreground">Notes</div>
            <div className="whitespace-pre-wrap">{c.notes || "-"}</div>
          </div>
        </CardContent>
      </Card>

      {allocs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Allocated to Bills</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Invoice</th><th className="py-2">Month</th>
                <th className="py-2 text-right">Allocated</th>
              </tr></thead>
              <tbody>
                {allocs.map((a: any) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-2 font-mono">{a.bill?.bill_no || "-"}</td>
                    <td className="py-2">{a.bill?.billing_month ? String(a.bill.billing_month).slice(0, 7) : "-"}</td>
                    <td className="py-2 text-right font-mono">{fmt(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={shareOpen} onOpenChange={setShareOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send via WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              A chat will be opened in WhatsApp Web for client <strong>{c.customer?.company_name || c.customer?.name}</strong> ({c.customer?.mobile || "No mobile"}). Clicking Yes will open WhatsApp in a new tab — just click the Send button.
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
              Receipt SMS will be sent to client <strong>{c.customer?.company_name || c.customer?.name}</strong> ({c.customer?.mobile || "No mobile"}).
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

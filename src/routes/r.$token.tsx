import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicBill } from "@/lib/whatsapp.functions";
import { Loader2, Printer } from "lucide-react";

export const Route = createFileRoute("/r/$token")({
  component: PublicReceiptPage,
  head: () => ({
    meta: [
      { title: "Receipt — One Associate" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function PublicReceiptPage() {
  const { token } = Route.useParams();
  const fetchBill = useServerFn(getPublicBill);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-bill", token],
    queryFn: () => fetchBill({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data || !data.found) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-semibold">Receipt not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This receipt link is invalid, expired, or the bill has been cancelled.
          </p>
        </div>
      </div>
    );
  }

  const { bill, items, company } = data;
  const customer: any = (bill as any).customer || {};
  const customerName = customer.company_name || customer.name || "—";

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 print:p-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Toolbar (hidden in print) */}
      <div className="no-print max-w-[320px] mx-auto mb-3 flex justify-end gap-2">
        <PayWithBkashButton token={token} status={bill.status} />
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>

      <div
        className="mx-auto bg-white text-black shadow-sm print:shadow-none"
        style={{
          width: "320px",
          padding: "16px 14px",
          fontFamily: "ui-monospace, 'Courier New', monospace",
          fontSize: "12px",
          lineHeight: "1.5",
        }}
      >
        {/* Header */}
        <div className="text-center mb-3">
          {company?.logo_url && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={company.logo_url}
              style={{ maxHeight: 48, margin: "0 auto 6px" }}
            />
          )}
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {company?.company_name || "One Associate"}
          </div>
          {company?.address && <div style={{ fontSize: 11 }}>{company.address}</div>}
          {(company?.phone || company?.email) && (
            <div style={{ fontSize: 11 }}>
              {[company.phone, company.email].filter(Boolean).join(" · ")}
            </div>
          )}
          {company?.bin_number && (
            <div style={{ fontSize: 11 }}>BIN: {company.bin_number}</div>
          )}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Bill meta */}
        <div style={{ fontSize: 11 }}>
          <div className="flex justify-between">
            <span>Invoice:</span>
            <span style={{ fontWeight: 600 }}>{bill.bill_no}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{bill.bill_date}</span>
          </div>
          <div className="flex justify-between">
            <span>Month:</span>
            <span>{String(bill.billing_month).slice(0, 7)}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Customer */}
        <div style={{ fontSize: 11 }}>
          <div style={{ fontWeight: 600 }}>Bill To:</div>
          <div>{customerName}</div>
          {customer.bin_number && <div>BIN: {customer.bin_number}</div>}
          {customer.mobile && <div>Mob: {customer.mobile}</div>}
          {customer.area?.area_name && <div>Area: {customer.area.area_name}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Items */}
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", padding: "2px 0" }}>Item</th>
              <th style={{ textAlign: "right", padding: "2px 0", width: 40 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "2px 0", width: 70 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any, idx: number) => (
              <tr key={idx}>
                <td style={{ padding: "3px 0", verticalAlign: "top" }}>
                  {it.service?.item_name || "—"}
                </td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{fmt(it.qty)}</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>
                  {fmt(it.final_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Summary */}
        <div style={{ fontSize: 11 }}>
          <div className="flex justify-between">
            <span>Previous Balance:</span>
            <span>
              {bill.previous_balance < 0
                ? `-${fmt(-bill.previous_balance)}`
                : fmt(bill.previous_balance)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Current Bill:</span>
            <span>{fmt(bill.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>{fmt(bill.discount_amount)}</span>
          </div>
          <div
            className="flex justify-between"
            style={{
              borderTop: "1px solid #000",
              paddingTop: 4,
              marginTop: 4,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span>Grand Total:</span>
            <span>Tk {fmt(bill.grand_total)}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        <div style={{ textAlign: "center", fontSize: 11 }}>
          {company?.invoice_footer_text || "Thank you for your business"}
        </div>
      </div>
    </div>
  );
}

function PayWithBkashButton({ token, status }: { token: string; status: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status !== "FINALIZED") return null;

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/bkash/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.bkashURL) {
        setError(json?.error || "Payment unavailable");
        return;
      }
      window.location.href = json.bkashURL;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-md bg-[#e2136e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c41262] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Pay with bKash
      </button>
      {error ? <span className="text-[10px] text-red-600 max-w-[220px] text-right">{error}</span> : null}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executePayment, BkashError } from "@/lib/bkash.server";

// bKash redirects the customer here after they finish (success/cancel/failure).
// We execute the payment, record a Collection on success, and redirect to the
// public result page.
export const Route = createFileRoute("/api/public/bkash/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const paymentID = url.searchParams.get("paymentID") || "";
        const status = url.searchParams.get("status") || "";
        const token = url.searchParams.get("token") || "";
        const origin = url.origin;
        const resultUrl = (s: "success" | "failed" | "cancelled") =>
          `${origin}/r/${encodeURIComponent(token)}/result?status=${s}`;

        if (!paymentID) {
          return Response.redirect(resultUrl("failed"), 302);
        }

        // Look up our tracking row.
        const { data: row } = await supabaseAdmin
          .from("bkash_payments")
          .select("id, bill_id, customer_id, amount, status")
          .eq("payment_id", paymentID)
          .maybeSingle();
        if (!row) return Response.redirect(resultUrl("failed"), 302);

        // Idempotency: if we already settled, just bounce.
        if (row.status === "SUCCESS") {
          return Response.redirect(resultUrl("success"), 302);
        }

        if (status && status.toLowerCase() !== "success") {
          await supabaseAdmin
            .from("bkash_payments")
            .update({
              status: status.toLowerCase() === "cancel" ? "CANCELLED" : "FAILED",
              raw_response: { status } as any,
            })
            .eq("id", row.id);
          return Response.redirect(
            resultUrl(status.toLowerCase() === "cancel" ? "cancelled" : "failed"),
            302,
          );
        }

        try {
          const exec = await executePayment(paymentID);
          if (!exec.ok) {
            await supabaseAdmin
              .from("bkash_payments")
              .update({ status: "FAILED", raw_response: exec.raw as any })
              .eq("id", row.id);
            return Response.redirect(resultUrl("failed"), 302);
          }

          // Create a Collection + allocation for the bill.
          const amount = Math.round(Number(exec.amount ?? row.amount) * 100) / 100;
          const receiptNo = `BKASH-${exec.trxID ?? paymentID.slice(-8)}`;
          const { data: col, error: cErr } = await supabaseAdmin
            .from("collections")
            .insert({
              receipt_no: receiptNo,
              customer_id: row.customer_id,
              collection_date: new Date().toISOString().slice(0, 10),
              amount,
              payment_method: "BKASH",
              reference_no: exec.trxID ?? paymentID,
              notes: "Auto-collected via bKash Checkout",
            })
            .select("id")
            .single();
          if (cErr || !col) {
            await supabaseAdmin
              .from("bkash_payments")
              .update({
                status: "FAILED",
                raw_response: { exec: exec.raw, error: cErr?.message } as any,
              })
              .eq("id", row.id);
            return Response.redirect(resultUrl("failed"), 302);
          }

          await supabaseAdmin.from("collection_allocations").insert({
            collection_id: col.id,
            bill_id: row.bill_id,
            amount,
          });

          await supabaseAdmin
            .from("bkash_payments")
            .update({
              status: "SUCCESS",
              trx_id: exec.trxID ?? null,
              collection_id: col.id,
              raw_response: exec.raw as any,
            })
            .eq("id", row.id);

          return Response.redirect(resultUrl("success"), 302);
        } catch (e: unknown) {
          const details = e instanceof BkashError ? { code: e.code, message: e.message, details: e.details } : { message: String(e) };
          await supabaseAdmin
            .from("bkash_payments")
            .update({ status: "FAILED", raw_response: details as any })
            .eq("id", row.id);
          return Response.redirect(resultUrl("failed"), 302);
        }
      },
    },
  },
});

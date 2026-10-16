import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPayment, BkashError } from "@/lib/bkash.server";

export const Route = createFileRoute("/api/public/bkash/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const token = typeof body?.token === "string" ? body.token : "";
        if (!token || token.length > 64) {
          return Response.json({ error: "Invalid token" }, { status: 400 });
        }

        // Resolve bill by public token (server-side, bypassing RLS).
        const { data: bill, error } = await supabaseAdmin
          .from("bills")
          .select("id, bill_no, status, grand_total, customer_id")
          .eq("public_token", token)
          .maybeSingle();
        if (error || !bill) {
          return Response.json({ error: "Bill not found" }, { status: 404 });
        }
        if (bill.status !== "FINALIZED") {
          return Response.json({ error: "Bill not payable" }, { status: 400 });
        }

        // Compute outstanding (grand_total - allocations).
        const { data: allocs } = await supabaseAdmin
          .from("collection_allocations")
          .select("amount, collection:collections(status)")
          .eq("bill_id", bill.id);
        const paid = (allocs ?? [])
          .filter((a: any) => a.collection?.status !== "CANCELLED")
          .reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
        const due = Math.max(0, Number(bill.grand_total || 0) - paid);
        if (due <= 0) {
          return Response.json({ error: "Bill is already paid" }, { status: 400 });
        }

        const origin = new URL(request.url).origin;
        const callbackURL = `${origin}/api/public/bkash/callback?token=${encodeURIComponent(token)}`;

        try {
          const result = await createPayment({
            amount: Math.round(due * 100) / 100,
            invoiceNumber: bill.bill_no,
            callbackURL,
          });
          await supabaseAdmin.from("bkash_payments").insert({
            bill_id: bill.id,
            customer_id: bill.customer_id,
            amount: Math.round(due * 100) / 100,
            payment_id: result.paymentID,
            bkash_url: result.bkashURL,
            status: "INITIATED",
            raw_response: result.raw as any,
          });
          return Response.json({ bkashURL: result.bkashURL, paymentID: result.paymentID });
        } catch (e: unknown) {
          if (e instanceof BkashError) {
            return Response.json({ error: e.message, code: e.code }, { status: e.status });
          }
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});

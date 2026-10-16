import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Search = { status?: "success" | "failed" | "cancelled" };

export const Route = createFileRoute("/r/$token/result")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: (s.status as Search["status"]) || "failed",
  }),
  head: () => ({
    meta: [
      { title: "Payment Result — One Associate" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { token } = Route.useParams();
  const { status } = Route.useSearch();
  const ok = status === "success";
  const cancelled = status === "cancelled";

  const Icon = ok ? CheckCircle2 : cancelled ? AlertCircle : XCircle;
  const color = ok ? "text-green-600" : cancelled ? "text-amber-600" : "text-red-600";
  const title = ok
    ? "Payment Successful"
    : cancelled
      ? "Payment Cancelled"
      : "Payment Failed";
  const msg = ok
    ? "Your bKash payment has been received. Thank you."
    : cancelled
      ? "You cancelled the payment. You can try again anytime."
      : "We couldn't complete your bKash payment. Please try again or contact us.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="bg-card border rounded-lg shadow-sm max-w-sm w-full p-6 text-center">
        <Icon className={`h-12 w-12 mx-auto ${color}`} />
        <h1 className="mt-3 text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{msg}</p>
        <div className="mt-5">
          <Link
            to="/r/$token"
            params={{ token }}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View Bill
          </Link>
        </div>
      </div>
    </div>
  );
}

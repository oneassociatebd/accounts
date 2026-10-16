import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, RefreshCw, ShoppingCart, ExternalLink, Copy } from "lucide-react";
import { getSmsBalance } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

// BulkSMSBD recharge details. Edit here if account / pricing changes.
const BULKSMSBD_LOGIN_URL = "https://bulksmsbd.net/login";
const BULKSMSBD_PRICING_URL = "https://bulksmsbd.net/pricing";
const RECHARGE_BKASH = "01719950891";
const RECHARGE_NAGAD = "01700-000000"; // TODO: replace with real Nagad number
const SUPPORT_PHONE = "+880 1XXXXXXXXX";

export function SmsBalanceBadge() {
  const fetchBalance = useServerFn(getSmsBalance);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sms-balance"],
    queryFn: () => fetchBalance(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const label = isLoading
    ? "..."
    : data?.ok
      ? `৳ ${data.balance.toFixed(2)}`
      : "—";

  const title = data?.ok
    ? `SMS Balance: ৳ ${data.balance.toFixed(2)}`
    : data?.reason || "SMS balance unavailable";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div
      className="hidden sm:flex items-center gap-1 h-8 px-2.5 rounded-md border bg-muted/40 text-xs font-medium"
      title={title}
    >
      <MessageSquare className="h-3.5 w-3.5 text-primary" />
      <span className="text-foreground/90">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        onClick={() => refetch()}
        title="Refresh"
      >
        <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-5 w-5" title="Buy SMS">
            <ShoppingCart className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Recharge SMS Balance</p>
            <p className="text-xs text-muted-foreground">
              Recharge your BulkSMSBD account to send more SMS.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-muted-foreground">bKash (Send Money)</p>
                <p className="font-mono font-medium">{RECHARGE_BKASH}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(RECHARGE_BKASH, "bKash number")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-muted-foreground">Nagad (Send Money)</p>
                <p className="font-mono font-medium">{RECHARGE_NAGAD}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(RECHARGE_NAGAD, "Nagad number")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            After sending money, share the transaction ID with BulkSMSBD support
            ({SUPPORT_PHONE}). Balance is usually credited within a few minutes.
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild variant="default" size="sm" className="w-full">
              <a href={BULKSMSBD_LOGIN_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open BulkSMSBD Portal
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={BULKSMSBD_PRICING_URL} target="_blank" rel="noopener noreferrer">
                View Pricing
              </a>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

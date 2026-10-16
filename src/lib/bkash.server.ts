// bKash Tokenized Checkout helpers (sandbox + production).
// Reads merchant credentials from `company_settings` and secrets:
//   - company_settings.bkash_api_key       (App Key)
//   - company_settings.bkash_secret_key    (App Secret)
//   - process.env.BKASH_USERNAME           (Merchant username)
//   - process.env.BKASH_PASSWORD           (Merchant password)
//   - process.env.BKASH_BASE_URL           (optional override; default sandbox)
//
// If any credential is missing the helpers throw with `code: "bkash_not_configured"`
// and the public routes translate that into HTTP 503.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

export class BkashError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type BkashConfig = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
};

export async function loadBkashConfig(): Promise<BkashConfig> {
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("bkash_api_key, bkash_secret_key")
    .limit(1)
    .maybeSingle();

  const username = process.env.BKASH_USERNAME;
  const password = process.env.BKASH_PASSWORD;
  const baseUrl = process.env.BKASH_BASE_URL || SANDBOX_BASE;
  const appKey = settings?.bkash_api_key || "";
  const appSecret = settings?.bkash_secret_key || "";

  const missing: string[] = [];
  if (!appKey) missing.push("App Key (Company Settings → bKash API Key)");
  if (!appSecret) missing.push("App Secret (Company Settings → bKash Secret Key)");
  if (!username) missing.push("BKASH_USERNAME (secret)");
  if (!password) missing.push("BKASH_PASSWORD (secret)");
  if (missing.length) {
    throw new BkashError(
      "bkash_not_configured",
      `bKash is not configured. Missing: ${missing.join(", ")}`,
      503,
    );
  }
  return { baseUrl, appKey, appSecret, username: username!, password: password! };
}

async function grantToken(cfg: BkashConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: cfg.username,
      password: cfg.password,
    },
    body: JSON.stringify({ app_key: cfg.appKey, app_secret: cfg.appSecret }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || !json?.id_token) {
    throw new BkashError("bkash_token_failed", "Failed to obtain bKash token", 502, json);
  }
  return json.id_token as string;
}

export type CreatePaymentInput = {
  amount: number;
  invoiceNumber: string;
  callbackURL: string;
  payerReference?: string;
};

export type CreatePaymentResult = {
  paymentID: string;
  bkashURL: string;
  raw: unknown;
};

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const cfg = await loadBkashConfig();
  const token = await grantToken(cfg);
  const body = {
    mode: "0011",
    payerReference: input.payerReference || input.invoiceNumber,
    callbackURL: input.callbackURL,
    amount: input.amount.toFixed(2),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: input.invoiceNumber,
  };
  const res = await fetch(`${cfg.baseUrl}/tokenized/checkout/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": cfg.appKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || !json?.paymentID || !json?.bkashURL) {
    throw new BkashError("bkash_create_failed", json?.statusMessage || "bKash create payment failed", 502, json);
  }
  return { paymentID: json.paymentID, bkashURL: json.bkashURL, raw: json };
}

export type ExecuteResult = {
  ok: boolean;
  paymentID: string;
  trxID?: string;
  amount?: number;
  transactionStatus?: string;
  raw: unknown;
};

export async function executePayment(paymentID: string): Promise<ExecuteResult> {
  const cfg = await loadBkashConfig();
  const token = await grantToken(cfg);
  const res = await fetch(`${cfg.baseUrl}/tokenized/checkout/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": cfg.appKey,
    },
    body: JSON.stringify({ paymentID }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  const ok = res.ok && json?.statusCode === "0000" && json?.transactionStatus === "Completed";
  return {
    ok,
    paymentID: json?.paymentID || paymentID,
    trxID: json?.trxID,
    amount: json?.amount ? Number(json.amount) : undefined,
    transactionStatus: json?.transactionStatus,
    raw: json,
  };
}

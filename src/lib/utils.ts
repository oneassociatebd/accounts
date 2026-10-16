import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extracts the 10-digit BD subscriber part (starts with 1) from messy input.
// Handles: 01XXXXXXXXX, 8801XXXXXXXXX, +8801XXXXXXXXX, 88001XXXXXXXXX (typo),
// 008801XXXXXXXXX, etc. Returns null if no full 10-digit subscriber is present.
function extractBdSubscriber(raw: string): string | null {
  let d = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!d) return null;
  // Strip leading "00" (international 00) repeatedly
  while (d.startsWith("00")) d = d.slice(1);
  // Strip leading country code 880 / 88
  if (d.startsWith("880")) d = d.slice(3);
  else if (d.startsWith("88")) d = d.slice(2);
  // Strip any leading zeros (handles "01..." and accidental "001...")
  d = d.replace(/^0+/, "");
  // d should now be 10 digits starting with 1 (BD mobile: 1XYXXXXXXXX)
  if (/^1\d{9}$/.test(d)) return d;
  return null;
}

// Auto-format BD mobile (SMS) to 01XXXXXXXXX (11 digits, local format).
// BulkSMSBD accepts this format directly. Returns formatted value when a full
// subscriber is detected, otherwise returns the trimmed input as-is.
export function formatBdSmsMobile(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const sub = extractBdSubscriber(trimmed);
  if (sub) return "0" + sub;
  return trimmed;
}

// Auto-format BD WhatsApp number to +8801XXXXXXXXX (14 chars)
export function formatBdWhatsappMobile(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const sub = extractBdSubscriber(trimmed);
  if (sub) return "+880" + sub;
  return trimmed;
}

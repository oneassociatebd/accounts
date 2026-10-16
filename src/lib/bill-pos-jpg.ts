// Builds a POS-style 80mm invoice JPG blob for a bill — used by the
// WhatsApp share button on the bill detail page and the POS-mode view
// on the print preview.

import { format, parseISO } from "date-fns";

type BillItem = {
  qty: number | string | null;
  final_amount: number | string | null;
  service?: { item_name?: string | null } | null;
};

type BillData = {
  bill: {
    bill_no: string;
    bill_date?: string | null;
    billing_month?: string | null;
    subtotal?: number | string | null;
    previous_balance?: number | string | null;
    discount_amount?: number | string | null;
    status?: string | null;
    customer?: {
      company_name?: string | null;
      name?: string | null;
      bin_number?: string | null;
      mobile?: string | null;
    } | null;
  };
  items: BillItem[];
  company?: {
    company_name?: string | null;
    address?: string | null;
    phone?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_branch?: string | null;
  } | null;
};

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeDate(s: string | null | undefined, f: string) {
  if (!s) return "";
  try {
    return format(parseISO(String(s)), f);
  } catch {
    return String(s);
  }
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function below1000(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + below1000(n % 100) : "");
  }
  const negative = num < 0;
  num = Math.abs(num);
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let words = "";
  const crore = Math.floor(intPart / 10000000);
  const lakh = Math.floor((intPart % 10000000) / 100000);
  const thousand = Math.floor((intPart % 100000) / 1000);
  const rest = intPart % 1000;
  if (crore) words += below1000(crore) + " Crore ";
  if (lakh) words += below1000(lakh) + " Lakh ";
  if (thousand) words += below1000(thousand) + " Thousand ";
  if (rest) words += below1000(rest);
  words = words.trim() || "Zero";
  if (decPart > 0) {
    const dec = decPart < 10
      ? "Zero " + ones[decPart]
      : decPart < 20 ? ones[decPart]
      : tens[Math.floor(decPart / 10)] + (decPart % 10 ? " " + ones[decPart % 10] : "");
    words += " Point " + dec;
  }
  return (negative ? "Minus " : "") + words;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildBillPosHtml(data: BillData): string {
  const bill = data.bill;
  const items = data.items || [];
  const company = data.company;
  const subtotal = Number(bill.subtotal || 0);
  const prevBal = Number(bill.previous_balance || 0);
  const prevDue = prevBal < 0 ? -prevBal : 0;
  const prevAdv = prevBal > 0 ? prevBal : 0;
  const payable = subtotal + prevDue;
  const discount = Number(bill.discount_amount || 0);
  const netPayable = Math.max(0, payable - discount - prevAdv);
  const billDate = bill.bill_date ? safeDate(bill.bill_date, "dd-MMM-yyyy") : "";
  const payToName = company?.company_name || "One Associate";
  const payToAccountNo = company?.bank_account_number || "3487901003900";
  const payToBank = company?.bank_name || "Pubali Bank PLC";
  const payToBranch = company?.bank_branch || "Dargah Gate Islamic";
  const invoiceDisplay = /\/\d{4}$/.test(bill.bill_no)
    ? bill.bill_no
    : `${bill.bill_no}/${bill.bill_date ? String(bill.bill_date).slice(0, 4) : new Date().getFullYear()}`;
  const customerName = (bill.customer?.company_name || bill.customer?.name || "-").toUpperCase();

  const itemsHtml = items
    .map(
      (it, idx) => `
        <div class="item">
          <div class="item-top"><span class="idx">${idx + 1}.</span><span class="name">${esc(it.service?.item_name || "-")}</span></div>
          <div class="item-bot"><span>Qty: ${esc(Number(it.qty || 0))}</span><span>${esc(fmt(it.final_amount))}</span></div>
        </div>`,
    )
    .join("");

  const summaryRows: Array<[string, string, boolean?]> = [
    ["Subtotal", fmt(subtotal)],
    ["Previous Balance", prevBal < 0 ? `-${fmt(prevDue)}` : fmt(prevAdv)],
    ["Payable", fmt(payable)],
    ["Discount", fmt(discount)],
    ["Net Payable", fmt(netPayable), true],
  ];

  return `
    <div class="paper">
      ${company?.company_name ? `<div class="center company">${esc(company.company_name)}</div>` : ""}
      ${company?.address ? `<div class="center muted">${esc(company.address)}</div>` : ""}
      ${company?.phone ? `<div class="center muted">Mobile: ${esc(company.phone)}</div>` : ""}
      <div class="dash"></div>
      <div class="center title">INVOICE</div>
      <div class="center receipt-no">${esc(invoiceDisplay)}</div>
      <div class="center date">Date: ${esc(billDate || "-")}</div>
      <div class="dash"></div>
      <div class="section">BILL TO</div>
      <div class="customer">${esc(customerName)}</div>
      ${bill.customer?.bin_number ? `<div>BIN: ${esc(bill.customer.bin_number)}</div>` : ""}
      ${bill.customer?.mobile ? `<div>Mobile: ${esc(bill.customer.mobile)}</div>` : ""}
      ${bill.billing_month ? `<div>Tax Period: ${esc(safeDate(String(bill.billing_month), "MMM yyyy"))}</div>` : ""}
      <div class="dash"></div>
      <div class="section">ITEMS</div>
      ${itemsHtml || `<div class="muted">No items</div>`}
      <div class="dash"></div>
      ${summaryRows
        .map(
          ([l, v, b]) =>
            `<div class="row ${b ? "strong" : ""}"><span>${esc(l)}</span><span>${esc(v)}</span></div>`,
        )
        .join("")}
      <div class="dash"></div>
      <div class="center words">In Words:<br/>${esc(numberToWords(netPayable))} Tk Only</div>
      <div class="dash"></div>
      <div class="pay-to">
        <div class="section">Please Pay to:</div>
        <div>A/C Name: ${esc(payToName)}</div>
        <div>A/C No: ${esc(payToAccountNo)}</div>
        <div>Bank: ${esc(payToBank)}</div>
        <div>Branch: ${esc(payToBranch)}</div>
      </div>
      <div class="dash"></div>
      <div class="center thanks">${bill.status === "CANCELLED" ? "** CANCELLED **" : "THANK YOU"}</div>
      <div class="bottom-space"></div>
    </div>
  `;
}

export function billPosStyles(): string {
  // Force-override inherited oklch tokens — html2canvas can't parse oklch.
  return `
    .pos-cap, .pos-cap * {
      color: #111111 !important;
      background-color: transparent !important;
      background-image: none !important;
      border-color: #111111 !important;
      outline-color: #111111 !important;
      text-decoration-color: #111111 !important;
      caret-color: #111111 !important;
      fill: #111111 !important;
      stroke: #111111 !important;
      box-shadow: none !important;
    }
    .pos-cap { background-color: #ffffff !important; width: 80mm; padding: 4mm; font-family: Courier,"Courier New",monospace; font-size: 9pt; line-height: 1.3; overflow-wrap: anywhere; box-sizing: border-box; }
    .pos-cap *, .pos-cap *::before, .pos-cap *::after { box-sizing: border-box; }
    .pos-cap .paper { width: 100%; padding: 0; }
    .pos-cap .center { text-align: center; }
    .pos-cap .title { font-size: 12pt; font-weight: 700; letter-spacing: 2px; }
    .pos-cap .receipt-no { font-size: 8pt; font-weight: 700; }
    .pos-cap .company { font-size: 11pt; font-weight: 700; }
    .pos-cap .muted { font-size: 8pt; }
    .pos-cap .date { font-size: 9pt; }
    .pos-cap .section { font-size: 9pt; font-weight: 700; margin-top: 0.5mm; }
    .pos-cap .customer { font-size: 10pt; font-weight: 700; }
    .pos-cap .words { font-size: 8.5pt; font-style: italic; }
    .pos-cap .pay-to { font-size: 8.5pt; line-height: 1.35; }
    .pos-cap .thanks { font-size: 10pt; font-weight: 700; letter-spacing: 1px; }
    .pos-cap .dash { border-top: 1px dashed #111111 !important; margin: 1.5mm 0; }
    .pos-cap .row { display: flex; justify-content: space-between; gap: 4mm; }
    .pos-cap .row span:last-child { text-align: right; white-space: nowrap; }
    .pos-cap .strong { font-size: 10pt; font-weight: 700; }
    .pos-cap .item { margin-bottom: 1mm; }
    .pos-cap .item-top { display: flex; gap: 1mm; font-weight: 600; }
    .pos-cap .item-top .idx { flex: 0 0 auto; }
    .pos-cap .item-top .name { flex: 1; }
    .pos-cap .item-bot { display: flex; justify-content: space-between; padding-left: 4mm; font-size: 8.5pt; }
    .pos-cap .bottom-space { height: 6mm; }
  `;
}

export async function buildBillPosJpgBlob(data: BillData): Promise<{ blob: Blob; filename: string }> {
  const html = buildBillPosHtml(data);
  const styleNode = document.createElement("style");
  styleNode.textContent = billPosStyles();
  document.head.appendChild(styleNode);
  const host = document.createElement("div");
  host.className = "pos-cap";
  host.style.cssText = "position:fixed;left:-99999px;top:0;background:#ffffff;color:#111111;";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(host, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob failed"))), "image/jpeg", 0.92),
    );
    const filename = `${data.bill.bill_no.replace(/[/\\]/g, "-")}.jpg`;
    return { blob, filename };
  } finally {
    host.remove();
    styleNode.remove();
  }
}

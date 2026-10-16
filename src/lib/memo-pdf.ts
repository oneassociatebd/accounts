import { format, parseISO } from "date-fns";

export type MemoMode = "download" | "print" | "view";



type MemoPdfData = {
  collection: {
    receipt_no: string;
    collection_date?: string | null;
    amount?: number | string | null;
    payment_method?: string | null;
    reference_no?: string | null;
    notes?: string | null;
    status?: string | null;
    customer?: {
      company_name?: string | null;
      name?: string | null;
      bin_number?: string | null;
      mobile?: string | null;
      address?: string | null;
      area?: { area_name?: string | null } | null;
    } | null;
    collector?: { name?: string | null } | null;
  };
  company?: {
    company_name?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  previous_balance?: number;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket",
  BANK: "Bank Transfer", CHEQUE: "Cheque", OTHER: "Other",
};

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

function safeDate(s: string | null | undefined, f: string) {
  if (!s) return "";
  try { return format(parseISO(String(s)), f); } catch { return String(s); }
}

// ---- 80mm thermal receipt layout ----
const PAGE_W = 80; // mm
const MARGIN = 4;  // mm
const CONTENT_W = PAGE_W - MARGIN * 2; // 72mm

type Block =
  | { type: "text"; text: string; size: number; bold?: boolean; align?: "left" | "center" | "right" }
  | { type: "row"; left: string; right: string; size: number; bold?: boolean }
  | { type: "hr" }
  | { type: "space"; mm: number };

function lineHeightFor(size: number) {
  // mm per line (font size in pt; 1pt ≈ 0.3528mm; +small leading)
  return size * 0.3528 * 1.25;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stampColor(kind: "PAID" | "DUE" | "ADVANCE") {
  if (kind === "PAID") return "#15803d";
  if (kind === "ADVANCE") return "#1d4ed8";
  return "#b91c1c";
}

function buildStampSvg(kind: "PAID" | "DUE" | "ADVANCE", balance: number) {
  const color = stampColor(kind);
  const hasAmount = kind !== "PAID";
  const titleSize = 30;
  const titleY = hasAmount ? 48 : 60;
  const amountText = fmt(Math.abs(balance));

  return `
    <div class="stamp stamp-${kind.toLowerCase()}">
      <svg class="stamp-svg" viewBox="0 0 160 108" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${kind} stamp">
        <g transform="rotate(-15 80 54)">
          <rect x="8" y="20" width="144" height="68" rx="8" fill="none" stroke="${color}" stroke-width="2.5" />
          <rect x="15" y="27" width="130" height="54" rx="5" fill="none" stroke="${color}" stroke-width="1" />
          <text x="80" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-family="Courier, Courier New, monospace" font-size="${titleSize}" font-weight="900">${kind}</text>
          ${hasAmount ? `<text x="80" y="70" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-family="Courier, Courier New, monospace" font-size="18" font-weight="900">${escapeHtml(amountText)}</text>` : ""}
        </g>
      </svg>
    </div>`;
}

function buildReceiptHtml(data: MemoPdfData) {
  const c = data.collection;
  const co = data.company || {};
  const amount = Number(c.amount || 0);
  const prevBal = Number(data.previous_balance ?? 0);
  const balance = prevBal - amount;
  const balanceLabel = balance > 0.009 ? "Due" : balance < -0.009 ? "Advance" : "Settled";
  const prevLabel = prevBal < 0 ? "Previous Advance" : "Total Payable";
  const customerName = (c.customer?.company_name || c.customer?.name || "-").toUpperCase();
  const addr = [c.customer?.address, c.customer?.area?.area_name].filter(Boolean).join(", ");
  const method = PAYMENT_LABELS[String(c.payment_method)] ?? String(c.payment_method ?? "-");
  const rows = [
    { label: prevLabel, value: fmt(Math.abs(prevBal)) },
    { label: "Paid Amount", value: fmt(amount) },
    { label: `Balance (${balanceLabel})`, value: fmt(Math.abs(balance)), strong: true },
    { label: "Method", value: method },
    ...(c.reference_no ? [{ label: "Reference", value: c.reference_no }] : []),
    ...(c.collector?.name ? [{ label: "Collected By", value: c.collector.name }] : []),
  ];

  const isCancelled = c.status === "CANCELLED";
  const stampKind: "PAID" | "DUE" | "ADVANCE" | null = isCancelled
    ? null
    : Math.abs(balance) < 0.009
      ? "PAID"
      : balance > 0
        ? "DUE"
        : "ADVANCE";
  const stampHtml = stampKind ? buildStampSvg(stampKind, balance) : "";

  return `
    <div class="receipt-paper">
      <div class="center title">PAYMENT RECEIPT</div>
      <div class="center receipt-no">${escapeHtml(c.receipt_no)}</div>
      <div class="dash"></div>
      ${co.company_name ? `<div class="center company">${escapeHtml(co.company_name)}</div>` : ""}
      ${co.address ? `<div class="center muted">${escapeHtml(co.address)}</div>` : ""}
      ${co.phone ? `<div class="center muted">Mobile: ${escapeHtml(co.phone)}</div>` : ""}
      <div class="center date">Date: ${escapeHtml(safeDate(c.collection_date, "dd-MMM-yyyy") || "-")}</div>
      <div class="dash"></div>
      <div class="section">CLIENT</div>
      <div class="customer">${escapeHtml(customerName)}</div>
      ${c.customer?.bin_number ? `<div>BIN: ${escapeHtml(c.customer.bin_number)}</div>` : ""}
      ${c.customer?.mobile ? `<div>Mobile: ${escapeHtml(c.customer.mobile)}</div>` : ""}
      ${addr ? `<div>${escapeHtml(addr)}</div>` : ""}
      <div class="dash"></div>
      <div class="summary-wrap">
        ${stampHtml}
        <div class="section">ACCOUNT SUMMARY</div>
        ${rows.slice(0, 3).map((row) => `<div class="row ${row.strong ? "strong" : ""}"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`).join("")}
      </div>
      <div class="dash"></div>
      <div class="section">PAYMENT DETAILS</div>
      ${rows.slice(3).map((row) => `<div class="row"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`).join("")}
      ${c.notes ? `<div class="dash"></div><div>Note: ${escapeHtml(c.notes)}</div>` : ""}
      <div class="dash"></div>
      <div class="center thanks">${isCancelled ? "** CANCELLED **" : "RECEIVED WITH THANKS"}</div>
      <div class="bottom-space"></div>
    </div>
  `;
}


function receiptStyles() {
  return `
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f4f5; color: #111827; font-family: Courier, "Courier New", monospace; }
    .receipt-paper { position: relative; width: 80mm; min-height: 100mm; margin: 0 auto; padding: 4mm; background: #fff; color: #111; font-size: 9pt; line-height: 1.28; overflow-wrap: anywhere; }
    .center { text-align: center; }
    .title { font-size: 11pt; font-weight: 700; }
    .receipt-no { font-size: 10pt; font-weight: 700; }
    .company { font-size: 10pt; font-weight: 700; }
    .muted { font-size: 8pt; }
    .date { font-size: 9pt; }
    .section { font-size: 9pt; font-weight: 700; margin-top: 0.5mm; }
    .customer { font-size: 10pt; font-weight: 700; }
    .thanks { font-size: 9pt; font-weight: 700; }
    .dash { border-top: 1px dashed #111; margin: 1.5mm 0; }
    .row { display: flex; justify-content: space-between; gap: 4mm; }
    .row span:last-child { text-align: right; white-space: nowrap; }
    .strong { font-size: 10pt; font-weight: 700; }
    .bottom-space { height: 6mm; }
    .summary-wrap { position: relative; }
    .stamp { position: absolute; top: 50%; left: 50%; width: 34mm; height: 23mm; transform: translate(-50%, -50%); pointer-events: none; z-index: 10; opacity: 0.88; background: transparent; }
    .stamp-svg { display: block; width: 100%; height: 100%; overflow: visible; background: transparent; }
    @media print {
      body { background: #fff; }
      .receipt-paper { width: 72mm; margin: 0; padding: 0; box-shadow: none; }
    }
  `;
}


export type MemoOpts = {
  onWhatsApp?: () => Promise<void> | void;
};

export async function buildMemoPdf(
  data: MemoPdfData,
  modeOrPrint: MemoMode | boolean = "download",
  opts: MemoOpts = {},
) {
  const mode: MemoMode =
    typeof modeOrPrint === "boolean" ? (modeOrPrint ? "print" : "download") : modeOrPrint;

  const { jsPDF } = await import("jspdf");
  const c = data.collection;
  const co = data.company || {};
  const amount = Number(c.amount || 0);
  const prevBal = Number(data.previous_balance ?? 0);
  const balance = prevBal - amount; // positive => due, negative => advance
  const balanceLabel = balance > 0.009 ? "Due" : balance < -0.009 ? "Advance" : "Settled";
  const prevLabel = prevBal < 0 ? "Previous Advance" : "Total Payable";

  // First pass: measure with a temp pdf to wrap long strings
  const measure = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, 200] });
  measure.setFont("courier", "normal");

  const wrap = (text: string, size: number, bold = false): string[] => {
    measure.setFont("courier", bold ? "bold" : "normal");
    measure.setFontSize(size);
    return measure.splitTextToSize(String(text || ""), CONTENT_W) as string[];
  };

  const blocks: Block[] = [];
  const pushText = (text: string, size: number, opts: { bold?: boolean; align?: Block extends { align?: infer A } ? A : never } = {}) => {
    const lines = wrap(text, size, opts.bold);
    for (const ln of lines) blocks.push({ type: "text", text: ln, size, bold: opts.bold, align: (opts as any).align ?? "left" });
  };

  // Header
  pushText("PAYMENT RECEIPT", 11, { bold: true, align: "center" } as any);
  pushText(c.receipt_no, 10, { bold: true, align: "center" } as any);
  blocks.push({ type: "hr" });
  if (co.company_name) pushText(co.company_name, 10, { bold: true, align: "center" } as any);
  if (co.address) pushText(co.address, 8, { align: "center" } as any);
  if (co.phone) pushText(`Mobile: ${co.phone}`, 8, { align: "center" } as any);
  pushText(`Date: ${safeDate(c.collection_date, "dd-MMM-yyyy") || "-"}`, 9, { align: "center" } as any);
  blocks.push({ type: "hr" });

  // Client
  pushText("CLIENT", 9, { bold: true });
  pushText((c.customer?.company_name || c.customer?.name || "-").toUpperCase(), 10, { bold: true });
  if (c.customer?.bin_number) pushText(`BIN: ${c.customer.bin_number}`, 8);
  if (c.customer?.mobile) pushText(`Mobile: ${c.customer.mobile}`, 8);
  const addr = [c.customer?.address, c.customer?.area?.area_name].filter(Boolean).join(", ");
  if (addr) pushText(addr, 8);
  blocks.push({ type: "hr" });

  // Account summary
  pushText("ACCOUNT SUMMARY", 9, { bold: true });
  blocks.push({ type: "row", left: prevLabel, right: fmt(Math.abs(prevBal)), size: 9 });
  blocks.push({ type: "row", left: "Paid Amount", right: fmt(amount), size: 9 });
  blocks.push({ type: "row", left: `Balance (${balanceLabel})`, right: fmt(Math.abs(balance)), size: 10, bold: true });
  blocks.push({ type: "hr" });

  // Payment details
  pushText("PAYMENT DETAILS", 9, { bold: true });
  blocks.push({
    type: "row",
    left: "Method",
    right: PAYMENT_LABELS[String(c.payment_method)] ?? String(c.payment_method ?? "-"),
    size: 9,
  });
  if (c.reference_no) blocks.push({ type: "row", left: "Reference", right: c.reference_no, size: 9 });
  if (c.collector?.name) blocks.push({ type: "row", left: "Collected By", right: c.collector.name, size: 9 });
  if (c.notes) {
    blocks.push({ type: "hr" });
    pushText(`Note: ${c.notes}`, 8);
  }
  blocks.push({ type: "hr" });

  if (c.status === "CANCELLED") {
    pushText("** CANCELLED **", 11, { bold: true, align: "center" } as any);
  } else {
    pushText("RECEIVED WITH THANKS", 9, { bold: true, align: "center" } as any);
  }
  blocks.push({ type: "space", mm: 6 });

  // Compute total height
  let totalH = MARGIN;
  for (const b of blocks) {
    if (b.type === "hr") totalH += 1.5;
    else if (b.type === "space") totalH += b.mm;
    else if (b.type === "text") totalH += lineHeightFor(b.size);
    else if (b.type === "row") totalH += lineHeightFor(b.size);
  }
  totalH += MARGIN;

  // Render
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, totalH] });
  let y = MARGIN;
  let summaryStartY = 0;
  let summaryEndY = 0;
  const summaryHeaderIdx = blocks.findIndex((b) => b.type === "text" && b.text === "ACCOUNT SUMMARY");
  const balanceRowIdx = blocks.findIndex((b) => b.type === "row" && b.left.startsWith("Balance"));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i === summaryHeaderIdx) summaryStartY = y;
    if (b.type === "hr") {
      pdf.setLineDashPattern([0.6, 0.6], 0);
      pdf.setLineWidth(0.15);
      pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
      pdf.setLineDashPattern([], 0);
      y += 1.5;
      continue;
    }
    if (b.type === "space") { y += b.mm; continue; }
    if (b.type === "text") {
      pdf.setFont("courier", b.bold ? "bold" : "normal");
      pdf.setFontSize(b.size);
      const lh = lineHeightFor(b.size);
      const baselineY = y + lh * 0.78;
      const align = b.align ?? "left";
      const x = align === "center" ? PAGE_W / 2 : align === "right" ? PAGE_W - MARGIN : MARGIN;
      pdf.text(b.text, x, baselineY, { align });
      y += lh;
      continue;
    }
    if (b.type === "row") {
      pdf.setFont("courier", b.bold ? "bold" : "normal");
      pdf.setFontSize(b.size);
      const lh = lineHeightFor(b.size);
      const baselineY = y + lh * 0.78;
      pdf.text(b.left, MARGIN, baselineY);
      pdf.text(b.right, PAGE_W - MARGIN, baselineY, { align: "right" });
      y += lh;
      if (i === balanceRowIdx) summaryEndY = y;
      continue;
    }
  }

  // Stamp overlay (PAID / DUE / ADVANCE) — small, placed inside Account Summary.
  const isCancelled = c.status === "CANCELLED";
  const stampKind: "PAID" | "DUE" | "ADVANCE" | null = isCancelled
    ? null
    : Math.abs(balance) < 0.009
      ? "PAID"
      : balance > 0
        ? "DUE"
        : "ADVANCE";
  if (stampKind && summaryStartY && summaryEndY) {
    const color: [number, number, number] =
      stampKind === "PAID" ? [21, 128, 61] : stampKind === "DUE" ? [185, 28, 28] : [29, 78, 216];
    const boxW = stampKind === "PAID" ? 28 : 32;
    const boxH = stampKind === "PAID" ? 11 : 14;
    const cx = PAGE_W / 2;
    const cy = (summaryStartY + summaryEndY) / 2;
    const anyPdf = pdf as unknown as { GState?: new (o: { opacity: number }) => unknown; setGState?: (g: unknown) => void };
    if (anyPdf.GState && anyPdf.setGState) {
      anyPdf.setGState(new anyPdf.GState({ opacity: 0.45 }));
    }
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.setLineWidth(0.45);
    const angle = -15;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = [
      [-boxW / 2, -boxH / 2], [boxW / 2, -boxH / 2],
      [boxW / 2, boxH / 2], [-boxW / 2, boxH / 2],
    ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos] as [number, number]);
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = corners[i];
      const [x2, y2] = corners[(i + 1) % 4];
      pdf.line(x1, y1, x2, y2);
    }
    pdf.setFont("courier", "bold");
    pdf.setFontSize(stampKind === "PAID" ? 17 : 13);
    pdf.text(stampKind, cx, cy + (stampKind === "PAID" ? 1.8 : -0.5), { align: "center", angle: -angle });
    if (stampKind !== "PAID") {
      pdf.setFontSize(9.5);
      pdf.text(fmt(Math.abs(balance)), cx, cy + 3.5, { align: "center", angle: -angle });
    }
    if (anyPdf.GState && anyPdf.setGState) {
      anyPdf.setGState(new anyPdf.GState({ opacity: 1 }));
    }
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(0, 0, 0);
  }

  const filename = `${c.receipt_no.replace(/[/\\]/g, "-")}.pdf`;

  if (mode === "download") {
    pdf.save(filename);
    return;
  }

  // For view / print: show a real HTML receipt in-app. This avoids browser PDF
  // viewer/blob/data-uri blocking while keeping the same receipt design.
  const receiptHtml = buildReceiptHtml(data);

  // Remove any existing overlay
  document.getElementById("memo-pdf-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "memo-pdf-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);" +
    "display:flex;flex-direction:column;align-items:stretch;";

  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;gap:8px;justify-content:flex-end;padding:8px 12px;background:#1a1a1a;";

  const mkBtn = (label: string) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "padding:6px 14px;border-radius:6px;border:1px solid #444;background:#2a2a2a;" +
      "color:#fff;cursor:pointer;font-size:13px;";
    return b;
  };

  const printBtn = mkBtn("🖨 Print");
  const dlBtn = mkBtn("⬇ PDF");
  const jpgBtn = mkBtn("⬇ JPG");
  const waBtn = opts.onWhatsApp ? mkBtn("WhatsApp") : null;
  if (waBtn) {
    waBtn.style.background = "#25D366";
    waBtn.style.borderColor = "#1da851";
  }
  const closeBtn = mkBtn("Close ✕");
  bar.append(printBtn, dlBtn, jpgBtn, ...(waBtn ? [waBtn] : []), closeBtn);


  const previewWrap = document.createElement("div");
  previewWrap.style.cssText =
    "flex:1;overflow:auto;background:#e5e7eb;padding:18px;display:flex;justify-content:center;align-items:flex-start;";

  const style = document.createElement("style");
  style.textContent = receiptStyles();
  const receipt = document.createElement("div");
  receipt.innerHTML = receiptHtml;
  const shadow = previewWrap.attachShadow({ mode: "open" });
  shadow.append(style, receipt);

  overlay.append(bar, previewWrap);
  document.body.appendChild(overlay);

  const cleanup = () => {
    overlay.remove();
  };

  closeBtn.onclick = cleanup;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
  dlBtn.onclick = () => pdf.save(filename);
  const printReceipt = () => {
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) {
      toastPrintFallback(receiptHtml);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(filename)}</title><style>${receiptStyles()}</style></head><body>${receiptHtml}<script>window.onload=function(){window.focus();window.print();};<\/script></body></html>`);
    printWindow.document.close();
  };

  printBtn.onclick = printReceipt;

  jpgBtn.onclick = async () => {
    jpgBtn.disabled = true;
    const orig = jpgBtn.textContent;
    jpgBtn.textContent = "...";
    try {
      const { blob, filename: jpgName } = await buildReceiptJpgBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = jpgName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      jpgBtn.disabled = false;
      jpgBtn.textContent = orig;
    }
  };

  if (waBtn && opts.onWhatsApp) {
    waBtn.onclick = async () => {
      waBtn.disabled = true;
      const orig = waBtn.textContent;
      waBtn.textContent = "...";
      try {
        await opts.onWhatsApp!();
      } catch (err) {
        console.error(err);
      } finally {
        waBtn.disabled = false;
        waBtn.textContent = orig;
      }
    };
  }

  if (mode === "print") {
    setTimeout(printReceipt, 100);
  }
}

function toastPrintFallback(receiptHtml: string) {
  const printArea = document.createElement("div");
  printArea.id = "memo-print-fallback";
  printArea.style.cssText = "position:fixed;inset:0;z-index:100000;background:#fff;overflow:auto;";
  printArea.innerHTML = `<style>${receiptStyles()}</style>${receiptHtml}`;
  document.body.appendChild(printArea);
  window.print();
  setTimeout(() => printArea.remove(), 1000);
}

// Render the receipt HTML to a JPEG Blob (for WhatsApp/SMS image sharing).
export async function buildReceiptJpgBlob(data: MemoPdfData): Promise<{ blob: Blob; filename: string }> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const html = buildReceiptHtml(data);

  // Force-override inherited oklch tokens — html2canvas can't parse oklch.
  const overrideStyles = `
    .receipt-cap, .receipt-cap * { color: #111111 !important; background-color: transparent !important; border-color: #111111 !important; }
    .receipt-cap { background-color: #ffffff !important; }
    .receipt-cap .dash { border-top-color: #111111 !important; }
    .receipt-cap .stamp, .receipt-cap .stamp *, .receipt-cap .stamp-svg { background: transparent !important; background-color: transparent !important; }
  `;
  // Render the exact same receipt DOM used by the view/print overlay.
  const container = document.createElement("div");
  container.className = "receipt-cap";
  container.style.cssText = "position:fixed;left:-99999px;top:0;width:max-content;background:#ffffff;color:#111111;";
  container.innerHTML = `<style>${receiptStyles()}${overrideStyles}</style>${html}`;
  document.body.appendChild(container);

  try {
    const target = container.querySelector(".receipt-paper") as HTMLElement | null;
    const node = target || container;
    const canvas = await html2canvas(node, {
      backgroundColor: "#ffffff",
      scale: 3,
      useCORS: true,
      logging: false,
    });
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode JPG"))), "image/jpeg", 0.92);
    });
    const filename = `${data.collection.receipt_no.replace(/[/\\]/g, "-")}.jpg`;
    return { blob, filename };
  } finally {
    container.remove();
  }
}


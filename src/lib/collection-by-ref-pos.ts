// Print-only 80mm POS-style "COLLECTION REPORT" by reference.
// Black & white, monospace, thermal-printer optimized.

export type ByRefCollectionSummary = {
  total_bills: number;
  opening_amount: number;
  opening_type?: "DUE" | "ADVANCE" | null;
  billing_amount: number;
  paid_amount: number;
  balance_amount: number;
  balance_type?: "DUE" | "ADVANCE" | null;
};

export type ByRefCollectionPosData = {
  company?: { company_name?: string | null; address?: string | null; phone?: string | null } | null;
  reference_name: string;
  upto_label: string; // Period label (e.g. "Month of Jun 2026", "Upto 30-Jun-2026", "All time")
  month_label?: string; // Collection month, e.g. "Jun 2026"
  billing_month_label?: string; // Billing month (previous month), e.g. "May 2026"
  opening_as_of_label?: string; // e.g. "01 Jun 2026"
  closing_as_of_label?: string; // e.g. "30 Jun 2026"
  summary: ByRefCollectionSummary;
  generated_by?: string;
  generated_on?: string;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function nowStamp(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}-${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildByRefCollectionPosHtml(data: ByRefCollectionPosData): string {
  const { company, reference_name, upto_label, month_label, billing_month_label, opening_as_of_label, closing_as_of_label, summary, generated_by } = data;
  const generated_on = data.generated_on || nowStamp();

  const block = (label: string, value: string, opts?: { big?: boolean }) => `
    <div class="block ${opts?.big ? "block-big" : ""}">
      <div class="block-label">${esc(label)}</div>
      <div class="block-value">${esc(value)}</div>
    </div>
    <div class="dash-sub"></div>
  `;

  const openingType = summary.opening_type ?? (summary.opening_amount < 0 ? "DUE" : summary.opening_amount > 0 ? "ADVANCE" : null);
  const balanceType = summary.balance_type ?? (summary.balance_amount > 0 ? "DUE" : summary.balance_amount < 0 ? "ADVANCE" : null);
  const openingLabel = openingType === "DUE" ? " (Due)" : openingType === "ADVANCE" ? " (Advance)" : "";
  const openingDisplay = `${fmt(Math.abs(summary.opening_amount))}${openingLabel}`;
  const balanceDisplay = balanceType === "DUE"
    ? `${fmt(Math.abs(summary.balance_amount))} (Due)`
    : balanceType === "ADVANCE"
      ? `${fmt(Math.abs(summary.balance_amount))} (Advance)`
      : fmt(Math.abs(summary.balance_amount));

  const isPaid = !balanceType || Math.abs(summary.balance_amount) < 0.005;
  const stampHtml = isPaid
    ? `<div class="stamp stamp-paid"><div class="stamp-inner"><div class="stamp-title">PAID</div></div></div>`
    : balanceType === "DUE"
      ? `<div class="stamp stamp-due"><div class="stamp-inner"><div class="stamp-title">DUE</div><div class="stamp-amt">${esc(fmt(Math.abs(summary.balance_amount)))}</div></div></div>`
      : `<div class="stamp stamp-paid"><div class="stamp-inner"><div class="stamp-title">ADVANCE</div><div class="stamp-amt">${esc(fmt(Math.abs(summary.balance_amount)))}</div></div></div>`;

  const billingLabel = billing_month_label ? `Billing Amount of ${billing_month_label}` : month_label ? `Billing Amount of ${month_label}` : "Billing Amount";
  const openingBlockLabel = opening_as_of_label ? `Opening Balance (as of ${opening_as_of_label})` : "Opening Balance";
  const collectionLabel = month_label ? `Collection of ${month_label}` : "Collected Amount";
  const closingBlockLabel = "Closing Balance";

  return `
    <div class="paper">
      <div class="center company">${esc(company?.company_name || "One Associate")}</div>
      ${company?.address ? `<div class="center muted">${esc(company.address)}</div>` : ""}
      ${company?.phone ? `<div class="center muted">Mobile: ${esc(company.phone)}</div>` : ""}
      <div class="dash"></div>
      <div class="center title">COLLECTION REPORT</div>
      <div class="dash"></div>
      <div class="row"><span>Period</span><span>${esc(upto_label)}</span></div>
      <div class="row"><span>Reference</span><span>${esc(reference_name || "—")}</span></div>
      <div class="dash"></div>
      ${block("Total Bills", String(summary.total_bills))}
      <div class="balance-wrap">
        ${block(billingLabel, fmt(summary.billing_amount))}
        <div class="stamp-wrap">${stampHtml}</div>
      </div>
      ${block(openingBlockLabel, openingDisplay)}
      ${block(collectionLabel, fmt(summary.paid_amount))}
      <div class="dash"></div>
      <div class="block block-balance">
        <div class="block-label balance-label">${esc(closingBlockLabel)}</div>
        <div class="block-value balance-value">${esc(balanceDisplay)}</div>
      </div>

      <div class="dash"></div>
      <div class="muted small">Generated By : ${esc(generated_by || "—")}</div>
      <div class="muted small">Generated On : ${esc(generated_on)}</div>
      <div class="dash"></div>
      <div class="center thanks">THANK YOU</div>
      <div class="dash"></div>
      <div class="bottom-space"></div>
    </div>
  `;
}

export function byRefCollectionPosStyles(): string {
  return `
    .pos-cap, .pos-cap * {
      color: #000000 !important;
      background-color: transparent !important;
      background-image: none !important;
      border-color: #000000 !important;
      outline-color: #000000 !important;
      text-decoration-color: #000000 !important;
      caret-color: #000000 !important;
      fill: #000000 !important;
      stroke: #000000 !important;
      box-shadow: none !important;
    }
    .pos-cap { background-color: #ffffff !important; width: 80mm; padding: 2mm; font-family: "Courier New", Courier, monospace; font-size: 9pt; line-height: 1.2; overflow-wrap: anywhere; box-sizing: border-box; }
    .pos-cap *, .pos-cap *::before, .pos-cap *::after { box-sizing: border-box; }
    .pos-cap .paper { width: 100%; padding: 0; position: relative; }
    .pos-cap .balance-wrap { position: relative; }
    .pos-cap .stamp-wrap { position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-50%); display: flex; justify-content: center; align-items: center; pointer-events: none; width: 100%; }
    .pos-cap .stamp { display: inline-block; transform: rotate(-18deg); pointer-events: none; opacity: 0.8; color: #e57373 !important; }
    .pos-cap .stamp-inner { border: 2.5px solid #e57373 !important; padding: 1.2mm 5mm; border-radius: 1.5mm; text-align: center; box-shadow: none !important; background: transparent !important; color: #e57373 !important; }
    .pos-cap .stamp-title { font-size: 24pt; font-weight: 900; letter-spacing: 4px; line-height: 1; font-family: "Courier New", Courier, monospace; color: #e57373 !important; }
    .pos-cap .stamp-amt { font-size: 10pt; font-weight: 900; letter-spacing: 1px; margin-top: 0.6mm; color: #e57373 !important; }

    .pos-cap .center { text-align: center; }
    .pos-cap .title { font-size: 13pt; font-weight: 900; letter-spacing: 1.5px; margin: 1mm 0; }
    .pos-cap .company { font-size: 11pt; font-weight: 900; letter-spacing: 1px; }
    .pos-cap .muted { font-size: 8pt; }
    .pos-cap .small { font-size: 8pt; }
    .pos-cap .thanks { font-size: 10pt; font-weight: 900; letter-spacing: 1.5px; }
    .pos-cap .dash { border-top: 1px dashed #000000 !important; margin: 1mm 0; }
    .pos-cap .dash-sub { border-top: 1px dashed #000000 !important; opacity: 0.5; margin: 0.5mm 0; }
    .pos-cap .row { display: flex; justify-content: space-between; gap: 3mm; font-size: 9pt; }
    .pos-cap .row span:last-child { text-align: right; white-space: nowrap; font-weight: 700; }
    .pos-cap .block { text-align: center; padding: 0.8mm 0; }
    .pos-cap .block-label { font-size: 8pt; letter-spacing: 0.5px; text-transform: uppercase; }
    .pos-cap .block-value { font-size: 10pt; font-weight: 900; margin-top: 0.3mm; }
    .pos-cap .block-big .block-value { font-size: 11pt; }
    .pos-cap .block-balance { padding: 4mm 0; }
    .pos-cap .balance-label { font-size: 9pt; font-weight: 900; letter-spacing: 1.5px; }
    .pos-cap .balance-value { font-size: 12pt; font-weight: 900; letter-spacing: 0.5px; margin-top: 0.5mm; }
    .pos-cap .bottom-space { height: 2mm; }
  `;
}

export function openByRefCollectionPosPrint(data: ByRefCollectionPosData) {
  const html = buildByRefCollectionPosHtml(data);
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) {
    alert("Please allow pop-ups to print the report.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Collection Report — ${esc(data.reference_name)}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      ${byRefCollectionPosStyles()}
      .toolbar { position: fixed; top: 8px; right: 8px; background: #000; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 11px; display: flex; gap: 8px; z-index: 99; }
      .toolbar button { background: #fff; color: #000; border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-weight: 700; }
      @media print { .toolbar { display: none !important; } }
    </style></head><body>
    <div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
    <div class="pos-cap">${html}</div>
    <script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);});</script>
    </body></html>`);
  w.document.close();
}

export async function buildByRefCollectionPosJpgBlob(data: ByRefCollectionPosData): Promise<{ blob: Blob; filename: string }> {
  const html = buildByRefCollectionPosHtml(data);
  const styleNode = document.createElement("style");
  styleNode.textContent = byRefCollectionPosStyles();
  document.head.appendChild(styleNode);
  const host = document.createElement("div");
  host.className = "pos-cap";
  host.style.cssText = "position:fixed;left:-99999px;top:0;background:#ffffff;color:#000000;";
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
    const safeRef = (data.reference_name || "all").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const safeUpto = data.upto_label.replace(/\s+/g, "-");
    const filename = `collection-report-${safeRef}-upto-${safeUpto}.jpg`;
    return { blob, filename };
  } finally {
    host.remove();
    styleNode.remove();
  }
}

export async function downloadByRefCollectionPosPdf(data: ByRefCollectionPosData): Promise<void> {
  const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
  const { blob } = await buildByRefCollectionPosJpgBlob(data);
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const widthMm = 80;
  const heightMm = (img.naturalHeight / img.naturalWidth) * widthMm;
  const pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm], orientation: "portrait" });
  pdf.addImage(dataUrl, "JPEG", 0, 0, widthMm, heightMm);
  const safeRef = (data.reference_name || "all").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const safeUpto = data.upto_label.replace(/\s+/g, "-");
  pdf.save(`collection-report-${safeRef}-upto-${safeUpto}.pdf`);
}

export function openByRefCollectionPosViewer(data: ByRefCollectionPosData) {
  document.getElementById("by-ref-collection-pos-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "by-ref-collection-pos-overlay";
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
  const pdfBtn = mkBtn("⬇ PDF");
  const jpgBtn = mkBtn("⬇ JPG");
  const closeBtn = mkBtn("Close ✕");
  bar.append(printBtn, pdfBtn, jpgBtn, closeBtn);

  const previewWrap = document.createElement("div");
  previewWrap.style.cssText =
    "flex:1;overflow:auto;background:#e5e7eb;padding:18px;display:flex;justify-content:center;align-items:flex-start;";

  const style = document.createElement("style");
  style.textContent = byRefCollectionPosStyles();
  const receipt = document.createElement("div");
  receipt.className = "pos-cap";
  receipt.innerHTML = buildByRefCollectionPosHtml(data);
  const shadow = previewWrap.attachShadow({ mode: "open" });
  shadow.append(style, receipt);

  overlay.append(bar, previewWrap);
  document.body.appendChild(overlay);

  const cleanup = () => overlay.remove();
  closeBtn.onclick = cleanup;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });

  printBtn.onclick = () => openByRefCollectionPosPrint(data);
  pdfBtn.onclick = async () => {
    pdfBtn.disabled = true;
    const orig = pdfBtn.textContent;
    pdfBtn.textContent = "...";
    try { await downloadByRefCollectionPosPdf(data); } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = orig;
    }
  };
  jpgBtn.onclick = async () => {
    jpgBtn.disabled = true;
    const orig = jpgBtn.textContent;
    jpgBtn.textContent = "...";
    try {
      const { blob, filename } = await buildByRefCollectionPosJpgBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      jpgBtn.disabled = false;
      jpgBtn.textContent = orig;
    }
  };
}

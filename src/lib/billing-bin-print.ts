// Builds a professional print-ready "Bills by BIN" document and offers Print / PDF / Excel exports.

interface BillRow {
  customer_name: string;
  address: string;
  mobile: string;
  area_name: string;
  reference_name: string;
  bin_number?: string;
  previous_balance: number;
  subtotal: number;
  discount: number;
  grand_total: number;
  books_of_accounts?: number;
}

interface Company {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface PrintOpts {
  rows: BillRow[];
  company: Company;
  billingMonthLabel: string;
  referenceLabel: string;
  areaLabel: string;
  generatedBy: string;
  hideAreaColumn?: boolean;
  hideReferenceColumn?: boolean;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtAmount = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function computeTotals(rows: BillRow[]) {
  const totals = rows.reduce(
    (a, r) => {
      a.bill += Number(r.subtotal || 0);
      a.prev += Number(r.previous_balance || 0);
      a.disc += Number(r.discount || 0);
      a.boa += Number(r.books_of_accounts || 0);
      return a;
    },
    { bill: 0, prev: 0, disc: 0, boa: 0 },
  );
  const payable = totals.bill - totals.prev;
  return { ...totals, payable, net: payable - totals.disc };
}

function nowLabel() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function buildHtml(opts: PrintOpts, withToolbar: boolean, autoPrint: boolean) {
  const {
    rows, company, billingMonthLabel, referenceLabel, areaLabel, generatedBy,
    hideAreaColumn = false, hideReferenceColumn = false,
  } = opts;
  const totals = computeTotals(rows);
  const now = nowLabel();

  // Adjust column widths based on hidden columns
  const extraInfoWidth = (hideAreaColumn ? 9 : 0) + (hideReferenceColumn ? 10 : 0);
  const cliWidth = 24 + extraInfoWidth;

  const bodyRows = rows.map((r, i) => {
    const payable = Number(r.subtotal || 0) - Number(r.previous_balance || 0);
    const clientCell = [
      `<div class="name">${esc(r.customer_name)}</div>`,
      r.address ? `<div class="muted">${esc(r.address)}</div>` : "",
      r.mobile ? `<div class="muted">Mob: ${esc(r.mobile)}</div>` : "",
      r.bin_number ? `<div class="muted">BIN: ${esc(r.bin_number)}</div>` : "",
    ].filter(Boolean).join("");
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${clientCell}</td>
      ${hideAreaColumn ? "" : `<td>${esc(r.area_name)}</td>`}
      ${hideReferenceColumn ? "" : `<td>${esc(r.reference_name)}</td>`}
      <td class="r">${fmtAmount(r.books_of_accounts ?? 0)}</td>
      <td class="r">${fmtAmount(r.subtotal)}</td>
      <td class="r">${fmtAmount(r.previous_balance)}</td>
      <td class="r">${fmtAmount(payable)}</td>
      <td class="r">${fmtAmount(r.discount)}</td>
      <td class="r">${fmtAmount(payable - Number(r.discount || 0))}</td>
    </tr>`;
  }).join("");

  const grandTotalColspan = 2 + (hideAreaColumn ? 0 : 1) + (hideReferenceColumn ? 0 : 1);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Report: Bills By BIN — ${esc(billingMonthLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 10mm 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { padding: 0; }
  .company { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .company .name { font-size: 18pt; font-weight: 800; letter-spacing: 0.5px; }
  .company .meta { font-size: 9.5pt; color: #333; margin-top: 2px; }
  .title-block { text-align: center; margin: 6px 0 10px; }
  .title-block h2 { margin: 0; font-size: 13pt; letter-spacing: 1px; text-transform: uppercase; background: #f1f1f1; border: 1px solid #999; padding: 5px 0; }
  .filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 14px; font-size: 10pt; margin: 8px 2px 10px; }
  .filters .row { display: flex; gap: 6px; }
  .filters .lbl { font-weight: 700; min-width: 95px; }
  table.report { width: 100%; border-collapse: collapse; font-size: 9.5pt; table-layout: fixed; }
  table.report th, table.report td { border: 1px solid #555; padding: 5px 6px; vertical-align: top; word-wrap: break-word; }
  table.report thead th { background: #e9e9e9; font-weight: 700; text-align: left; }
  table.report .c { text-align: center; }
  table.report .r { text-align: right; font-variant-numeric: tabular-nums; }
  table.report tbody td .name { font-weight: 600; }
  table.report tbody td .muted { color: #555; font-size: 8.5pt; line-height: 1.25; }
  table.report tfoot td { font-weight: 800; background: #f4f4f4; border-top: 2px solid #000; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { page-break-inside: avoid; }
  .footer { margin-top: 14px; display: flex; justify-content: space-between; font-size: 9pt; color: #333; border-top: 1px dashed #999; padding-top: 6px; }
  .empty { text-align: center; padding: 30px 0; color: #666; font-style: italic; }
  @media print { .no-print { display: none !important; } }
  .toolbar { position: fixed; top: 8px; right: 8px; background: #111; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 11px; display: flex; gap: 8px; z-index: 99; }
  .toolbar button { background: #fff; color: #111; border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-weight: 600; }
</style>
</head>
<body>
  ${withToolbar ? `<div class="toolbar no-print"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>` : ""}
  <div class="wrap" id="report-root">
    <div class="company">
      <div class="name">${esc(company.company_name || "One Associate")}</div>
      <div class="meta">
        ${company.address ? `Address: ${esc(company.address)}` : ""}
        ${company.email ? ` &nbsp;|&nbsp; Email: ${esc(company.email)}` : ""}
        ${company.phone ? ` &nbsp;|&nbsp; Mobile: ${esc(company.phone)}` : ""}
      </div>
    </div>
    <div class="title-block"><h2>Report: Bills By BIN</h2></div>
    <div class="filters">
      <div class="row"><span class="lbl">Tax Period</span><span>: ${esc(billingMonthLabel)}</span></div>
      <div class="row"><span class="lbl">Reference</span><span>: ${esc(referenceLabel)}</span></div>
      <div class="row"><span class="lbl">Area</span><span>: ${esc(areaLabel)}</span></div>
    </div>
    ${
      rows.length === 0
        ? `<div class="empty">No records found for the selected filters.</div>`
        : `<table class="report">
            <colgroup>
              <col style="width:4%"/>
              <col style="width:${cliWidth}%"/>
              ${hideAreaColumn ? "" : `<col style="width:9%"/>`}
              ${hideReferenceColumn ? "" : `<col style="width:10%"/>`}
              <col style="width:9%"/><col style="width:9%"/><col style="width:9%"/><col style="width:9%"/><col style="width:9%"/><col style="width:9%"/>
            </colgroup>
            <thead>
              <tr>
                <th class="c">SL</th>
                <th>Client Name, Address &amp; Mobile</th>
                ${hideAreaColumn ? "" : `<th>Area</th>`}
                ${hideReferenceColumn ? "" : `<th>Reference</th>`}
                <th class="r">Books of Accounts</th>
                <th class="r">Total Bill</th>
                <th class="r">Previous Balance</th>
                <th class="r">Total Payable</th>
                <th class="r">Discount</th>
                <th class="r">Net Payable</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td class="c" colspan="${grandTotalColspan}">Grand Total</td>
                <td class="r">${fmtAmount(totals.boa)}</td>
                <td class="r">${fmtAmount(totals.bill)}</td>
                <td class="r">${fmtAmount(totals.prev)}</td>
                <td class="r">${fmtAmount(totals.payable)}</td>
                <td class="r">${fmtAmount(totals.disc)}</td>
                <td class="r">${fmtAmount(totals.net)}</td>
              </tr>
            </tfoot>
          </table>`
    }
    <div class="footer">
      <div>Generated On: <strong>${esc(now)}</strong></div>
      <div>Generated By: <strong>${esc(generatedBy)}</strong></div>
    </div>
  </div>
  ${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);});</script>` : ""}
</body>
</html>`;
}

export function openBillingByBinPrint(opts: PrintOpts) {
  const html = buildHtml(opts, true, true);
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) {
    alert("Please allow pop-ups to print the report.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function downloadBillingByBinPdf(opts: PrintOpts) {
  // html2pdf/html2canvas crashes on Tailwind v4's lab()/oklch() colors that
  // get inherited from the host document. Use the browser's native print
  // dialog instead — users can pick "Save as PDF" from there.
  const html = buildHtml(opts, true, true);
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) {
    alert("Please allow pop-ups to download the PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function downloadBillingByBinExcel(opts: PrintOpts) {
  const {
    rows, company, billingMonthLabel, referenceLabel, areaLabel, generatedBy,
    hideAreaColumn = false, hideReferenceColumn = false,
  } = opts;
  const XLSX = await import("xlsx");
  const totals = computeTotals(rows);
  const now = nowLabel();

  const headers = [
    "SL", "Client Name", "Address", "Mobile", "BIN",
    ...(hideAreaColumn ? [] : ["Area"]),
    ...(hideReferenceColumn ? [] : ["Reference"]),
    "Books of Accounts", "Total Bill", "Previous Balance", "Total Payable", "Discount", "Net Payable",
  ];
  const colCount = headers.length;
  const lastCol = colCount - 1;

  const aoa: (string | number)[][] = [];
  aoa.push([company.company_name || "One Associate"]);
  const meta: string[] = [];
  if (company.address) meta.push(`Address: ${company.address}`);
  if (company.email) meta.push(`Email: ${company.email}`);
  if (company.phone) meta.push(`Mobile: ${company.phone}`);
  aoa.push([meta.join("  |  ")]);
  aoa.push([]);
  aoa.push(["REPORT: BILLS BY BIN"]);
  aoa.push([`Tax Period: ${billingMonthLabel}`, "", `Reference: ${referenceLabel}`, "", `Area: ${areaLabel}`]);
  aoa.push([]);
  aoa.push(headers);
  rows.forEach((r, i) => {
    const payable = Number(r.subtotal || 0) - Number(r.previous_balance || 0);
    const row: (string | number)[] = [
      i + 1,
      r.customer_name,
      r.address || "",
      r.mobile || "",
      r.bin_number || "",
    ];
    if (!hideAreaColumn) row.push(r.area_name || "");
    if (!hideReferenceColumn) row.push(r.reference_name || "");
    row.push(
      Number(r.books_of_accounts || 0),
      Number(r.subtotal || 0),
      Number(r.previous_balance || 0),
      payable,
      Number(r.discount || 0),
      payable - Number(r.discount || 0),
    );
    aoa.push(row);
  });
  const totalsPad = Array(colCount - 8).fill("");
  aoa.push([
    "", "Grand Total", ...totalsPad,
    totals.boa, totals.bill, totals.prev, totals.payable, totals.disc, totals.net,
  ]);
  aoa.push([]);
  const footerRow = Array(colCount).fill("") as (string | number)[];
  footerRow[0] = `Generated On: ${now}`;
  footerRow[lastCol] = `Generated By: ${generatedBy}`;
  aoa.push(footerRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const baseCols = [
    { wch: 4 }, { wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 14 },
  ];
  if (!hideAreaColumn) baseCols.push({ wch: 14 });
  if (!hideReferenceColumn) baseCols.push({ wch: 16 });
  baseCols.push({ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 });
  ws["!cols"] = baseCols;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bills by BIN");
  const filename = `bills-by-bin-${billingMonthLabel.replace(/\s+/g, "-")}.xlsx`;
  XLSX.writeFile(wb, filename);
}

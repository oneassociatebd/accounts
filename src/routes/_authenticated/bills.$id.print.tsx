import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getBill } from "@/lib/billing.functions";
import { getBillShareInfo } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/bills/$id/print")({
  head: () => ({
    meta: [{ title: "One | Print Invoice" }],
  }),
  component: PrintMemo,
});

// Number with 2 decimals + comma separators (e.g. 4,326.70)
function fmt(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Convert number to English words (for Taka amounts)
function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
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
    const dec =
      decPart < 10
        ? "Zero " + ones[decPart]
        : decPart < 20
          ? ones[decPart]
          : tens[Math.floor(decPart / 10)] + (decPart % 10 ? " " + ones[decPart % 10] : "");
    words += " Point " + dec;
  }
  return (negative ? "Minus " : "") + words;
}

function safeDate(s: string | null | undefined, f: string) {
  if (!s) return "";
  try {
    return format(parseISO(String(s)), f);
  } catch {
    return String(s);
  }
}

type BillPrintItem = {
  id: string;
  qty: number | string | null;
  final_amount: number | string | null;
  service?: { item_name?: string | null } | null;
};

type CompanyPrintExtra = {
  payment_link_expiry_days?: number | string | null;
  bank_account_number?: string | null;
  bank_branch?: string | null;
  invoice_footer_text?: string | null;
  invoice_terms?: string | null;
  logo_url?: string | null;
  print_page_size?: string | null;
  print_orientation?: string | null;
  print_margin_top?: number | string | null;
  print_margin_bottom?: number | string | null;
  print_margin_left?: number | string | null;
  print_margin_right?: number | string | null;
  print_show_logo?: boolean | null;
  print_show_header?: boolean | null;
  print_show_footer?: boolean | null;
  print_copies?: string | null;
  print_signature_line?: boolean | null;
  print_signature_label?: string | null;
  print_signature_url?: string | null;
};

const PAGE_SIZES_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  LETTER: [215.9, 279.4],
  LEGAL: [215.9, 355.6],
};

function PrintMemo() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getBill);
  const shareInfo = useServerFn(getBillShareInfo);
  const { data, isLoading } = useQuery({
    queryKey: ["bill-print", id],
    queryFn: () => get({ data: { id } }),
  });

  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const buildPdf = async (autoPrint: boolean) => {
    if (!data) {
      toast.error("Invoice data not loaded yet");
      return;
    }
    if (autoPrint) setPrinting(true); else setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const filename = `${data.bill.bill_no.replace(/[/\\]/g, "-")}.pdf`;
      const company = data.company;
      const companyExtra = (company || {}) as CompanyPrintExtra;
      const pageKey = (companyExtra.print_page_size || "A4").toUpperCase();
      const [pw, ph] = PAGE_SIZES_MM[pageKey] || PAGE_SIZES_MM.A4;
      const orientation = (companyExtra.print_orientation || "portrait") === "landscape" ? "landscape" : "portrait";
      const pageW = orientation === "landscape" ? ph : pw;
      const pageH = orientation === "landscape" ? pw : ph;
      const mTop = Number(companyExtra.print_margin_top ?? 14);
      const mBot = Number(companyExtra.print_margin_bottom ?? 14);
      const mLeft = Number(companyExtra.print_margin_left ?? 14);
      const mRight = Number(companyExtra.print_margin_right ?? 14);
      const showHeader = companyExtra.print_show_header !== false;
      const showLogo = companyExtra.print_show_logo !== false;
      const showFooter = companyExtra.print_show_footer !== false;
      const showSigLine = companyExtra.print_signature_line !== false;
      const sigLabel = companyExtra.print_signature_label || "Authorized Signature";
      const sigUrl = companyExtra.print_signature_url || null;
      const copiesMode = (companyExtra.print_copies || "ORIGINAL").toUpperCase();
      const copyLabels = copiesMode === "BOTH" ? ["ORIGINAL", "DUPLICATE"] : copiesMode === "DUPLICATE" ? ["DUPLICATE"] : ["ORIGINAL"];

      const pdf = new jsPDF({ orientation, unit: "mm", format: [pw, ph] });
      const margin = mLeft;
      const right = pageW - mRight;
      let y = mTop;
      const drawText = (
        text: string,
        x: number,
        yy: number,
        size = 10,
        style: "normal" | "bold" | "italic" = "normal",
        align: "left" | "center" | "right" = "left",
      ) => {
        pdf.setFont("times", style);
        pdf.setFontSize(size);
        pdf.text(String(text || ""), x, yy, { align });
      };
      const drawLine = (yy: number, width = 0.2) => {
        pdf.setLineWidth(width);
        pdf.line(margin, yy, right, yy);
      };
      const addPageIfNeeded = (needed = 12) => {
        if (y + needed <= pageH - mBot) return;
        pdf.addPage();
        y = mTop;
      };

      const bill = data.bill;
      const items = (data.items || []) as BillPrintItem[];
      const subtotal = Number(bill.subtotal || 0);
      const prevBal = Number(bill.previous_balance || 0);
      const prevDue = prevBal < 0 ? -prevBal : 0;
      const prevAdv = prevBal > 0 ? prevBal : 0;
      const payable = subtotal + prevDue;
      const discount = Number(bill.discount_amount || 0);
      const netPayable = Math.max(0, payable - discount);
      const paid = 0;
      const balance = paid - netPayable;
      const dueDays = Number(companyExtra.payment_link_expiry_days || 7);
      const billDate = bill.bill_date ? safeDate(bill.bill_date, "dd-MMM-yyyy") : "";
      const payByDate = bill.bill_date
        ? (() => {
            const s = String(bill.bill_date).slice(0, 10);
            const [y, m, d] = s.split("-").map(Number);
            const dt = new Date(Date.UTC(y, m - 1, d + 5));
            return safeDate(dt.toISOString().slice(0, 10), "dd-MMM-yyyy");
          })()
        : "";
      const invoiceDisplay = /\/\d{4}$/.test(bill.bill_no)
        ? bill.bill_no
        : `${bill.bill_no}/${bill.bill_date ? String(bill.bill_date).slice(0, 4) : new Date().getFullYear()}`;

      // Pre-load signature image (if any)
      let sigDataUrl: string | null = null;
      if (showSigLine && sigUrl) {
        try {
          const resp = await fetch(sigUrl);
          const blob = await resp.blob();
          sigDataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
        } catch (err) {
          console.warn("Failed to load signature image", err);
        }
      }

      // Pre-load logo image (if any)
      let logoDataUrl: string | null = null;
      if (showLogo && companyExtra.logo_url) {
        try {
          const resp = await fetch(companyExtra.logo_url);
          const blob = await resp.blob();
          logoDataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
        } catch (err) {
          console.warn("Failed to load logo image", err);
        }
      }

      const footerText = companyExtra.invoice_footer_text || "";

      const renderCopy = (copyLabel: string) => {
        y = mTop;

        // Copy label top-right
        if (copyLabel) {
          drawText(`[ ${copyLabel} ]`, right, y - 2, 9, "italic", "right");
        }

        if (showHeader) {
          if (logoDataUrl) {
            try {
              pdf.addImage(logoDataUrl, "PNG", margin, y - 2, 18, 18);
            } catch {
              /* ignore */
            }
          }
          drawText(company?.company_name || "Company Name", pageW / 2, y, 16, "bold", "center");
          y += 6;
          if (company?.address) {
            pdf.setFont("times", "normal");
            pdf.setFontSize(9);
            pdf.text(pdf.splitTextToSize(company.address, 130), pageW / 2, y, { align: "center" });
            y += 5;
          }
          if (company?.phone) {
            drawText(`Mobile: ${company.phone}`, pageW / 2, y, 9, "normal", "center");
            y += 7;
          }
          y += 6;
        } else {
          y += 4;
        }

        drawText("INVOICE", pageW / 2, y, 11, "bold", "center");
        y += 4;
        pdf.setLineWidth(0.5);
        pdf.line(pageW / 2 - 7, y, pageW / 2 + 7, y);
        y += 10;

        drawText("To,", margin, y, 10, "bold");
        y += 5;
        const infoRows = [
          ["Company", (bill.customer?.company_name || bill.customer?.name || "-").toUpperCase()],
          ["BIN", bill.customer?.bin_number || "-"],
          ["Tax Period", bill.billing_month ? safeDate(String(bill.billing_month), "MMM yyyy") : "-"],
        ];
        infoRows.forEach(([label, value]) => {
          drawText(label, margin, y, 10);
          drawText(":", 45, y, 10);
          drawText(value, 49, y, 10, label === "Company" ? "bold" : "normal");
          if (label === "Company") {
            drawText(invoiceDisplay, right, y, 10, "bold", "right");
          }
          y += 5;
        });
        drawText("Billing Date", margin, y, 10);
        drawText(":", 45, y, 10);
        pdf.setTextColor(255, 0, 0);
        drawText(billDate || "-", 49, y, 10);
        pdf.setTextColor(0, 0, 0);
        y += 5;
        y += 3;

        drawLine(y, 0.2);
        y += 5;
        drawText("Serial", margin, y, 10, "bold");
        drawText("Description", 35, y, 10, "bold");
        drawText("Qty", right - 40, y, 10, "bold", "right");
        drawText("Total", right, y, 10, "bold", "right");
        y += 3;
        drawLine(y, 0.2);
        y += 5;

        items.forEach((it, idx) => {
          addPageIfNeeded(12);
          const descriptionLines = pdf.splitTextToSize(String(it.service?.item_name || "-"), 105);
          drawText(String(idx + 1), margin, y, 10);
          drawText(descriptionLines[0], 35, y, 10);
          for (let i = 1; i < descriptionLines.length; i += 1) {
            y += 4.5;
            drawText(descriptionLines[i], 35, y, 10);
          }
          drawText(String(Number(it.qty || 0)), right - 40, y, 10, "normal", "right");
          drawText(fmt(it.final_amount), right, y, 10, "normal", "right");
          y += 5;
        });

        drawLine(y, 0.2);
        y += 6;

        const summaryX = right - 92;
        const summaryRows: Array<[string, string, boolean?]> = [
          ["Grand Total", fmt(subtotal), false],
          ["Previous Balance", prevBal < 0 ? `-${fmt(prevDue)}` : fmt(prevAdv), true],
          ["Payable", fmt(payable), false],
          ["Discount", fmt(discount), false],
          ["Net Payable", fmt(netPayable), true],
          ["Balance", balance < 0 ? `-${fmt(-balance)}` : fmt(balance), true],
        ];
        summaryRows.forEach(([label, value, bold], idx) => {
          addPageIfNeeded(8);
          if (idx === 0 || idx === summaryRows.length - 1) {
            pdf.line(summaryX, y - 3.5, right, y - 3.5);
          }
          drawText(label, summaryX, y, 10, bold ? "bold" : "normal");
          drawText(":", right - 48, y, 10);
          drawText(value, right, y, 10, bold ? "bold" : "normal", "right");
          y += 4.5;
        });
        pdf.line(summaryX, y - 3.5, right, y - 3.5);
        y += 2;

        addPageIfNeeded(6);
        drawText(`[In Words: ${numberToWords(netPayable)} Tk Only]`, right, y, 9, "italic", "right");

        if (showSigLine) {
          y += 8;
          if (sigDataUrl) {
            try {
              pdf.addImage(sigDataUrl, "PNG", right - 40, y - 12, 40, 14);
            } catch {
              /* ignore */
            }
          } else {
            y += 12;
          }
          pdf.setFont("times", "normal");
          pdf.setFontSize(9);
          const sigWidth = pdf.getTextDimensions(sigLabel).w;
          pdf.line(right - sigWidth, y, right, y);
          y += 4;
          drawText(sigLabel, right, y, 9, "normal", "right");
          y += 6;
        }

        addPageIfNeeded(25);
        drawText("Please Pay To:", margin, y, 10, "bold");
        y += 3;
        pdf.setLineWidth(0.3);
        pdf.line(margin, y, right, y);
        y += 5;
        const colW = (right - margin) / 3;
        const col1X = margin;
        const col2X = margin + colW;
        const col3X = margin + colW * 2;
        const payStartY = y;
        drawText("A/C Name: One Associate", col1X, payStartY, 9);
        drawText("A/C No: 348 790 100 3900", col1X, payStartY + 5, 9);
        drawText("Bank: Pubali Bank PLC", col1X, payStartY + 10, 9);
        drawText("Branch: Dargah gate Islamic", col1X, payStartY + 15, 9);
        {
          const orCx = margin + (right - margin) / 2;
          const orCy = payStartY + 3.5;
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.3);
          pdf.circle(orCx, orCy, 4, "S");
          drawText("Or", orCx, orCy + 1.5, 9, "normal", "center");
        }
        drawText("Bkash (Send Money):", col3X, payStartY, 9);
        drawText("01719950891", col3X, payStartY + 5, 9);
        y = payStartY + 20;

        if (showFooter) {
          const footerMsg = `Please pay dues before ${payByDate} to avoid service interruption and send your payment document to our WhatsApp number.`;
          if (payByDate) {
            pdf.setFont("times", "bold");
            pdf.setFontSize(9);
            const innerW = right - margin - 6;
            const lines = pdf.splitTextToSize(footerMsg, innerW) as string[];
            const lineH = 4.2;
            const padY = 3;
            const footerBoxH = lines.length * lineH + padY * 2;
            const boxTop = pageH - Math.min(mBot, 6) - footerBoxH;
            pdf.setFillColor(245, 245, 245);
            pdf.rect(margin, boxTop, right - margin, footerBoxH, "F");
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, boxTop, right - margin, footerBoxH, "S");
            let ty = boxTop + padY + lineH - 1;
            pdf.setFont("times", "bold");
            pdf.setFontSize(9);
            lines.forEach((ln) => {
              const idx = ln.indexOf(payByDate);
              if (idx === -1) {
                drawText(ln, pageW / 2, ty, 9, "bold", "center");
              } else {
                const before = ln.slice(0, idx);
                const mid = payByDate;
                const after = ln.slice(idx + payByDate.length);
                const wBefore = pdf.getTextWidth(before);
                const wMid = pdf.getTextWidth(mid);
                const wAfter = pdf.getTextWidth(after);
                const totalW = wBefore + wMid + wAfter;
                let x = pageW / 2 - totalW / 2;
                pdf.setTextColor(0, 0, 0);
                pdf.text(before, x, ty);
                x += wBefore;
                pdf.setTextColor(220, 38, 38);
                pdf.text(mid, x, ty);
                x += wMid;
                pdf.setTextColor(0, 0, 0);
                pdf.text(after, x, ty);
              }
              ty += lineH;
            });
          }
        }
      };

      copyLabels.forEach((label, idx) => {
        if (idx > 0) pdf.addPage();
        renderCopy(copyLabels.length > 1 ? label : "");
      });

      if (autoPrint) {
        pdf.autoPrint();
        const blobUrl = pdf.output("bloburl");
        let iframe = document.getElementById("pdf-print-frame") as HTMLIFrameElement | null;
        if (iframe) iframe.remove();
        iframe = document.createElement("iframe");
        iframe.id = "pdf-print-frame";
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = String(blobUrl);
        iframe.onload = () => {
          // PDF has autoPrint embedded; viewer triggers print on load.
          // Avoid contentWindow.print() (blob URL is cross-origin in sandboxed previews).
          try {
            iframe!.contentWindow?.focus();
          } catch {
            /* ignore cross-origin focus errors */
          }
        };
        document.body.appendChild(iframe);
      } else {
        pdf.save(filename);
        toast.success("PDF downloaded");
      }
    } catch (e) {
      console.error("PDF generation failed:", e);
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setDownloading(false);
      setPrinting(false);
    }
  };

  const downloadPdf = () => buildPdf(false);
  const printPdf = () => buildPdf(true);

  const openPosView = () => {
    if (!data) {
      toast.error("Invoice data not loaded yet");
      return;
    }
    const billLocal = data.bill;
    const itemsLocal = (data.items || []) as BillPrintItem[];
    const companyLocal = data.company;
    const subtotalL = Number(billLocal.subtotal || 0);
    const prevBalL = Number(billLocal.previous_balance || 0);
    const prevDueL = prevBalL < 0 ? -prevBalL : 0;
    const prevAdvL = prevBalL > 0 ? prevBalL : 0;
    const payableL = subtotalL + prevDueL;
    const discountL = Number(billLocal.discount_amount || 0);
    const netPayableL = Math.max(0, payableL - discountL);
    const billDateL = billLocal.bill_date ? safeDate(billLocal.bill_date, "dd-MMM-yyyy") : "";
    const invoiceDisplayL = /\/\d{4}$/.test(billLocal.bill_no)
      ? billLocal.bill_no
      : `${billLocal.bill_no}/${billLocal.bill_date ? String(billLocal.bill_date).slice(0, 4) : new Date().getFullYear()}`;
    const customerNameL = (billLocal.customer?.company_name || billLocal.customer?.name || "-").toUpperCase();
    const esc = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const itemsHtml = itemsLocal
      .map(
        (it, idx) => `
          <div class="item">
            <div class="item-top"><span class="idx">${idx + 1}.</span><span class="name">${esc(it.service?.item_name || "-")}</span></div>
            <div class="item-bot"><span>Qty: ${esc(Number(it.qty || 0))}</span><span>${esc(fmt(it.final_amount))}</span></div>
          </div>`,
      )
      .join("");

    const summaryRows: Array<[string, string, boolean?]> = [
      ["Subtotal", fmt(subtotalL)],
      ["Previous Balance", prevBalL < 0 ? `-${fmt(prevDueL)}` : fmt(prevAdvL)],
      ["Payable", fmt(payableL)],
      ["Discount", fmt(discountL)],
      ["Net Payable", fmt(netPayableL), true],
    ];

    const receiptHtml = `
      <div class="paper">
        ${companyLocal?.company_name ? `<div class="center company">${esc(companyLocal.company_name)}</div>` : ""}
        ${companyLocal?.address ? `<div class="center muted">${esc(companyLocal.address)}</div>` : ""}
        ${companyLocal?.phone ? `<div class="center muted">Mobile: ${esc(companyLocal.phone)}</div>` : ""}
        <div class="dash"></div>
        <div class="center title">INVOICE</div>
        <div class="center receipt-no">${esc(invoiceDisplayL)}</div>
        <div class="center date">Date: ${esc(billDateL || "-")}</div>
        <div class="dash"></div>
        <div class="section">BILL TO</div>
        <div class="customer">${esc(customerNameL)}</div>
        ${billLocal.customer?.bin_number ? `<div>BIN: ${esc(billLocal.customer.bin_number)}</div>` : ""}
        ${billLocal.customer?.mobile ? `<div>Mobile: ${esc(billLocal.customer.mobile)}</div>` : ""}
        ${billLocal.billing_month ? `<div>Tax Period: ${esc(safeDate(String(billLocal.billing_month), "MMM yyyy"))}</div>` : ""}
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
        <div class="center words">In Words:<br/>${esc(numberToWords(netPayableL))} Tk Only</div>
        <div class="dash"></div>
        <div class="center thanks">${billLocal.status === "CANCELLED" ? "** CANCELLED **" : "THANK YOU"}</div>
        <div class="bottom-space"></div>
      </div>
    `;

    const styles = `
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f4f5; color: #111827; font-family: Courier, "Courier New", monospace; }
      .paper { width: 80mm; min-height: 100mm; margin: 0 auto; padding: 4mm; background: #fff; color: #111; font-size: 9pt; line-height: 1.3; overflow-wrap: anywhere; }
      .center { text-align: center; }
      .title { font-size: 12pt; font-weight: 700; letter-spacing: 2px; }
      .receipt-no { font-size: 8pt; font-weight: 700; }
      .company { font-size: 11pt; font-weight: 700; }
      .muted { font-size: 8pt; }
      .date { font-size: 9pt; }
      .section { font-size: 9pt; font-weight: 700; margin-top: 0.5mm; }
      .customer { font-size: 10pt; font-weight: 700; }
      .words { font-size: 8.5pt; font-style: italic; }
      .thanks { font-size: 10pt; font-weight: 700; letter-spacing: 1px; }
      .dash { border-top: 1px dashed #111; margin: 1.5mm 0; }
      .row { display: flex; justify-content: space-between; gap: 4mm; }
      .row span:last-child { text-align: right; white-space: nowrap; }
      .strong { font-size: 10pt; font-weight: 700; }
      .item { margin-bottom: 1mm; }
      .item-top { display: flex; gap: 1mm; font-weight: 600; }
      .item-top .idx { flex: 0 0 auto; }
      .item-top .name { flex: 1; }
      .item-bot { display: flex; justify-content: space-between; padding-left: 4mm; font-size: 8.5pt; }
      .bottom-space { height: 6mm; }
      @media print { body { background: #fff; } .paper { width: 72mm; margin: 0; padding: 0; box-shadow: none; } }
    `;

    document.getElementById("invoice-pos-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "invoice-pos-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;";
    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;justify-content:flex-end;padding:8px 12px;background:#1a1a1a;";
    const mkBtn = (label: string) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "padding:6px 14px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#fff;cursor:pointer;font-size:13px;";
      return b;
    };
    const printBtn = mkBtn("🖨 Print");
    const jpgBtn = mkBtn("⬇ JPG");
    const waBtn = mkBtn("WhatsApp");
    waBtn.style.background = "#25D366";
    waBtn.style.borderColor = "#1da851";
    const closeBtn = mkBtn("Close ✕");
    bar.append(printBtn, jpgBtn, waBtn, closeBtn);
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "flex:1;overflow:auto;background:#e5e7eb;padding:18px;display:flex;justify-content:center;align-items:flex-start;";
    const shadow = wrap.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    const inner = document.createElement("div");
    inner.innerHTML = receiptHtml;
    shadow.append(styleEl, inner);
    overlay.append(bar, wrap);
    document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();
    closeBtn.onclick = cleanup;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
    printBtn.onclick = () => {
      const w = window.open("", "_blank", "width=420,height=720");
      if (!w) { toast.error("Popup blocked"); return; }
      w.document.open();
      w.document.write(`<!doctype html><html><head><title>${esc(billLocal.bill_no)}</title><style>${styles}</style></head><body>${receiptHtml}<script>window.onload=function(){window.focus();window.print();};<\/script></body></html>`);
      w.document.close();
    };

    // Build a JPG blob by rendering the receipt into an offscreen light-DOM
    // node (so html2canvas can see it) with scoped styles.
    const captureBlob = async (): Promise<{ blob: Blob; filename: string }> => {
      const scoped = `
        .pos-cap { width: 80mm; padding: 4mm; background:#ffffff; color:#111111; font-family: Courier,"Courier New",monospace; font-size: 9pt; line-height: 1.3; overflow-wrap: anywhere; box-sizing: border-box; }
        .pos-cap, .pos-cap * { color: #111111 !important; background-color: transparent !important; border-color: #111111 !important; }
        .pos-cap { background-color: #ffffff !important; }
        .pos-cap *, .pos-cap *::before, .pos-cap *::after { box-sizing: border-box; }
        .pos-cap .paper { width: 100%; padding: 0; background: transparent; }
        .pos-cap .center { text-align: center; }
        .pos-cap .title { font-size: 12pt; font-weight: 700; letter-spacing: 2px; }
        .pos-cap .receipt-no { font-size: 8pt; font-weight: 700; }
        .pos-cap .company { font-size: 11pt; font-weight: 700; }
        .pos-cap .muted { font-size: 8pt; }
        .pos-cap .date { font-size: 9pt; }
        .pos-cap .section { font-size: 9pt; font-weight: 700; margin-top: 0.5mm; }
        .pos-cap .customer { font-size: 10pt; font-weight: 700; }
        .pos-cap .words { font-size: 8.5pt; font-style: italic; }
        .pos-cap .thanks { font-size: 10pt; font-weight: 700; letter-spacing: 1px; }
        .pos-cap .dash { border-top: 1px dashed #111; margin: 1.5mm 0; }
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
      const styleNode = document.createElement("style");
      styleNode.textContent = scoped;
      document.head.appendChild(styleNode);
      const host = document.createElement("div");
      host.className = "pos-cap";
      host.style.cssText = "position:fixed;left:-99999px;top:0;";
      host.innerHTML = receiptHtml;
      document.body.appendChild(host);
      try {
        const html2canvas = (await import("html2canvas-pro")).default;
        const canvas = await html2canvas(host, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const blob: Blob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob failed"))), "image/jpeg", 0.92),
        );
        const filename = `${billLocal.bill_no.replace(/[/\\]/g, "-")}.jpg`;
        return { blob, filename };
      } finally {
        host.remove();
        styleNode.remove();
      }
    };

    jpgBtn.onclick = async () => {
      jpgBtn.disabled = true;
      const orig = jpgBtn.textContent;
      jpgBtn.textContent = "...";
      try {
        const { blob, filename } = await captureBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success("JPG downloaded");
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "JPG generation failed");
      } finally {
        jpgBtn.disabled = false;
        jpgBtn.textContent = orig;
      }
    };

    waBtn.onclick = async () => {
      waBtn.disabled = true;
      const orig = waBtn.textContent;
      waBtn.textContent = "...";
      try {
        const [info, captured] = await Promise.all([
          shareInfo({ data: { id } }),
          captureBlob(),
        ]);
        const { shareBillJpgViaWhatsApp, shareResultToast } = await import(
          "@/lib/share-bill-jpg"
        );
        const result = await shareBillJpgViaWhatsApp({
          blob: captured.blob,
          filename: captured.filename,
          mobile: info.mobile,
        });
        const t = shareResultToast(result);
        if (t.ok) toast.success(t.msg, { duration: t.duration });
        else toast.error(t.msg, { duration: t.duration });
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "WhatsApp share failed");
      } finally {
        waBtn.disabled = false;
        waBtn.textContent = orig;
      }
    };
  };

  if (isLoading || !data) return <div className="p-8">Loading...</div>;
  const { bill, items, company } = data;

  const subtotal = Number(bill.subtotal || 0);
  const prevBal = Number(bill.previous_balance || 0); // signed; negative = due
  const prevDue = prevBal < 0 ? -prevBal : 0;
  const prevAdv = prevBal > 0 ? prevBal : 0;
  const payable = subtotal + prevDue;
  const discount = Number(bill.discount_amount || 0);
  const netPayable = Math.max(0, payable - discount);
  const paid = 0; // payments module not yet implemented
  const balance = paid - netPayable; // negative = customer owes

  const companyExtra = (company || {}) as CompanyPrintExtra;
  const dueDays = Number(companyExtra.payment_link_expiry_days || 7);
  const billDate = bill.bill_date ? safeDate(bill.bill_date, "dd-MMM-yyyy") : "";
  const payByDate = bill.bill_date
    ? (() => {
        const s = String(bill.bill_date).slice(0, 10);
        const [y, m, d] = s.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + 5));
        return safeDate(dt.toISOString().slice(0, 10), "dd-MMM-yyyy");
      })()
    : "";

  // bill_no already stored as `INV-000001/2026` (new format).
  // Fallback: append year if older record has no `/YYYY` suffix.
  const invoiceDisplay = /\/\d{4}$/.test(bill.bill_no)
    ? bill.bill_no
    : `${bill.bill_no}/${bill.bill_date ? String(bill.bill_date).slice(0, 4) : new Date().getFullYear()}`;

  const footerText = companyExtra.invoice_footer_text || "";

  const pageKey = (companyExtra.print_page_size || "A4").toUpperCase();
  const [pwMM, phMM] = PAGE_SIZES_MM[pageKey] || PAGE_SIZES_MM.A4;
  const orient = (companyExtra.print_orientation || "portrait") === "landscape" ? "landscape" : "portrait";
  const sheetWmm = orient === "landscape" ? phMM : pwMM;
  const sheetHmm = orient === "landscape" ? pwMM : phMM;
  const mT = Number(companyExtra.print_margin_top ?? 14);
  const mB = Number(companyExtra.print_margin_bottom ?? 14);
  const mL = Number(companyExtra.print_margin_left ?? 14);
  const mR = Number(companyExtra.print_margin_right ?? 14);
  const showHeader = companyExtra.print_show_header !== false;
  const showLogo = companyExtra.print_show_logo !== false;
  const showFooter = companyExtra.print_show_footer !== false;
  const showSigLine = companyExtra.print_signature_line !== false;
  const sigLabel = companyExtra.print_signature_label || "Authorized Signature";
  const sigUrl = companyExtra.print_signature_url || null;
  const copiesMode = (companyExtra.print_copies || "ORIGINAL").toUpperCase();
  const copies = copiesMode === "BOTH" ? ["ORIGINAL", "DUPLICATE"] : copiesMode === "DUPLICATE" ? ["DUPLICATE"] : ["ORIGINAL"];


  return (
    <div className="min-h-screen bg-neutral-100 text-black">
      <style>{`
        @page { size: ${pageKey} ${orient}; margin: ${mT}mm ${mR}mm ${mB}mm ${mL}mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .inv-sheet { box-shadow: none !important; }
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
        .inv-sheet { font-family: "Times New Roman", Georgia, serif; color: #000; }
        .inv-sheet .num { font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="no-print sticky top-0 bg-background border-b p-3 flex justify-end gap-2 z-10">
        <Button onClick={printPdf} disabled={printing || downloading}>
          {printing ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-1" />
          )}
          {printing ? "Preparing..." : "Print"}
        </Button>
        <Button variant="outline" onClick={downloadPdf} disabled={downloading || printing}>
          {downloading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1" />
          )}
          {downloading ? "Generating..." : "Download PDF"}
        </Button>
        <Button variant="outline" size="icon" title="POS View" onClick={openPosView}>
          <Smartphone className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/bills/$id", params: { id } })}>
          Close
        </Button>
      </div>

      {copies.map((cp, idx) => (
        <div
          key={cp + idx}
          className="inv-sheet mx-auto bg-white my-4 shadow print:shadow-none print:my-0"
          style={{
            width: `${sheetWmm}mm`,
            minHeight: `${sheetHmm}mm`,
            paddingTop: `${mT}mm`,
            paddingBottom: `${mB}mm`,
            paddingLeft: `${mL}mm`,
            paddingRight: `${mR}mm`,
            pageBreakAfter: idx < copies.length - 1 ? "always" : "auto",
          }}
        >
          {copies.length > 1 && (
            <div className="text-right text-[11px] italic mb-1">[ {cp} ]</div>
          )}
          {showHeader && (
            <div className="text-center pb-2 relative">
              {showLogo && companyExtra.logo_url && (
                <img
                  src={companyExtra.logo_url}
                  alt="Logo"
                  className="absolute left-0 top-0 h-14 w-auto object-contain"
                />
              )}
              <h1 className="text-[22px] font-bold tracking-wide leading-tight">
                {company?.company_name || "Company Name"}
              </h1>
              {company?.address && (
                <div className="text-[12px] leading-snug whitespace-pre-line">{company.address}</div>
              )}
              {company?.phone && <div className="text-[12px]">Mobile: {company.phone}</div>}
            </div>
          )}

          <div className="mt-4 mb-2 text-center">
            <span className="text-[13px] font-bold tracking-[0.2em] border-b-2 border-black pb-0.5 px-2">
              INVOICE
            </span>
          </div>


        {/* Customer info */}
        <div className="mt-2 mb-2 text-[12.5px]">
          <div className="font-bold mb-1">To,</div>
          <table className="w-full">
            <tbody>
              <InfoRow
                label="Company"
                value={(bill.customer?.company_name || bill.customer?.name || "-").toUpperCase()}
                bold
                rightExtra={<span className="num font-semibold">{invoiceDisplay}</span>}
              />
              <InfoRow label="BIN" value={bill.customer?.bin_number || "-"} mono />
              <InfoRow
                label="Tax Period"
                value={bill.billing_month ? safeDate(String(bill.billing_month), "MMM yyyy") : "-"}
              />
              <InfoRow label="Billing Date" value={<span className="text-red-600">{billDate || "-"}</span>} />
            </tbody>
          </table>
        </div>

        {/* Items table */}
        <table className="w-full text-[12.5px] border-collapse mt-2 border-b border-black">
          <thead>
            <tr>
              <th className="text-left py-1 px-2 w-12 font-semibold border-y border-black">
                Serial
              </th>
              <th className="text-left py-1 px-2 font-semibold border-y border-black">
                Description
              </th>
              <th className="text-right py-1 px-2 w-20 font-semibold border-y border-black">
                Qty
              </th>
              <th className="text-right py-1 px-2 w-28 font-semibold border-y border-black">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {(items as BillPrintItem[]).map((it, idx) => (
              <tr key={it.id} className="align-top">
                <td className="py-1 px-2">{idx + 1}</td>
                <td className="py-1 px-2">{it.service?.item_name}</td>
                <td className="py-1 px-2 text-right num">{Number(it.qty)}</td>
                <td className="py-1 px-2 text-right num">{fmt(it.final_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div className="flex justify-end mt-2">
          <table className="text-[12.5px] mt-0 w-[58%]">
            <tbody>
              <SumRow label="Grand Total" value={fmt(subtotal)} topBorder />
              <SumRow
                label="Previous Balance"
                value={prevBal < 0 ? `-${fmt(prevDue)}` : fmt(prevAdv)}
                negative={prevBal < 0}
                bold
              />
              <SumRow label="Payable" value={fmt(payable)} />
              <SumRow label="Discount" value={fmt(discount)} />
              <SumRow label="Net Payable" value={fmt(netPayable)} bold />
              <SumRow
                label="Balance"
                value={balance < 0 ? `-${fmt(-balance)}` : fmt(balance)}
                negative={balance < 0}
                bold
                topBorder
                bottomBorder
              />
            </tbody>
          </table>
        </div>

        {/* In words */}
        <div className="mt-2 text-[12px] italic text-right">
          [In Words: {numberToWords(netPayable)} Tk Only]
        </div>

          {/* Authorized Signature */}
          {showSigLine && (
            <div className="mt-16 text-right">
              <div className="inline-block text-right">
                {sigUrl && (
                  <img
                    src={sigUrl}
                    alt="Signature"
                    className="h-12 w-auto object-contain inline-block mb-1"
                  />
                )}
                <div className="border-t border-black w-full"></div>
                <div className="text-[11px] mt-2">{sigLabel}</div>
              </div>
            </div>
          )}

          {/* Pay-to block: three columns */}
          <div className="mt-5">
            <div className="font-semibold text-[13px] mb-1">Please Pay To:</div>
            <div className="border-t border-black"></div>
            <div className="grid grid-cols-3 gap-4 mt-2 text-[12px]">
              <div>
                <div>A/C Name: One Associate</div>
                <div>A/C No: 348 790 100 3900</div>
                <div>Bank: Pubali Bank PLC</div>
                <div>Branch: Dargah gate Islamic</div>
              </div>
              <div className="flex items-start justify-center h-full pt-1">
                <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center text-[12px]">
                  Or
                </div>
              </div>
              <div>
                <div>Bkash (Send Money):</div>
                <div>01719950891</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          {showFooter && payByDate && (
            <div className="mt-6 text-center text-[12.5px] bg-gray-100 border border-gray-300 rounded p-3">
              <div className="font-semibold">
                Please pay dues before <span className="text-red-600">{payByDate}</span> to avoid service interruption and send your payment document to our
                WhatsApp number.
              </div>
            </div>
          )}


          {bill.notes && (
            <div className="mt-3 text-[11px]">
              <span className="font-semibold">Notes: </span>
              {bill.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  bold,
  rightExtra,
  mt,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
  rightExtra?: React.ReactNode;
  mt?: number;
}) {
  const pt = mt ? `${mt}px` : undefined;
  return (
    <tr>
      <td className="pr-2 align-top w-28" style={{ paddingTop: pt }}>{label}</td>
      <td className="pr-2 align-top" style={{ paddingTop: pt }}>:</td>
      <td className={`${mono ? "num" : ""} ${bold ? "font-semibold" : ""}`} style={{ paddingTop: pt }}>{value}</td>
      {rightExtra !== undefined && <td className="text-right align-top pl-2" style={{ paddingTop: pt }}>{rightExtra}</td>}
    </tr>
  );
}

function SumRow({
  label,
  value,
  bold,
  negative,
  topBorder,
  bottomBorder,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
  topBorder?: boolean;
  bottomBorder?: boolean;
}) {
  const border =
    `${topBorder ? "border-t border-black" : ""} ${bottomBorder ? "border-b border-black" : ""}`.trim();
  return (
    <tr className={border}>
      <td className={`py-0 pr-2 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td className="py-0 px-1">:</td>
      <td
        className={`py-0 text-right num ${bold ? "font-bold" : ""} ${negative ? "text-red-600" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

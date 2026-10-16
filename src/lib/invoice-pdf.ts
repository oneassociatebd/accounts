import { addDays, format, parseISO } from "date-fns";

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
};

type InvoicePdfData = {
  bill: {
    bill_no: string;
    bill_date?: string | null;
    billing_month?: string | null;
    previous_balance?: number | string | null;
    subtotal?: number | string | null;
    discount_amount?: number | string | null;
    customer?: {
      bin_number?: string | null;
      company_name?: string | null;
      name?: string | null;
    } | null;
  };
  items: BillPrintItem[];
  company?:
    | ({
        company_name?: string | null;
        address?: string | null;
        phone?: string | null;
        bank_name?: string | null;
      } & CompanyPrintExtra)
    | null;
};

function fmt(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export async function downloadInvoicePdf(data: InvoicePdfData) {
  const { jsPDF } = await import("jspdf");
  const filename = `${data.bill.bill_no.replace(/[/\\]/g, "-")}.pdf`;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 14;
  const right = pageW - margin;
  let y = 16;
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
    if (y + needed <= pageH - margin) return;
    pdf.addPage();
    y = margin;
  };

  const { bill } = data;
  const items = data.items || [];
  const company = data.company;
  const subtotal = Number(bill.subtotal || 0);
  const prevBal = Number(bill.previous_balance || 0);
  const prevDue = prevBal < 0 ? -prevBal : 0;
  const prevAdv = prevBal > 0 ? prevBal : 0;
  const payable = subtotal + prevDue;
  const discount = Number(bill.discount_amount || 0);
  const netPayable = Math.max(0, payable - discount - prevAdv);
  const paid = 0;
  const balance = paid - netPayable;
  const dueDays = Number(company?.payment_link_expiry_days || 7);
  const billDate = bill.bill_date ? safeDate(bill.bill_date, "dd-MMM-yyyy") : "";
  const payByDate = bill.bill_date
    ? safeDate(
        addDays(parseISO(String(bill.bill_date)), dueDays)
          .toISOString()
          .slice(0, 10),
        "dd-MMM-yyyy",
      )
    : "";
  const invoiceDisplay = /\/\d{4}$/.test(bill.bill_no)
    ? bill.bill_no
    : `${bill.bill_no}/${bill.bill_date ? String(bill.bill_date).slice(0, 4) : new Date().getFullYear()}`;

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
  drawText("INVOICE", pageW / 2, y, 14, "bold", "center");
  drawText(invoiceDisplay, right, y, 9, "bold", "right");
  y += 3;
  pdf.setLineWidth(0.5);
  pdf.line(91, y, 119, y);
  y += 8;

  const infoRows = [
    ["BIN", bill.customer?.bin_number || "-"],
    ["Name", (bill.customer?.company_name || bill.customer?.name || "-").toUpperCase()],
    ["Tax Period", bill.billing_month ? safeDate(String(bill.billing_month), "MMM yyyy") : "-"],
    ["Billing Date", billDate || "-"],
  ];
  infoRows.forEach(([label, value]) => {
    drawText(label, margin, y, 10);
    drawText(":", 45, y, 10);
    drawText(value, 49, y, 10, label === "Name" ? "bold" : "normal");
    y += 5;
  });
  y += 3;

  drawLine(y, 0.5);
  y += 5;
  drawText("Serial", margin, y, 10, "bold");
  drawText("Description", 35, y, 10, "bold");
  drawText("Qty", 156, y, 10, "bold", "right");
  drawText("Total", right, y, 10, "bold", "right");
  y += 3;
  drawLine(y, 0.5);
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
    drawText(String(Number(it.qty || 0)), 156, y, 10, "normal", "right");
    drawText(fmt(it.final_amount), right, y, 10, "normal", "right");
    y += 5;
  });

  while (items.length < 3 && y < 92) y += 5;
  drawLine(y, 0.2);
  y += 6;

  const summaryX = 118;
  const summaryRows: Array<[string, string, boolean?]> = [
    ["Total", fmt(subtotal), false],
    ["Previous Balance", prevBal < 0 ? `-${fmt(prevDue)}` : fmt(prevAdv), true],
    ["Payable", fmt(payable), false],
    ["Discount", fmt(discount), false],
    ["Net Payable", fmt(netPayable), true],
    ["Paid", fmt(paid), false],
    ["Balance", balance < 0 ? `-${fmt(-balance)}` : fmt(balance), true],
  ];
  summaryRows.forEach(([label, value, bold], idx) => {
    addPageIfNeeded(8);
    if (idx === 0 || idx === summaryRows.length - 1) {
      pdf.line(summaryX, y - 3.5, right, y - 3.5);
    }
    drawText(label, summaryX, y, 10, bold ? "bold" : "normal");
    drawText(":", 162, y, 10);
    drawText(value, right, y, 10, bold ? "bold" : "normal", "right");
    y += 5;
  });
  pdf.line(summaryX, y - 3.5, right, y - 3.5);
  y += 4;

  addPageIfNeeded(45);
  drawText(`[In Words: ${numberToWords(netPayable)} Tk Only]`, margin, y, 9, "italic");
  y += 10;
  if (company?.bank_account_number || company?.bank_name) {
    drawText("Please Pay To:", margin, y, 10, "bold");
    y += 5;
    if (company.bank_account_number) {
      drawText(`A/C No: ${company.bank_account_number}`, margin, y, 10);
      y += 5;
    }
    if (company.company_name) {
      drawText(`A/C Name: ${company.company_name}`, margin, y, 10);
      y += 5;
    }
    if (company.bank_name) {
      drawText(
        `Bank Name: ${company.bank_name}${company.bank_branch ? `, ${company.bank_branch}` : ""}`,
        margin,
        y,
        10,
      );
      y += 5;
    }
  }
  y = Math.max(y + 8, pageH - 35);
  drawText(
    company?.invoice_footer_text || "Thanks for your business.",
    pageW / 2,
    y,
    10,
    "normal",
    "center",
  );
  if (payByDate) {
    y += 5;
    drawText(
      `*** Note: Please pay dues before ${payByDate} and send your payment document to our WhatsApp number.`,
      pageW / 2,
      y,
      9,
      "bold",
      "center",
    );
  }

  pdf.save(filename);
}

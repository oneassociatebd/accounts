import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Printer, Download, Eye } from "lucide-react";

export interface AreaOpt { id: string; area_name: string }
export interface ReferenceOpt { id: string; reference_name: string }

const openNativePicker = (input: HTMLInputElement | null) => {
  if (!input) return;
  try {
    input.showPicker?.();
  } catch {
    input.focus();
  }
};

interface FiltersProps {
  from?: string;
  to?: string;
  onFromChange?: (v: string) => void;
  onToChange?: (v: string) => void;
  areaId?: string;
  onAreaChange?: (v: string) => void;
  areas?: AreaOpt[];
  referenceId?: string;
  onReferenceChange?: (v: string) => void;
  references?: ReferenceOpt[];
  showDate?: boolean;
  extraSlot?: ReactNode;
  onPrint: () => void;
  printLabel?: string;
  printIcon?: "printer" | "eye";
  onCsv?: () => void;
  onPdf?: () => void;
  onExcel?: () => void;
}

export function ReportFilters(props: FiltersProps) {
  const {
    from, to, onFromChange, onToChange,
    areaId, onAreaChange, areas,
    referenceId, onReferenceChange, references,
    showDate = true,
    extraSlot,
    onPrint,
    onCsv,
    onPdf,
    onExcel,
    printLabel = "Print",
    printIcon = "printer",
  } = props;

  return (
    <Card className="print:hidden">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end flex-1 min-w-0">
            {showDate && (
              <>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from ?? ""} onChange={(e) => onFromChange?.(e.target.value)} onClick={(e) => openNativePicker(e.currentTarget)} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to ?? ""} onChange={(e) => onToChange?.(e.target.value)} onClick={(e) => openNativePicker(e.currentTarget)} />
                </div>
              </>
            )}
            {areas && onAreaChange && (
              <div>
                <Label className="text-xs">Area</Label>
                <Select value={areaId ?? "all"} onValueChange={(v) => onAreaChange(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All areas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All areas</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {references && onReferenceChange && (
              <div>
                <Label className="text-xs">Reference</Label>
                <Select value={referenceId ?? "all"} onValueChange={(v) => onReferenceChange(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All references" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All references</SelectItem>
                    {references.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.reference_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {extraSlot}
          </div>
          <div className="flex gap-2 justify-end flex-wrap shrink-0">
            <Button variant="outline" size="sm" onClick={onPrint}>
              {printIcon === "eye" ? <Eye className="h-4 w-4 mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
              {printLabel}
            </Button>
            {onPdf && (
              <Button variant="outline" size="sm" onClick={onPdf}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
            )}
            {onExcel && (
              <Button variant="outline" size="sm" onClick={onExcel}>
                <Download className="h-4 w-4 mr-1" /> Excel
              </Button>
            )}
            {onCsv && (
              <Button variant="outline" size="sm" onClick={onCsv}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SummaryCard { label: string; value: string | number; tone?: "default" | "success" | "danger" | "warning" }

export function SummaryCards({ items }: { items: SummaryCard[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{it.label}</div>
            <div className={`text-lg md:text-base lg:text-2xl font-semibold mt-1 tabular-nums break-all leading-tight ${
              it.tone === "success" ? "text-green-600"
                : it.tone === "danger" ? "text-destructive"
                : it.tone === "warning" ? "text-amber-600"
                : ""
            }`}>{it.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function printReport() {
  window.print();
}

export const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);

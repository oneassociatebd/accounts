import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthPickerProps {
  /** Value in `YYYY-MM` format. Empty string = unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  align?: "start" | "center" | "end";
}

function formatLabel(value: string) {
  if (!value) return "";
  const [y, m] = value.split("-");
  const idx = Number(m) - 1;
  if (!y || isNaN(idx) || idx < 0 || idx > 11) return "";
  return `${MONTH_NAMES[idx]} ${y}`;
}

export function MonthPicker({
  value,
  onChange,
  placeholder = "Pick month",
  className,
  error,
  align = "start",
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const defaultYear = value
    ? parseInt(value.slice(0, 4), 10)
    : today.getFullYear();
  const [year, setYear] = useState<number>(defaultYear);

  const selectedYear = value ? parseInt(value.slice(0, 4), 10) : null;
  const selectedMonth = value ? parseInt(value.slice(5, 7), 10) - 1 : null;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setYear(value ? parseInt(value.slice(0, 4), 10) : today.getFullYear());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between font-normal text-sm px-3 bg-transparent",
            !value && "text-muted-foreground",
            error && "border-destructive",
            className,
          )}
        >
          {value ? formatLabel(value) : placeholder}
          <CalendarIcon className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-2 pointer-events-auto">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="text-xs font-medium">{year}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTH_NAMES.map((name, idx) => {
            const v = `${year}-${String(idx + 1).padStart(2, "0")}`;
            const isSelected = selectedYear === year && selectedMonth === idx;
            return (
              <PopoverPrimitive.Close asChild key={name}>
                <Button
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-1 text-xs"
                  onClick={() => onChange(v)}
                >
                  {name}
                </Button>
              </PopoverPrimitive.Close>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

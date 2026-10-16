import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, totalPages, onPageChange }: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  const clamp = (n: number) => Math.min(totalPages, Math.max(1, n));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <div className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)}>
          « First
        </Button>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">Go to</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            key={page}
            className="h-8 w-16"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onPageChange(clamp(Number((e.target as HTMLInputElement).value) || 1));
              }
            }}
            onBlur={(e) => {
              const n = clamp(Number(e.target.value) || 1);
              if (n !== page) onPageChange(n);
            }}
          />
        </div>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
          Last »
        </Button>
      </div>
    </div>
  );
}

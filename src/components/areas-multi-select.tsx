import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type AreaOption = {
  id: string;
  area_name: string;
  location?: { location_name?: string } | null;
};

interface AreasMultiSelectProps {
  areas: AreaOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function AreasMultiSelect({ areas, selected, onChange, placeholder = "Select areas..." }: AreasMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedIds = selected.map(String);

  const toggle = (id: string) => {
    const normalizedId = String(id);
    onChange(selectedIds.includes(normalizedId) ? selectedIds.filter((x) => x !== normalizedId) : [...selectedIds, normalizedId]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-muted-foreground">
              {selected.length > 0 ? `${selected.length} area(s) selected` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search areas..." />
            <CommandList>
              <CommandEmpty>No areas found.</CommandEmpty>
              <CommandGroup>
                {areas.map((a) => {
                  const isSel = selectedIds.includes(String(a.id));
                  return (
                    <CommandItem
                      key={a.id}
                      value={`${a.area_name} ${a.location?.location_name ?? ""}`}
                      onSelect={() => toggle(a.id)}
                      className={cn(isSel && "bg-accent text-accent-foreground")}
                    >
                      <Check className={cn("mr-2 h-4 w-4 text-primary", isSel ? "opacity-100" : "opacity-0")} />
                      <span>
                        {a.area_name}{" "}
                        <span className="text-muted-foreground">({a.location?.location_name})</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

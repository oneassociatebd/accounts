import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ManagerOption = { id: string; name: string; username?: string | null };

interface Props {
  managers: ManagerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function ManagersMultiSelect({ managers, selected, onChange, placeholder = "Assign managers..." }: Props) {
  const [open, setOpen] = useState(false);
  const sel = selected.map(String);
  const toggle = (id: string) => {
    const n = String(id);
    onChange(sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate text-muted-foreground">
            {selected.length > 0 ? `${selected.length} manager(s) assigned` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search managers..." />
          <CommandList>
            <CommandEmpty>No managers found.</CommandEmpty>
            <CommandGroup>
              {managers.map((m) => {
                const s = sel.includes(String(m.id));
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.name} ${m.username ?? ""}`}
                    onSelect={() => toggle(m.id)}
                    className={cn(s && "bg-accent text-accent-foreground")}
                  >
                    <Check className={cn("mr-2 h-4 w-4 text-primary", s ? "opacity-100" : "opacity-0")} />
                    <span>
                      {m.name}
                      {m.username && <span className="text-muted-foreground"> (@{m.username})</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

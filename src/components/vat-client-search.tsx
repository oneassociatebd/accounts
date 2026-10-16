import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { searchVatClients } from "@/lib/vat.functions";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export interface VatClient {
  id: string;
  company_name: string | null;
  name: string | null;
  mobile: string | null;
  address: string | null;
  bin_number: string | null;
}

interface Props {
  value: VatClient | null;
  onChange: (c: VatClient | null) => void;
  disabled?: boolean;
}

export function VatClientSearch({ value, onChange, disabled }: Props) {
  const searchFn = useServerFn(searchVatClients);
  const [search, setSearch] = useState<string>(value ? (value.company_name || value.name || "") : "");
  const [searchOpen, setSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // keep input synced when parent value changes (e.g. edit mode)
  useEffect(() => {
    setSearch(value ? (value.company_name || value.name || "") : "");
  }, [value?.id]);

  // close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["vat-client-search", search],
    queryFn: () => searchFn({ data: { query: search } }),
    enabled: searchOpen && search.trim().length >= 2,
  });

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Search by BIN, company name, or mobile..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setSearchOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setSearchOpen(true)}
        disabled={disabled}
        className="pl-8"
      />
      {searchOpen && search.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
          {(searchResults as VatClient[]).length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No matches</div>
          ) : (
            (searchResults as VatClient[]).map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  onChange(c);
                  setSearch(c.company_name || c.name || "");
                  setSearchOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
              >
                <div className="font-medium">{c.company_name || c.name}</div>
                <div className="text-xs text-muted-foreground">
                  BIN: {c.bin_number || "-"} · {c.mobile || "-"}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

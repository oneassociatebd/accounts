import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listReferences, createReference, toggleReference, updateReference } from "@/lib/erp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/master/references")({
  head: () => ({
    meta: [{ title: "One | References" }],
  }),
  component: ReferencesPage,
});

type Reference = {
  id: string;
  reference_name: string;
  is_active: boolean;
  whatsapp_number?: string | null;
  mobile_number?: string | null;
};

type EditState = { whatsapp?: string; mobile?: string; whatsappError?: string | null };

const WA_REGEX = /^\+8801\d{9}$/;

function validateWa(v: string): string | null {
  if (!v) return null;
  return WA_REGEX.test(v.trim()) ? null : "Must be in +8801XXXXXXXXX format";
}

function ReferencesPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listReferences);
  const createFn = useServerFn(createReference);
  const toggleFn = useServerFn(toggleReference);
  const updateFn = useServerFn(updateReference);
  const { data: items = [], isLoading } = useQuery<Reference[]>({
    queryKey: ["references"],
    queryFn: () => fetchFn() as Promise<Reference[]>,
  });
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((t) =>
      t.reference_name.toLowerCase().includes(q) ||
      (t.whatsapp_number ?? "").includes(q) ||
      (t.mobile_number ?? "").includes(q)
    );
  }, [items, search]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const waErr = validateWa(whatsapp);
    if (waErr) {
      setWhatsappError(waErr);
      toast.error(waErr);
      return;
    }
    setBusy(true);
    try {
      await createFn({ data: {
        reference_name: name.trim(),
        whatsapp_number: whatsapp.trim() || undefined,
        mobile_number: mobile.trim() || undefined,
      } });
      setName("");
      setWhatsapp("");
      setMobile("");
      setWhatsappError(null);
      toast.success("Reference added");
      qc.invalidateQueries({ queryKey: ["references"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (id: string, v: boolean) => {
    try {
      await toggleFn({ data: { id, is_active: v } });
      qc.invalidateQueries({ queryKey: ["references"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const saveRow = async (t: Reference) => {
    const e = edits[t.id] ?? {};
    const waErr = validateWa(e.whatsapp ?? "");
    if (waErr) {
      setEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], whatsappError: waErr } }));
      toast.error(waErr);
      return;
    }
    const patch: { id: string; whatsapp_number?: string | null; mobile_number?: string | null } = { id: t.id };
    if (e.whatsapp !== undefined) patch.whatsapp_number = e.whatsapp.trim() || null;
    if (e.mobile !== undefined) patch.mobile_number = e.mobile.trim() || null;
    try {
      await updateFn({ data: patch });
      toast.success("Updated");
      setEdits((prev) => {
        const n = { ...prev };
        delete n[t.id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["references"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">References</h1>
        <p className="text-sm text-muted-foreground">Master list of customer reference sources (e.g. Walk-in, Friend, Facebook)</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Add Reference</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Reference name (e.g. Facebook)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            <div className="flex flex-col gap-1 flex-1">
              <Input
                placeholder="WhatsApp: +8801XXXXXXXXX"
                value={whatsapp}
                onChange={(e) => { setWhatsapp(e.target.value); setWhatsappError(null); }}
                maxLength={20}
                className={whatsappError ? "border-destructive" : ""}
              />
              {whatsappError && <span className="text-xs text-destructive">{whatsappError}</span>}
            </div>
            <Input placeholder="Mobile number (optional)" value={mobile} onChange={(e) => setMobile(e.target.value)} maxLength={20} />
            <Button type="submit" disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>All References</CardTitle>
            <Input
              placeholder="Search by name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp Number</TableHead>
                <TableHead>Mobile Number</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6}><TableSkeleton rows={4} cols={6} /></TableCell></TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{search ? "No matching references" : "No references yet"}</TableCell></TableRow>
              ) : filteredItems.map((t, i) => {
                const e = edits[t.id] ?? {};
                const waVal = e.whatsapp ?? (t.whatsapp_number ?? "");
                const mbVal = e.mobile ?? (t.mobile_number ?? "");
                const dirty =
                  (e.whatsapp !== undefined && e.whatsapp !== (t.whatsapp_number ?? "")) ||
                  (e.mobile !== undefined && e.mobile !== (t.mobile_number ?? ""));
                return (
                  <TableRow key={t.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{t.reference_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          value={waVal}
                          maxLength={20}
                          placeholder="e.g. +8801XXXXXXXXX"
                          className={e.whatsappError ? "border-destructive" : ""}
                          onChange={(ev) => setEdits((p) => ({ ...p, [t.id]: { ...p[t.id], whatsapp: ev.target.value, whatsappError: undefined } }))}
                        />
                        {e.whatsappError && <span className="text-xs text-destructive">{e.whatsappError}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={mbVal}
                        maxLength={20}
                        placeholder="e.g. 01XXXXXXXXX"
                        onChange={(ev) => setEdits((p) => ({ ...p, [t.id]: { ...p[t.id], mobile: ev.target.value } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.is_active} onCheckedChange={(v) => onToggle(t.id, v)} />
                    </TableCell>
                    <TableCell>
                      {dirty && (
                        <Button size="sm" variant="outline" onClick={() => saveRow(t)}>
                          <Save className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

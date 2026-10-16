import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, HardDrive, Layers, RefreshCw, Loader2, Info, Package, Download, Upload } from "lucide-react";
import { getDatabaseSize, exportDatabaseBackup, importDatabaseBackup } from "@/lib/dashboard.functions";
import { useAuth } from "@/lib/auth-context";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/system-info")({
  head: () => ({ meta: [{ title: "One | System Info" }] }),
  component: SystemInfoPage,
});

const fmtBytes = (bytes: number) => {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};

const fmtNum = (n: number) => Number(n || 0).toLocaleString("en-US");

function SystemInfoPage() {
  const { role } = useAuth();
  const fetchSize = useServerFn(getDatabaseSize);
  const runBackup = useServerFn(exportDatabaseBackup);
  const runImport = useServerFn(importDatabaseBackup);
  const [downloading, setDownloading] = useState(false);
  const [sqlDownloading, setSqlDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["system-info"],
    queryFn: () => fetchSize(),
    enabled: role === "admin",
    staleTime: 1000 * 60 * 5,
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const dump = await runBackup();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `database-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Database backup downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleSqlDownload = async () => {
    setSqlDownloading(true);
    try {
      const dump = await runBackup();
      const esc = (s: string) => s.replace(/'/g, "''");
      const lines = [
        `-- One Associate database backup`,
        `-- Exported at: ${dump.exported_at}`,
        "",
      ];
      for (const [table, rows] of Object.entries(dump.tables)) {
        lines.push(`-- Table: ${table} (${rows.length} rows)`);
        if (rows.length === 0) { lines.push(""); continue; }
        for (let i = 0; i < rows.length; i += 200) {
          const json = esc(JSON.stringify(rows.slice(i, i + 200)));
          lines.push(
            `INSERT INTO public."${table}" SELECT * FROM jsonb_populate_recordset(NULL::public."${table}", '${json}'::jsonb) ON CONFLICT DO NOTHING;`,
          );
        }
        lines.push("");
      }
      const blob = new Blob([lines.join("\n")], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `database-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("SQL backup downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setSqlDownloading(false);
    }
  };

  const handleUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!confirm(`Restore data from "${file.name}"? Existing rows with the same ID will be overwritten.`)) return;
    setUploading(true);
    try {
      const text = await file.text();
      const re = /INSERT INTO public\."([a-zA-Z0-9_]+)" SELECT \* FROM jsonb_populate_recordset\(NULL::public\."[a-zA-Z0-9_]+", '((?:[^']|'')*)'::jsonb\)/g;
      const tables: Record<string, any[]> = {};
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const rows = JSON.parse(m[2].replace(/''/g, "'"));
        (tables[m[1]] ||= []).push(...rows);
      }
      if (Object.keys(tables).length === 0) throw new Error("No backup data found. Please upload a SQL file downloaded from this page.");
      const res = await runImport({ data: { tables } });
      const total = Object.values(res.imported).reduce((s, n) => s + n, 0);
      toast.success(`Restored ${total} rows across ${Object.keys(res.imported).length} tables`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (role !== "admin") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Only Admin can view this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl pb-24">
      <div className="flex items-start justify-between gap-4 sticky top-0 bg-background z-10 py-2">
        <div className="flex items-center gap-3">
          <Info className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">System Info</h1>
            <p className="text-sm text-muted-foreground">
              Details of database, storage and table/file based sizes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download Database
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-destructive">
          {error instanceof Error ? error.message : "Failed to load"}
        </CardContent></Card>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="App Data" value={fmtBytes(data.tables.reduce((s, t) => s + (t.size_bytes || 0), 0))} icon={Package} tone="emerald" />
            <SummaryCard label="Database" value={fmtBytes(data.db_bytes)} icon={Database} tone="indigo" />
            <SummaryCard label="Storage" value={fmtBytes(data.storage_bytes)} icon={HardDrive} tone="teal" />
            <SummaryCard label="Total" value={fmtBytes(data.bytes)} icon={Layers} tone="gradient" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-600" />
                Database Tables ({data.tables.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.tables.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No tables</TableCell></TableRow>
                    ) : data.tables.map((t) => (
                      <TableRow key={t.table_name}>
                        <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(t.row_count)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtBytes(t.size_bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-teal-600" />
                  Storage Files ({data.files.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".sql,text/plain" className="hidden" onChange={handleUpload} />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload SQL
                  </Button>
                  <Button size="sm" onClick={handleSqlDownload} disabled={sqlDownloading}>
                    {sqlDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                    Download SQL
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bucket</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.files.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No files</TableCell></TableRow>
                    ) : data.files.map((f, i) => (
                      <TableRow key={`${f.bucket_id}/${f.name}/${i}`}>
                        <TableCell className="text-xs">{f.bucket_id}</TableCell>
                        <TableCell className="font-mono text-xs break-all">{f.name}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtBytes(f.size_bytes)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label, value, icon: Icon, tone,
}: { label: string; value: string; icon: typeof Database; tone: "indigo" | "teal" | "gradient" | "emerald" }) {
  const toneClasses =
    tone === "indigo" ? "from-indigo-500 to-indigo-600" :
    tone === "teal" ? "from-teal-500 to-teal-600" :
    tone === "emerald" ? "from-emerald-500 to-emerald-600" :
    "from-indigo-500 to-teal-500";
  const valueClasses =
    tone === "gradient"
      ? "bg-gradient-to-r from-indigo-600 to-teal-600 bg-clip-text text-transparent"
      : tone === "indigo" ? "text-indigo-700" : tone === "emerald" ? "text-emerald-700" : "text-teal-700";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${toneClasses} text-white flex items-center justify-center shadow-md`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold tabular-nums ${valueClasses}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

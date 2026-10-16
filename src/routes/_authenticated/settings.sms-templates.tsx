import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listSmsTemplates, updateSmsTemplate, renderTemplate, type SmsTemplateRow } from "@/lib/sms-templates.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/skeleton-loader";

export const Route = createFileRoute("/_authenticated/settings/sms-templates")({
  head: () => ({ meta: [{ title: "SMS Templates" }] }),
  component: SmsTemplatesPage,
});

// Sample values per template, used for the live preview.
const SAMPLE_VALUES: Record<string, Record<string, string | number>> = {
  bill_notification: {
    month: "জুন-2026",
    current_bill: "1500",
    due: "500",
    discount: "100",
    grand_total: "1900",
    sender_role: "অ্যাডমিন",
    company_name: "One Associate",
  },
  collection_receipt: {
    total_payable: "2000",
    paid: "1500",
    due: "500",
    sender_role: "অ্যাডমিন",
    company_name: "One Associate",
  },
  due_reminder: {
    customer_name: "ABC Traders",
    date: "09/06/2026",
    due: "2500",
    sender_role: "অ্যাডমিন",
    company_name: "One Associate",
  },
  bkash_payment_link: {
    month: "2026-06",
    amount: "1900",
    url: "https://example.com/r/abc123",
    company_name: "One Associate",
  },
  vat_submission: {
    tax_period: "Jul 2026",
    submission_id: "VAT-2026-000001",
    sender_role: "অ্যাডমিন",
    company_name: "One Associate",
  },
  mushak_submission: {
    boe_date: "১২ জুন ২০২৬",
    item_name: "Iron Plate",
    submission_id: "M43-2026-000001",
    sender_role: "অ্যাডমিন",
    company_name: "One Associate",
  },
  test_sms: { company_name: "One Associate" },
};

function SmsTemplatesPage() {
  const { role } = useAuth();
  const fetchAll = useServerFn(listSmsTemplates);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sms-templates"],
    queryFn: () => fetchAll(),
    enabled: role === "admin",
  });

  if (role && role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">SMS Templates</h1>
        <p className="text-sm text-muted-foreground">
          Edit the Bangla SMS body sent for each event. Use <code className="text-xs">{`{{variable}}`}</code> placeholders.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={1} />
      ) : (
        <div className="grid gap-4">
          {(data ?? []).map((t) => (
            <TemplateCard key={t.key} template={t} onSaved={() => qc.invalidateQueries({ queryKey: ["sms-templates"] })} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, onSaved }: { template: SmsTemplateRow; onSaved: () => void }) {
  const update = useServerFn(updateSmsTemplate);
  const [body, setBody] = useState(template.body);
  const [active, setActive] = useState(template.is_active);
  const [saving, setSaving] = useState(false);
  const [textareaEl, setTextareaEl] = useState<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setBody(template.body);
    setActive(template.is_active);
  }, [template.body, template.is_active]);

  const sample = SAMPLE_VALUES[template.key] ?? {};
  const preview = useMemo(() => renderTemplate(body, sample), [body, sample]);
  const dirty = body !== template.body || active !== template.is_active;

  const insertVar = (name: string) => {
    const ta = textareaEl;
    const token = `{{${name}}}`;
    if (!ta) {
      setBody((b) => b + token);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    queueMicrotask(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await update({ data: { key: template.key, body, is_active: active } });
      toast.success(`Saved: ${template.name}`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBody(template.body);
    setActive(template.is_active);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
            )}
            <code className="text-[10px] text-muted-foreground">{template.key}</code>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`active-${template.key}`} className="text-xs">Active</Label>
            <Switch
              id={`active-${template.key}`}
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {template.variables?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {template.variables.map((v) => (
              <Badge
                key={v.name}
                variant="secondary"
                className="cursor-pointer hover:bg-accent"
                title={v.description || v.name}
                onClick={() => insertVar(v.name)}
              >
                {`{{${v.name}}}`}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">Message body</Label>
            <Textarea
              ref={setTextareaEl}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={1000}
              className="font-mono text-sm"
              dir="auto"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{body.length}/1000 characters</p>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Preview (with sample values)</Label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap min-h-[150px]" dir="auto">
              {preview || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

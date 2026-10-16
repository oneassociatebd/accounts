import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Bypass missing generated types until the migration is applied & types
// regenerate. The runtime shape is enforced via Zod + explicit selects.
const db = supabaseAdmin as unknown as {
  from: (t: string) => any;
};

export type SmsTemplateVar = { name: string; description?: string };
export type SmsTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  body: string;
  variables: SmsTemplateVar[];
  is_active: boolean;
  updated_at: string;
};

// Replace {{name}} placeholders with values from vars. Missing keys => "".
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Server-side helper: fetch active template body and render. On any failure
// (missing row, inactive, DB error, table not yet migrated), returns the
// provided fallback so SMS behaviour is preserved.
export async function renderSmsTemplate(
  key: string,
  vars: Record<string, string | number | null | undefined>,
  fallback: string,
): Promise<string> {
  try {
    const { data, error } = await db
      .from("sms_templates")
      .select("body, is_active")
      .eq("key", key)
      .maybeSingle();
    if (error || !data || !data.is_active || !data.body) return fallback;
    return renderTemplate(String(data.body), vars);
  } catch {
    return fallback;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const listSmsTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Admin only");
    const { data, error } = await db
      .from("sms_templates")
      .select("id, key, name, description, body, variables, is_active, updated_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SmsTemplateRow[];
  });

export const updateSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1).max(64),
        body: z.string().min(1).max(1000),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Admin only");
    const patch: Record<string, unknown> = {
      body: data.body,
      updated_by: context.userId,
    };
    if (typeof data.is_active === "boolean") patch.is_active = data.is_active;
    const { error } = await db.from("sms_templates").update(patch).eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

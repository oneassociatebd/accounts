import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

// ---------- Role Permissions ----------

export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("role_permissions")
      .select("*")
      .order("module")
      .order("action");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const UpdatePermissionSchema = z.object({
  id: z.string().uuid(),
  allowed: z.boolean(),
});

export const updateRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.array(UpdatePermissionSchema).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const results = await Promise.all(
      data.map((r) =>
        supabaseAdmin
          .from("role_permissions")
          .update({ allowed: r.allowed })
          .eq("id", r.id)
      )
    );
    const err = results.find((r) => r.error)?.error;
    if (err) throw new Error(err.message);
    return { success: true };
  });

// ---------- Company Settings ----------

const SECRET_FIELDS = [
  "sms_api_key",
  "whatsapp_api_key",
  "bkash_api_key",
  "bkash_secret_key",
] as const;

function redactSecrets<T extends Record<string, any> | null>(row: T): T {
  if (!row) return row;
  const out: any = { ...row };
  for (const k of SECRET_FIELDS) {
    out[`has_${k}`] = !!out[k];
    out[k] = "";
  }
  return out;
}

export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return redactSecrets(data);
  });

// Accepts any subset of company_settings fields. Secret fields are only written
// when a non-empty string is provided, so reloading + saving never wipes them.
const SaveCompanySettingsSchema = z
  .object({ id: z.string().uuid() })
  .catchall(z.any());

export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SaveCompanySettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, created_at, updated_at, ...rest } = data as Record<string, any>;
    // Strip helper flags and unchanged secret placeholders
    for (const k of SECRET_FIELDS) {
      delete rest[`has_${k}`];
      if (rest[k] === "" || rest[k] == null) delete rest[k];
    }
    const { error } = await supabaseAdmin
      .from("company_settings")
      .update(rest as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });


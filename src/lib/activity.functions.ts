import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ONLINE_WINDOW_MINUTES = 30;
const ACTIVE_WINDOW_MINUTES = 5;

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        path: z.string().min(1).max(255).optional(),
        hadInteraction: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const now = new Date().toISOString();
    const update: {
      user_id: string;
      last_seen_at: string;
      last_path: string | null;
      updated_at: string;
      last_interaction_at?: string;
    } = {
      user_id: userId,
      last_seen_at: now,
      last_path: data.path ?? null,
      updated_at: now,
    };
    if (data.hadInteraction) {
      update.last_interaction_at = now;
    }
    const { error } = await supabaseAdmin
      .from("user_activity")
      .upsert(update, { onConflict: "user_id" });
    if (error) {
      console.error("[heartbeat]", error);
      throw new Error("Failed to record activity");
    }
    return { ok: true };
  });

export type ActiveUser = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "manager" | null;
  last_seen_at: string;
  last_interaction_at: string | null;
  last_path: string | null;
};

export const getActiveUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    onlineCount: number;
    activeCount: number;
    users: ActiveUser[];
    online_window_minutes: number;
    active_window_minutes: number;
  }> => {
    const { userId } = context;
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    if (!roleRow) {
      return { onlineCount: 0, activeCount: 0, users: [], online_window_minutes: ONLINE_WINDOW_MINUTES, active_window_minutes: ACTIVE_WINDOW_MINUTES };
    }

    const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("user_activity")
      .select("user_id, last_seen_at, last_interaction_at, last_path")
      .gte("last_seen_at", onlineCutoff)
      .order("last_seen_at", { ascending: false });
    if (error) {
      console.error("[getActiveUsers]", error);
      return { onlineCount: 0, activeCount: 0, users: [], online_window_minutes: ONLINE_WINDOW_MINUTES, active_window_minutes: ACTIVE_WINDOW_MINUTES };
    }
    const online = (rows ?? []) as Array<{
      user_id: string; last_seen_at: string; last_interaction_at: string | null; last_path: string | null;
    }>;
    if (online.length === 0) return { onlineCount: 0, activeCount: 0, users: [], online_window_minutes: ONLINE_WINDOW_MINUTES, active_window_minutes: ACTIVE_WINDOW_MINUTES };

    const ids = online.map((r) => r.user_id);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, username, email, is_active").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role as "admin" | "manager"]));

    const users: ActiveUser[] = online
      .map((r) => {
        const p = profMap.get(r.user_id) as
          | { name?: string; username?: string; email?: string; is_active?: boolean }
          | undefined;
        if (p && p.is_active === false) return null;
        return {
          id: r.user_id,
          name: p?.name || p?.username || "—",
          email: p?.email ?? null,
          role: roleMap.get(r.user_id) ?? null,
          last_seen_at: r.last_seen_at,
          last_interaction_at: r.last_interaction_at,
          last_path: r.last_path,
        };
      })
      .filter((x): x is ActiveUser => x !== null);

    const activeCount = users.filter((u) =>
      u.last_interaction_at && new Date(u.last_interaction_at).getTime() >= new Date(activeCutoff).getTime()
    ).length;

    return {
      onlineCount: users.length,
      activeCount,
      users,
      online_window_minutes: ONLINE_WINDOW_MINUTES,
      active_window_minutes: ACTIVE_WINDOW_MINUTES,
    };
  });

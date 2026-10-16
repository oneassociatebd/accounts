import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- helpers ----------
async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function getUserRole(userId: string): Promise<"admin" | "manager" | null> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  return null;
}

async function getManagerCustomerIds(userId: string): Promise<string[]> {
  // SECURITY: Scope strictly to current customer_managers assignments.
  // Access must be lost on unassignment; do NOT include area-based or
  // creator-based customers here.
  const { data } = await supabaseAdmin
    .from("customer_managers")
    .select("customer_id")
    .eq("manager_id", userId);
  return Array.from(new Set((data ?? []).map((r) => r.customer_id)));
}

// ---------- check whether any admin exists (safe, no creation) ----------
export const checkAdminExists = createServerFn({ method: "POST" }).handler(async () => {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return { exists: (count ?? 0) > 0 };
});


// ---------- create custom admin (no auth required, for first-time setup) ----------
export const createCustomAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(255),
      password: z.string().min(8).max(72),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) {
      throw new Error("An admin already exists. Delete it first to create a new one.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        username: data.email.split("@")[0],
        mobile: "",
        role: "admin",
      },
    });
    if (error) throw new Error(error.message);

    if (created.user) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
    }

    return { created: true, email: data.email };
  });

// ---------- delete bootstrap admin (DISABLED) ----------
// Admin accounts must never be deletable through the app. This endpoint is
// permanently disabled to prevent removal of the default administrator.
export const deleteBootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error("Deleting admin accounts is not permitted.");
});

// ---------- current user profile + role ----------
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*, area:areas(id,area_name,location:locations(id,location_name))").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roleList = (roles ?? []).map((r) => r.role);
    const role = roleList.includes("admin") ? "admin" : roleList.includes("manager") ? "manager" : null;
    let permissions: Record<string, boolean> = {};
    if (role) {
      const { data: perms } = await supabaseAdmin
        .from("role_permissions")
        .select("permission_key, allowed")
        .eq("role", role);
      permissions = Object.fromEntries((perms ?? []).map((p: any) => [p.permission_key, !!p.allowed]));
    }
    return { profile, role, permissions };
  });


// ---------- users ----------
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [profilesRes, rolesRes, userAreasRes, areasRes, locationsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("user_areas").select("user_id, area_id"),
      supabaseAdmin.from("areas").select("id, area_name, location_id"),
      supabaseAdmin.from("locations").select("id, location_name"),
    ]);
    const { data: profiles, error } = profilesRes;
    if (error) throw new Error(error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (userAreasRes.error) throw new Error(userAreasRes.error.message);
    if (areasRes.error) throw new Error(areasRes.error.message);
    if (locationsRes.error) throw new Error(locationsRes.error.message);
    const locationMap = new Map((locationsRes.data ?? []).map((l) => [l.id, l]));
    const areaById = new Map((areasRes.data ?? []).map((a) => [a.id, { ...a, location: a.location_id ? locationMap.get(a.location_id) ?? null : null }]));
    const roleMap = new Map<string, string>();
    (rolesRes.data ?? []).forEach((r) => roleMap.set(r.user_id, r.role));
    const areaMap = new Map<string, any[]>();
    (userAreasRes.data ?? []).forEach((r) => {
      const arr = areaMap.get(r.user_id) ?? [];
      const area = areaById.get(r.area_id);
      if (area) arr.push(area);
      areaMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({
      ...p,
      area: p.area_id ? areaById.get(p.area_id) ?? null : null,
      role: roleMap.get(p.id) ?? "manager",
      areas: areaMap.get(p.id) ?? [],
    }));
  });

const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().trim().email().max(255),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  password: z.string().min(8).max(72),
  role: z.enum(["admin", "manager"]),
  area_ids: z.array(z.string().uuid()).optional().default([]),
  is_active: z.boolean().optional().default(true),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.role === "manager" && data.area_ids.length === 0) {
      throw new Error("At least one assigned area is required for managers.");
    }
    const primaryArea = data.area_ids[0] ?? null;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        username: data.username,
        mobile: data.mobile ?? "",
        role: data.role,
        area_id: primaryArea ?? "",
        created_by: context.userId,
      },
    });
    if (error) throw new Error(error.message);
    if (created.user?.id) {
      await supabaseAdmin
        .from("profiles")
        .update({ is_active: data.is_active, area_id: primaryArea })
        .eq("id", created.user.id);
      if (data.area_ids.length > 0) {
        const rows = data.area_ids.map((area_id) => ({ user_id: created.user!.id, area_id }));
        await supabaseAdmin.from("user_areas").insert(rows);
      }
    }
    return { id: created.user?.id };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.enum(["admin", "manager"]),
  area_ids: z.array(z.string().uuid()).optional().default([]),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.role === "manager" && data.area_ids.length === 0) {
      throw new Error("At least one assigned area is required for managers.");
    }
    const primaryArea = data.area_ids[0] ?? null;
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, mobile: data.mobile ?? null, area_id: primaryArea })
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);
    // Replace area assignments
    const { error: deleteAreasError } = await supabaseAdmin.from("user_areas").delete().eq("user_id", data.id);
    if (deleteAreasError) throw new Error(deleteAreasError.message);
    if (data.area_ids.length > 0) {
      const rows = data.area_ids.map((area_id) => ({ user_id: data.id, area_id }));
      const { error: insertAreasError } = await supabaseAdmin.from("user_areas").insert(rows);
      if (insertAreasError) throw new Error(insertAreasError.message);
    }
    // Update role: delete existing, insert new
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      password: z.string().min(8).max(72),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) {
      throw new Error("You cannot disable your own account");
    }
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Revoke/restore auth at the token layer so a disabled user cannot keep
    // using an unexpired JWT until it expires.
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      ban_duration: data.is_active ? "none" : "87600h",
    });
    if (banErr) throw new Error(banErr.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) {
      throw new Error("You cannot delete your own account");
    }
    await supabaseAdmin.from("user_areas").delete().eq("user_id", data.id);
    await supabaseAdmin.from("customer_managers").delete().eq("manager_id", data.id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- locations ----------
export const listLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin.from("locations").select("*").order("location_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ location_name: z.string().trim().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("locations").insert({ location_name: data.location_name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("locations").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- areas ----------
export const listAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("areas")
      .select("*, location:locations(id, location_name)")
      .order("area_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- references (master) ----------
export const listReferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getUserRole(context.userId);
    const { data, error } = await supabaseAdmin
      .from("references")
      .select("*")
      .order("reference_name");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (role !== "admin") {
      return rows.map((r) => ({
        id: r.id,
        reference_name: r.reference_name,
        is_active: r.is_active,
        whatsapp_number: null,
        mobile_number: null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    }
    return rows;
  });

export const createReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      reference_name: z.string().trim().min(1).max(100),
      whatsapp_number: z.string().trim().max(20).optional().refine((v) => !v || /^\+8801\d{9}$/.test(v), { message: "WhatsApp number must be in +8801XXXXXXXXX format" }),
      mobile_number: z.string().trim().max(20).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("references").insert({
      reference_name: data.reference_name,
      whatsapp_number: data.whatsapp_number || null,
      mobile_number: data.mobile_number || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      reference_name: z.string().trim().min(1).max(100).optional(),
      whatsapp_number: z.string().trim().max(20).nullable().optional().refine((v) => v === null || v === undefined || /^\+8801\d{9}$/.test(v), { message: "WhatsApp number must be in +8801XXXXXXXXX format" }),
      mobile_number: z.string().trim().max(20).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: { reference_name?: string; whatsapp_number?: string | null; mobile_number?: string | null } = {};
    if (data.reference_name !== undefined) patch.reference_name = data.reference_name;
    if (data.whatsapp_number !== undefined) patch.whatsapp_number = data.whatsapp_number || null;
    if (data.mobile_number !== undefined) patch.mobile_number = data.mobile_number || null;
    const { error } = await supabaseAdmin.from("references").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- service rates ----------
const IMPORTER_TYPE_ID = "f30df488-90ac-4a3a-8555-2bc2d5bf9d54";

const rateInsertSchema = z.object({
  service_item_id: z.string().uuid(),
  customer_type_id: z.string().uuid().nullable().optional(),
  regular_rate: z.number().min(0).max(99999999),
  minimum_charge: z.number().min(0).max(99999999),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const rateUpdateSchema = z.object({
  id: z.string().uuid(),
  customer_type_id: z.string().uuid().nullable().optional(),
  regular_rate: z.number().min(0).max(99999999),
  minimum_charge: z.number().min(0).max(99999999),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listServiceRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("service_rates")
      .select("*, service_item:service_items(id, item_name), customer_type:customer_types(id, type_name), creator:profiles!service_rates_created_by_fkey(id, name)")
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      // Fallback without profiles join if FK alias not resolvable
      const { data: d2, error: e2 } = await supabaseAdmin
        .from("service_rates")
        .select("*, service_item:service_items(id, item_name), customer_type:customer_types(id, type_name)")
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false });
      if (e2) throw new Error(e2.message);
      return d2 ?? [];
    }
    return data ?? [];
  });

export const listRateHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ service_item_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("service_rates")
      .select("*, service_item:service_items(id, item_name), customer_type:customer_types(id, type_name)")
      .eq("service_item_id", data.service_item_id)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createServiceRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateInsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("service_rates").insert({
      service_item_id: data.service_item_id,
      customer_type_id: data.customer_type_id ?? IMPORTER_TYPE_ID,
      regular_rate: data.regular_rate,
      minimum_charge: data.minimum_charge,
      effective_from: data.effective_from,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateLatestServiceRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rateUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("service_rates")
      .update({
        customer_type_id: data.customer_type_id ?? IMPORTER_TYPE_ID,
        regular_rate: data.regular_rate,
        minimum_charge: data.minimum_charge,
        effective_from: data.effective_from,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const toggleReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("references").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- service items (master) ----------
export const listServiceItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("service_items")
      .select("*")
      .order("item_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createServiceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ item_name: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("service_items").insert({ item_name: data.item_name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleServiceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("service_items").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });




// ---------- customer types (master) ----------
export const listCustomerTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("customer_types")
      .select("*")
      .order("type_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCustomerType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ type_name: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("customer_types").insert({ type_name: data.type_name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCustomerType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("customer_types").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- customers ----------
const customerCoreSchema = z.object({
  customer_type_id: z.string().uuid("Customer type is required"),
  company_name: z.string().trim().min(1, "Company name required").max(200),
  proprietor_name: z.string().trim().max(200).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  bin_number: z.string().trim().regex(/^\d{9}-\d{4}$/, "BIN must be in format xxxxxxxxx-xxxx (9 digits, dash, 4 digits)"),
  vat_registration_no: z.string().trim().max(50).optional().or(z.literal("")),
  trade_license_no: z.string().trim().max(50).optional().or(z.literal("")),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  alternative_mobile: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  location_id: z.string().uuid().nullable().optional(),
  area_id: z.string().uuid().nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
  opening_balance_type: z.enum(["DUE", "ADVANCE"]).nullable().optional(),
  opening_balance_amount: z.number().min(-9999999999).max(9999999999).optional().default(0),
  vat_user_id: z.string().trim().max(100).optional().or(z.literal("")),
  vat_password: z.string().max(200).optional().or(z.literal("")),
  vat_service_type: z.enum(["FULL", "ONLY_RETURN"]).optional().default("FULL"),
  is_active: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function toCustomerRow(d: z.infer<typeof customerCoreSchema>) {
  return {
    customer_type_id: d.customer_type_id,
    company_name: d.company_name,
    name: d.company_name,
    proprietor_name: d.proprietor_name || null,
    address: d.address || null,
    bin_number: d.bin_number?.trim() ? d.bin_number.trim() : null,
    vat_registration_no: d.vat_registration_no || null,
    trade_license_no: d.trade_license_no || null,
    mobile: d.mobile || null,
    alternative_mobile: d.alternative_mobile || null,
    email: d.email || null,
    location_id: d.location_id || null,
    area_id: d.area_id || null,
    reference_id: d.reference_id || null,
    opening_balance_type: (d.opening_balance_amount ?? 0) > 0 ? "ADVANCE" : (d.opening_balance_amount ?? 0) < 0 ? "DUE" : null,
    opening_balance_amount: d.opening_balance_amount ?? 0,
    vat_user_id: d.vat_user_id || null,
    vat_password: d.vat_password || null,
    vat_service_type: d.vat_service_type || "FULL",
    is_active: d.is_active ?? true,
    notes: d.notes || null,
  };
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().optional(),
        location_id: z.string().uuid().nullable().optional(),
        area_id: z.string().uuid().nullable().optional(),
        reference_id: z.string().uuid().nullable().optional(),
        status: z.enum(["all", "active", "disabled"]).optional().default("all"),
        page: z.number().int().min(1).optional().default(1),
        page_size: z.number().int().min(1).max(200).optional().default(20),
      })
      .optional()
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const page = data.page ?? 1;
    const pageSize = data.page_size ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const role = await getUserRole(context.userId);
    let allowedIds: string[] | null = null;
    if (role !== "admin") {
      allowedIds = await getManagerCustomerIds(context.userId);
      if (allowedIds.length === 0) {
        return { rows: [], total: 0, page, page_size: pageSize };
      }
    }

    let q = supabaseAdmin
      .from("customers")
      .select(
        "*, area:areas(id, area_name, location:locations(id, location_name)), location:locations(id, location_name), ref:references(id, reference_name), type:customer_types(id, type_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (allowedIds) q = q.in("id", allowedIds);
    if (data.location_id) q = q.eq("location_id", data.location_id);
    if (data.area_id) q = q.eq("area_id", data.area_id);
    if (data.reference_id) q = q.eq("reference_id", data.reference_id);
    if (data.status === "active") q = q.eq("is_active", true);
    if (data.status === "disabled") q = q.eq("is_active", false);
    if (data.search?.trim()) {
      // Escape PostgREST or() separators and ilike wildcards so names with
      // punctuation (., &, -, /, etc.) and spaces still match.
      const s = data.search
        .trim()
        .replace(/[\\%_]/g, (m) => `\\${m}`)
        .replace(/[(),*]/g, " ")
        .replace(/\s+/g, " ");
      if (s) {
        q = q.or(
          `company_name.ilike.%${s}%,name.ilike.%${s}%,proprietor_name.ilike.%${s}%,bin_number.ilike.%${s}%,mobile.ilike.%${s}%`,
        );
      }
    }
    q = q.range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    // Managers only receive rows for assigned customers (filtered above),
    // so VAT credentials are safe to return for those rows.
    const safe = rows ?? [];
    return { rows: safe, total: count ?? 0, page, page_size: pageSize };
  });

export const getCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") {
      const allowed = await getManagerCustomerIds(context.userId);
      if (!allowed.includes(data.id)) throw new Error("Forbidden");
    }
    const { data: row, error } = await supabaseAdmin
      .from("customers")
      .select(
        "*, area:areas(id, area_name, location:locations(id, location_name)), location:locations(id, location_name), ref:references(id, reference_name), type:customer_types(id, type_name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Customer not found");
    const customer: any = row;
    const { data: mgrs } = await supabaseAdmin
      .from("customer_managers")
      .select("manager_id, assigned_at, manager:profiles!customer_managers_manager_id_fkey(id, name, username)")
      .eq("customer_id", data.id);
    return { customer, managers: mgrs ?? [] };
  });

export const checkBinUnique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bin: z.string().trim().min(1), exclude_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("customers").select("id", { count: "exact", head: true }).eq("bin_number", data.bin);
    if (data.exclude_id) q = q.neq("id", data.exclude_id);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { unique: (count ?? 0) === 0 };
  });

export const checkMobileExists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mobile: z.string().trim().min(1), exclude_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = supabaseAdmin.from("customers").select("id, company_name").eq("mobile", data.mobile).limit(3);
    if (data.exclude_id) q = q.neq("id", data.exclude_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let matches = rows ?? [];
    // Prevent cross-manager probing: only return matches the caller is allowed to see.
    const role = await getUserRole(context.userId);
    if (role !== "admin") {
      const allowed = new Set(await getManagerCustomerIds(context.userId));
      matches = matches.filter((r) => allowed.has(r.id));
    }
    return { matches };
  });

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => customerCoreSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.bin_number?.trim()) {
      const { count } = await supabaseAdmin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("bin_number", data.bin_number.trim());
      if ((count ?? 0) > 0) throw new Error("BIN number already exists");
    }
    const row = toCustomerRow(data);
    const { data: ins, error } = await supabaseAdmin
      .from("customers")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    customerCoreSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await getUserRole(context.userId);
    if (role !== "admin") {
      if (role !== "manager") throw new Error("Forbidden");
      const allowed = await getManagerCustomerIds(context.userId);
      if (!allowed.includes(data.id)) throw new Error("Forbidden: not your customer");
    }
    if (data.bin_number?.trim()) {
      const { count } = await supabaseAdmin
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("bin_number", data.bin_number.trim())
        .neq("id", data.id);
      if ((count ?? 0) > 0) throw new Error("BIN number already exists");
    }
    const row: any = toCustomerRow(data);
    const { error } = await supabaseAdmin.from("customers").update(row).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const toggleCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date();
    const patch = {
      is_active: data.is_active,
      enabled_month: data.is_active
        ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        : null,
      disabled_at: data.is_active ? null : new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("customers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = (await getUserRole(context.userId)) === "admin";
    if (!isAdmin) {
      // Managers can only see themselves (needed to render their own name in payroll etc.)
      const { data: self, error: sErr } = await supabaseAdmin
        .from("profiles")
        .select("id, name, username")
        .eq("id", context.userId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      return self ? [self] : [];
    }
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, name, username")
      .in("id", ids)
      .eq("is_active", true)
      .order("name");
    if (pErr) throw new Error(pErr.message);
    return profiles ?? [];
  });

export const assignManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customer_id: z.string().uuid(), manager_ids: z.array(z.string().uuid()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error: dErr } = await supabaseAdmin.from("customer_managers").delete().eq("customer_id", data.customer_id);
    if (dErr) throw new Error(dErr.message);
    if (data.manager_ids.length > 0) {
      const rows = data.manager_ids.map((m) => ({
        customer_id: data.customer_id,
        manager_id: m,
        assigned_by: context.userId,
      }));
      const { error: iErr } = await supabaseAdmin.from("customer_managers").insert(rows);
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true };
  });

export const listAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().optional(),
        shared_only: z.boolean().optional().default(false),
        unassigned_only: z.boolean().optional().default(false),
      })
      .optional()
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("customers")
      .select(
        "id, company_name, bin_number, mobile, is_active, area:areas(id, area_name, location:locations(id, location_name))",
      )
      .order("company_name", { ascending: true });
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[^a-zA-Z0-9 ]/g, "");
      if (s) q = q.or(`company_name.ilike.%${s}%,bin_number.ilike.%${s}%,mobile.ilike.%${s}%`);
    }
    const { data: customers, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (customers ?? []).map((c: any) => c.id);
    const mgrMap = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: cm, error: cmErr } = await supabaseAdmin
        .from("customer_managers")
        .select("customer_id, manager_id")
        .in("customer_id", ids);
      if (cmErr) throw new Error(cmErr.message);
      for (const r of cm ?? []) {
        const arr = mgrMap.get(r.customer_id) ?? [];
        arr.push(r.manager_id);
        mgrMap.set(r.customer_id, arr);
      }
    }
    let rows = (customers ?? []).map((c: any) => ({
      ...c,
      manager_ids: mgrMap.get(c.id) ?? [],
    }));
    if (data.shared_only) rows = rows.filter((r) => r.manager_ids.length >= 2);
    if (data.unassigned_only) rows = rows.filter((r) => r.manager_ids.length === 0);
    return rows;
  });





export const createArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      location_id: z.string().uuid(),
      area_name: z.string().trim().min(1).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("areas").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("areas").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("customer_managers").delete().eq("customer_id", data.id);
    const { error } = await supabaseAdmin.from("customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

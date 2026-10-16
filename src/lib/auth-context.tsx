import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { getMe } from "@/lib/erp.functions";

type Role = "admin" | "manager" | null;

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  role: Role;
  permissions: Record<string, boolean>;
  can: (key: string) => boolean;
  signOut: () => Promise<void>;
}


const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Role is derived from server (getMe) — kept in a ref-backed state so it
  // cannot be mutated by arbitrary components via an exposed setter.
  const [role, setRoleInternal] = useState<Role>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const roleRef = useRef<Role>(null);
  const setRole = (r: Role) => {
    roleRef.current = r;
    setRoleInternal(r);
  };
  const router = useRouter();
  const qc = useQueryClient();


  useEffect(() => {
    const checkExpiry = async () => {
      const exp = localStorage.getItem("erp-session-expiry");
      if (exp && Date.now() > Number(exp)) {
        localStorage.removeItem("erp-session-expiry");
        localStorage.removeItem("erp-remember");
        await supabase.auth.signOut();
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (s && (await checkExpiry())) return;
      setSession(s);
      if (!s) {
        setRole(null);
        localStorage.removeItem("erp-session-expiry");
        localStorage.removeItem("erp-remember");
      }
      router.invalidate();
      qc.invalidateQueries();
    });
    (async () => {
      if (await checkExpiry()) {
        setSession(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    })();
    return () => subscription.unsubscribe();
  }, [router, qc]);

  // Fetch role from server whenever session changes — single source of truth.
  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setRole(null);
      setPermissions({});
      return;
    }
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        setRole((me?.role as Role) ?? null);
        setPermissions((me as any)?.permissions ?? {});
      } catch {
        if (!cancelled) {
          setRole(null);
          setPermissions({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const can = (key: string) => {
    if (role === "admin") return true;
    return permissions[key] === true;
  };

  return (
    <Ctx.Provider
      value={{
        session,
        loading,
        role,
        permissions,
        can,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}


export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}


-- 1) Revoke EXECUTE on diagnostic SECURITY DEFINER functions from public roles.
-- These are only invoked server-side via supabaseAdmin (service_role).
REVOKE EXECUTE ON FUNCTION public.get_db_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_table_sizes() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_files() TO service_role;

-- 2) Defense in depth on user_roles: explicit restrictive policies blocking
-- any non-admin from inserting, updating, or deleting role rows.
CREATE POLICY "only admin insert user_roles"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "only admin update user_roles"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "only admin delete user_roles"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) Align bills SELECT with customer_managers pattern so managers can read
-- bills for customers assigned to them, not only bills they created.
DROP POLICY IF EXISTS "admin or manager-own read bills" ON public.bills;
CREATE POLICY "admin or assigned manager read bills"
ON public.bills
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.customer_managers cm
        WHERE cm.customer_id = bills.customer_id
          AND cm.manager_id = auth.uid()
      )
    )
  )
);

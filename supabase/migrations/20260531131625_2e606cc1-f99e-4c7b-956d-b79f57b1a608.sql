
-- Tighten company_settings SELECT (contains API keys/secrets) to admins only
DROP POLICY IF EXISTS "auth read company_settings" ON public.company_settings;
CREATE POLICY "admin read company_settings"
ON public.company_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Tighten bills/bill_items SELECT — server functions use service role; direct client reads limited to admin
DROP POLICY IF EXISTS "auth read bills" ON public.bills;
CREATE POLICY "admin or manager-own read bills"
ON public.bills FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid())
);

DROP POLICY IF EXISTS "auth read bill_items" ON public.bill_items;
CREATE POLICY "admin or manager-own read bill_items"
ON public.bill_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_items.bill_id AND b.created_by = auth.uid())
  )
);

-- Tighten customers SELECT to admin or assigned manager
DROP POLICY IF EXISTS "auth read customers" ON public.customers;
CREATE POLICY "admin or assigned manager read customers"
ON public.customers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.customer_managers cm WHERE cm.customer_id = customers.id AND cm.manager_id = auth.uid())
    )
  )
);

-- Tighten user_areas SELECT to own user or admin
DROP POLICY IF EXISTS "auth read user_areas" ON public.user_areas;
CREATE POLICY "own or admin read user_areas"
ON public.user_areas FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Tighten role_permissions SELECT to admin only
DROP POLICY IF EXISTS "auth read role_permissions" ON public.role_permissions;
CREATE POLICY "admin read role_permissions"
ON public.role_permissions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

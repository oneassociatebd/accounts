-- Tighten customers SELECT: drop creator-based access, keep admin + currently assigned manager
DROP POLICY IF EXISTS "admin or assigned manager read customers" ON public.customers;
CREATE POLICY "admin or assigned manager read customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = customers.id
        AND cm.manager_id = auth.uid()
    )
  )
);

-- Restrict references SELECT to admins only (server functions use service role and bypass RLS)
DROP POLICY IF EXISTS "auth read references" ON public.references;
CREATE POLICY "admin read references"
ON public.references
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

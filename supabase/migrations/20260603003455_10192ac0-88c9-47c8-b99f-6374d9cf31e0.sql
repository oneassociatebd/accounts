-- Restrict manager UPDATE on customers to currently-assigned managers only.
-- Previously, any manager who originally created a customer could update
-- vat_user_id/vat_password even after being unassigned. Now the manager must
-- be in customer_managers for the row to be updatable.

DROP POLICY IF EXISTS "manager update own customers" ON public.customers;

CREATE POLICY "manager update assigned customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = customers.id
      AND cm.manager_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = customers.id
      AND cm.manager_id = auth.uid()
  )
);
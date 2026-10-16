DROP POLICY IF EXISTS "manager create bills" ON public.bills;
CREATE POLICY "manager create bills" ON public.bills
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = bills.customer_id
      AND cm.manager_id = auth.uid()
  )
);
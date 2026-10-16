DROP POLICY IF EXISTS "manager create collections" ON public.collections;
CREATE POLICY "manager create collections"
ON public.collections
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = collections.customer_id
      AND cm.manager_id = auth.uid()
  )
);
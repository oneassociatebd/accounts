DROP POLICY IF EXISTS "admin or manager-own read bill_items" ON public.bill_items;

CREATE POLICY "admin or manager-assigned read bill_items"
ON public.bill_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.bills b
    WHERE b.id = bill_items.bill_id
      AND (
        b.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.customer_managers cm
          WHERE cm.customer_id = b.customer_id
            AND cm.manager_id = auth.uid()
        )
      )
  )
);

-- 1) Revoke column-level UPDATE on sensitive VAT credential columns from the authenticated role.
REVOKE UPDATE (vat_user_id, vat_password) ON public.customers FROM authenticated;
-- Service role (used by admin server functions) keeps full access.

-- 2) Align collection_allocations SELECT with collections SELECT so managers assigned
-- via customer_managers can read allocations for collections they can already see.
DROP POLICY IF EXISTS "admin or manager-own read collection_allocations" ON public.collection_allocations;

CREATE POLICY "admin or manager read collection_allocations"
ON public.collection_allocations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_allocations.collection_id
        AND (
          c.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.customer_managers cm
            WHERE cm.customer_id = c.customer_id
              AND cm.manager_id = auth.uid()
          )
        )
    )
  )
);

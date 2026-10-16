
DROP POLICY IF EXISTS "admin or assigned manager read customers" ON public.customers;
CREATE POLICY "admin or assigned manager read customers" ON public.customers
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'manager'::app_role) AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.customer_managers cm
        WHERE cm.customer_id = customers.id AND cm.manager_id = auth.uid()
      )
    )
  )
);

REVOKE EXECUTE ON FUNCTION public.get_db_size() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_storage_size() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM PUBLIC, authenticated, anon;

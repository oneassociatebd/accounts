DROP POLICY IF EXISTS "admin or manager-own read whatsapp_logs" ON public.whatsapp_logs;

CREATE POLICY "admin or manager-assigned read whatsapp_logs"
ON public.whatsapp_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.bills b
    WHERE b.id = whatsapp_logs.bill_id
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
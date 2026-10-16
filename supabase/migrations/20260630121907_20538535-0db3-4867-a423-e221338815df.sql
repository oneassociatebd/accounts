-- VAT submissions
DROP POLICY IF EXISTS "manager create vat_submissions" ON public.vat_submissions;
CREATE POLICY "manager create vat_submissions" ON public.vat_submissions
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND created_by = auth.uid()
  AND status = 'DRAFT'
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = vat_submissions.customer_id
      AND cm.manager_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "manager update vat_submissions" ON public.vat_submissions;
CREATE POLICY "manager update vat_submissions" ON public.vat_submissions
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND status = 'DRAFT'
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = vat_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND status = 'DRAFT'
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = vat_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
);

-- Mushak 4.3 submissions
DROP POLICY IF EXISTS "manager create mushak_4_3_submissions" ON public.mushak_4_3_submissions;
CREATE POLICY "manager create mushak_4_3_submissions" ON public.mushak_4_3_submissions
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND created_by = auth.uid()
  AND status = 'DRAFT'
  AND EXISTS (
    SELECT 1 FROM public.customer_managers cm
    WHERE cm.customer_id = mushak_4_3_submissions.customer_id
      AND cm.manager_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "manager update mushak_4_3_submissions" ON public.mushak_4_3_submissions;
CREATE POLICY "manager update mushak_4_3_submissions" ON public.mushak_4_3_submissions
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND status = 'DRAFT'
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = mushak_4_3_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND status = 'DRAFT'
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = mushak_4_3_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
);
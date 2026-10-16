DROP POLICY IF EXISTS "auth read income_sources" ON public.income_sources;

CREATE POLICY "Admins read income_sources"
ON public.income_sources
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
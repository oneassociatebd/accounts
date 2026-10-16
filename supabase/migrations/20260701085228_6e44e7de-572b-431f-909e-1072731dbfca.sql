CREATE POLICY "Authenticated read references"
ON public.references
FOR SELECT
TO authenticated
USING (true);
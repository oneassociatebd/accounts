
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS print_signature_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read company-assets" ON storage.objects;
CREATE POLICY "Public read company-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Admin upload company-assets" ON storage.objects;
CREATE POLICY "Admin upload company-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-assets' AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin update company-assets" ON storage.objects;
CREATE POLICY "Admin update company-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-assets' AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin delete company-assets" ON storage.objects;
CREATE POLICY "Admin delete company-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-assets' AND has_role(auth.uid(), 'admin'::app_role));

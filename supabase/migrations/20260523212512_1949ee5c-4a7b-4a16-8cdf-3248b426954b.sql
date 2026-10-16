
CREATE TABLE public.user_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, area_id)
);

CREATE INDEX idx_user_areas_user ON public.user_areas(user_id);
CREATE INDEX idx_user_areas_area ON public.user_areas(area_id);

ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read user_areas" ON public.user_areas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage user_areas" ON public.user_areas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Backfill existing single area assignments
INSERT INTO public.user_areas (user_id, area_id)
SELECT id, area_id FROM public.profiles WHERE area_id IS NOT NULL
ON CONFLICT DO NOTHING;

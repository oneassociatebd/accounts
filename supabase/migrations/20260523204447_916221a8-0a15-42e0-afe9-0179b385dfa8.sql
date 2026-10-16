
CREATE TABLE public.service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_item_id uuid NOT NULL REFERENCES public.service_items(id) ON DELETE CASCADE,
  regular_rate numeric(12,2) NOT NULL CHECK (regular_rate >= 0),
  minimum_charge numeric(12,2) NOT NULL CHECK (minimum_charge >= 0),
  effective_from date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_rates_item_eff ON public.service_rates (service_item_id, effective_from DESC, created_at DESC);

ALTER TABLE public.service_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read service_rates" ON public.service_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage service_rates" ON public.service_rates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_service_rates_updated_at
  BEFORE UPDATE ON public.service_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Block update/delete of historical (non-latest) rate rows
CREATE OR REPLACE FUNCTION public.enforce_latest_rate_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  latest_id uuid;
  target_item uuid;
BEGIN
  target_item := COALESCE(OLD.service_item_id, NEW.service_item_id);
  SELECT id INTO latest_id
  FROM public.service_rates
  WHERE service_item_id = target_item
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical service rates cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id <> latest_id THEN
    RAISE EXCEPTION 'Only the latest service rate can be edited';
  END IF;

  -- Prevent changing service_item_id on update
  IF TG_OP = 'UPDATE' AND OLD.service_item_id <> NEW.service_item_id THEN
    RAISE EXCEPTION 'Cannot change service_item_id of an existing rate';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_rates_enforce_latest
  BEFORE UPDATE OR DELETE ON public.service_rates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_latest_rate_only();

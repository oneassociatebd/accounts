-- Add customer_type_id to service_rates (NULL = default rate, fallback when no type-specific rate exists)
ALTER TABLE public.service_rates
  ADD COLUMN customer_type_id uuid NULL REFERENCES public.customer_types(id);

CREATE INDEX IF NOT EXISTS idx_service_rates_item_type_eff
  ON public.service_rates (service_item_id, customer_type_id, effective_from DESC, created_at DESC);

-- Replace trigger to scope "latest" per (service_item_id, customer_type_id)
CREATE OR REPLACE FUNCTION public.enforce_latest_rate_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  latest_id uuid;
  target_item uuid;
  target_type uuid;
BEGIN
  target_item := COALESCE(OLD.service_item_id, NEW.service_item_id);
  target_type := COALESCE(OLD.customer_type_id, NEW.customer_type_id);

  SELECT id INTO latest_id
  FROM public.service_rates
  WHERE service_item_id = target_item
    AND customer_type_id IS NOT DISTINCT FROM target_type
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical service rates cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id <> latest_id THEN
    RAISE EXCEPTION 'Only the latest service rate can be edited';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.service_item_id <> NEW.service_item_id THEN
    RAISE EXCEPTION 'Cannot change service_item_id of an existing rate';
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.customer_type_id IS DISTINCT FROM NEW.customer_type_id) THEN
    RAISE EXCEPTION 'Cannot change customer_type_id of an existing rate';
  END IF;

  RETURN NEW;
END;
$function$;
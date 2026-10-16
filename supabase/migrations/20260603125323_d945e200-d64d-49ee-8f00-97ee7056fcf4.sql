-- Update the trigger function to allow changing customer_type_id on latest rates
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
  -- Use OLD values to find if the record being edited IS the latest for its current scope
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

  -- REMOVED: Restriction on changing customer_type_id
  -- This allows fixing mistakes in type assignment for the latest rate.

  RETURN NEW;
END;
$function$;
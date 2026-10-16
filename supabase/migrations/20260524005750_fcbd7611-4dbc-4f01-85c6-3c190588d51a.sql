
CREATE OR REPLACE FUNCTION public.customers_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Derive opening_balance_type from sign of amount (kept for backward compatibility)
  IF NEW.opening_balance_amount IS NULL THEN
    NEW.opening_balance_amount := 0;
  END IF;
  IF NEW.opening_balance_amount > 0 THEN
    NEW.opening_balance_type := 'ADVANCE';
  ELSIF NEW.opening_balance_amount < 0 THEN
    NEW.opening_balance_type := 'DUE';
  ELSE
    NEW.opening_balance_type := NULL;
  END IF;

  -- Area must belong to location when both provided
  IF NEW.area_id IS NOT NULL AND NEW.location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.areas WHERE id = NEW.area_id AND location_id = NEW.location_id) THEN
      RAISE EXCEPTION 'Area does not belong to the selected location';
    END IF;
  END IF;

  -- Keep name in sync with company_name
  IF NEW.company_name IS NOT NULL THEN
    NEW.name := NEW.company_name;
  END IF;
  RETURN NEW;
END;
$function$;

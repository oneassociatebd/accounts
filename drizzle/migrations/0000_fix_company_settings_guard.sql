CREATE OR REPLACE FUNCTION public.company_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Company settings cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Allow re-inserting/updating the existing single row (same id),
    -- e.g. via INSERT ... ON CONFLICT DO UPDATE during backup restore.
    -- Block only genuinely additional rows.
    IF EXISTS (
      SELECT 1 FROM public.company_settings cs
      WHERE cs.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'Only one company settings row is allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
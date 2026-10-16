ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS last_invoice_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invoice_year integer;

-- Seed from existing bills so we never reissue an already-used number for the current year
DO $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_max  int;
BEGIN
  SELECT COALESCE(MAX((regexp_match(bill_no, '(\d+)/\d{4}$'))[1]::int), 0)
    INTO v_max
    FROM public.bills
   WHERE bill_no LIKE '%/' || v_year::text;

  UPDATE public.company_settings
     SET last_invoice_number = GREATEST(last_invoice_number, v_max),
         last_invoice_year = v_year;
END $$;
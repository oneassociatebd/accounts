ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_service_type text NOT NULL DEFAULT 'FULL';

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_vat_service_type_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_vat_service_type_check
  CHECK (vat_service_type IN ('FULL','ONLY_RETURN'));
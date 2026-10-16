
-- Extend customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type_id uuid REFERENCES public.customer_types(id),
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS proprietor_name text,
  ADD COLUMN IF NOT EXISTS bin_number text,
  ADD COLUMN IF NOT EXISTS vat_registration_no text,
  ADD COLUMN IF NOT EXISTS trade_license_no text,
  ADD COLUMN IF NOT EXISTS alternative_mobile text,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS reference_id uuid REFERENCES public.references(id),
  ADD COLUMN IF NOT EXISTS opening_balance_type text,
  ADD COLUMN IF NOT EXISTS opening_balance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_user_id text,
  ADD COLUMN IF NOT EXISTS vat_password text,
  ADD COLUMN IF NOT EXISTS enabled_month date,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Backfill company_name from name
UPDATE public.customers SET company_name = name WHERE company_name IS NULL;

-- Unique partial index on bin_number
CREATE UNIQUE INDEX IF NOT EXISTS customers_bin_number_unique
  ON public.customers (bin_number) WHERE bin_number IS NOT NULL AND bin_number <> '';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON public.customers (company_name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_area ON public.customers (area_id);
CREATE INDEX IF NOT EXISTS idx_customers_location ON public.customers (location_id);
CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers (is_active);
CREATE INDEX IF NOT EXISTS idx_customers_reference ON public.customers (reference_id);

-- Validation trigger
CREATE OR REPLACE FUNCTION public.customers_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Opening balance rules
  IF NEW.opening_balance_amount < 0 THEN
    RAISE EXCEPTION 'Opening balance amount cannot be negative';
  END IF;
  IF NEW.opening_balance_amount > 0 AND (NEW.opening_balance_type IS NULL OR NEW.opening_balance_type NOT IN ('DUE','ADVANCE')) THEN
    RAISE EXCEPTION 'Opening balance type must be DUE or ADVANCE when amount > 0';
  END IF;
  IF NEW.opening_balance_type IS NOT NULL AND NEW.opening_balance_type NOT IN ('DUE','ADVANCE') THEN
    RAISE EXCEPTION 'Invalid opening_balance_type: %', NEW.opening_balance_type;
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
$$;

DROP TRIGGER IF EXISTS customers_validate_trigger ON public.customers;
CREATE TRIGGER customers_validate_trigger
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_validate();

-- customer_managers table
CREATE TABLE IF NOT EXISTS public.customer_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, manager_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_managers_customer ON public.customer_managers (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_managers_manager ON public.customer_managers (manager_id);

ALTER TABLE public.customer_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage customer_managers" ON public.customer_managers;
CREATE POLICY "admin manage customer_managers"
  ON public.customer_managers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "manager read own assignments" ON public.customer_managers;
CREATE POLICY "manager read own assignments"
  ON public.customer_managers
  FOR SELECT TO authenticated
  USING (manager_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Auto-assign creator manager
CREATE OR REPLACE FUNCTION public.customers_auto_assign_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND has_role(NEW.created_by, 'manager'::app_role) THEN
    INSERT INTO public.customer_managers (customer_id, manager_id, assigned_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT (customer_id, manager_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_auto_assign_manager_trigger ON public.customers;
CREATE TRIGGER customers_auto_assign_manager_trigger
  AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_auto_assign_manager();

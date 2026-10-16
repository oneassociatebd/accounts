
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  address text,
  phone text,
  email text,
  website text,
  logo_url text,
  bin_number text,
  vat_number text,
  tax_number text,
  invoice_prefix text DEFAULT 'INV-',
  currency text DEFAULT 'BDT',
  invoice_terms text,
  bank_name text,
  bank_account_number text,
  bank_branch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read company_settings" ON public.company_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage company_settings" ON public.company_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (company_name) VALUES ('My Company');

CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  address TEXT,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  reference TEXT,
  monthly_fee NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth read customers" ON public.customers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "manager create customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "manager update own customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid());

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_customers_area_id ON public.customers(area_id);
CREATE INDEX idx_customers_created_by ON public.customers(created_by);
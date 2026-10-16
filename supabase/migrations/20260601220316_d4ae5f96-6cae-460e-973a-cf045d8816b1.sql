
CREATE TABLE public.customer_yearly_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL,
  year integer NOT NULL,
  opening_due numeric NOT NULL DEFAULT 0,
  total_bills numeric NOT NULL DEFAULT 0,
  total_collections numeric NOT NULL DEFAULT 0,
  closing_due numeric NOT NULL DEFAULT 0,
  closed_at timestamp with time zone,
  closed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (customer_id, year)
);

CREATE INDEX idx_cyb_year ON public.customer_yearly_balances(year);
CREATE INDEX idx_cyb_customer ON public.customer_yearly_balances(customer_id);

GRANT SELECT ON public.customer_yearly_balances TO authenticated;
GRANT ALL ON public.customer_yearly_balances TO service_role;

ALTER TABLE public.customer_yearly_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage customer_yearly_balances"
ON public.customer_yearly_balances
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin or assigned manager read customer_yearly_balances"
ON public.customer_yearly_balances
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = customer_yearly_balances.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
);

CREATE TRIGGER trg_cyb_updated_at
BEFORE UPDATE ON public.customer_yearly_balances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

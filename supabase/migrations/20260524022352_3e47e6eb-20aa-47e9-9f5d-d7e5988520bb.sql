
-- Bills table
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  billing_month date NOT NULL,
  previous_balance numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED','CANCELLED')),
  notes text,
  created_by uuid,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bills_customer ON public.bills(customer_id);
CREATE INDEX idx_bills_status ON public.bills(status);
CREATE INDEX idx_bills_billing_month ON public.bills(billing_month);
CREATE INDEX idx_bills_bill_date ON public.bills(bill_date DESC);

-- Bill items table
CREATE TABLE public.bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL REFERENCES public.service_items(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  qty numeric NOT NULL CHECK (qty > 0),
  rate_used numeric NOT NULL DEFAULT 0,
  minimum_charge_used numeric NOT NULL DEFAULT 0,
  calculated_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bill_items_bill ON public.bill_items(bill_id);

-- Sequence for bill numbers
CREATE SEQUENCE IF NOT EXISTS public.bill_no_seq START 1;

-- updated_at trigger
CREATE TRIGGER bills_set_updated_at
BEFORE UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- RLS: bills
CREATE POLICY "admin manage bills" ON public.bills
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth read bills" ON public.bills
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manager create bills" ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "manager update own bills" ON public.bills
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid());

-- RLS: bill_items
CREATE POLICY "admin manage bill_items" ON public.bill_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth read bill_items" ON public.bill_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manager manage own bill_items" ON public.bill_items
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.created_by = auth.uid())
  );


-- ============ manager_service_rates ============
CREATE TABLE public.manager_service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL REFERENCES public.service_items(id) ON DELETE CASCADE,
  rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manager_service_rates_lookup_idx
  ON public.manager_service_rates (service_item_id, manager_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_service_rates TO authenticated;
GRANT ALL ON public.manager_service_rates TO service_role;

ALTER TABLE public.manager_service_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage manager_service_rates"
  ON public.manager_service_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "manager read own manager_service_rates"
  ON public.manager_service_rates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR manager_id = auth.uid()
    OR manager_id IS NULL
  );

CREATE TRIGGER set_manager_service_rates_updated_at
  BEFORE UPDATE ON public.manager_service_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ manager_earnings ============
CREATE TABLE public.manager_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  bill_item_id uuid NOT NULL REFERENCES public.bill_items(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL,
  billing_month date NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID')),
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_item_id)
);
CREATE INDEX manager_earnings_manager_status_idx
  ON public.manager_earnings (manager_id, status);
CREATE INDEX manager_earnings_month_idx
  ON public.manager_earnings (billing_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_earnings TO authenticated;
GRANT ALL ON public.manager_earnings TO service_role;

ALTER TABLE public.manager_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage manager_earnings"
  ON public.manager_earnings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "manager read own manager_earnings"
  ON public.manager_earnings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR manager_id = auth.uid()
  );

-- ============ manager_payouts ============
CREATE TABLE public.manager_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  period_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('BKASH','BANK')),
  account_info text,
  reference_no text,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  sms_status text,
  sms_response text,
  sms_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manager_payouts_manager_month_idx
  ON public.manager_payouts (manager_id, period_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_payouts TO authenticated;
GRANT ALL ON public.manager_payouts TO service_role;

ALTER TABLE public.manager_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage manager_payouts"
  ON public.manager_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "manager read own manager_payouts"
  ON public.manager_payouts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR manager_id = auth.uid()
  );

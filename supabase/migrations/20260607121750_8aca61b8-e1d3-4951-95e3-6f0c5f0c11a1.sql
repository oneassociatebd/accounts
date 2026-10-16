
CREATE TABLE public.bkash_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_id text,
  trx_id text,
  status text NOT NULL DEFAULT 'INITIATED',
  bkash_url text,
  raw_response jsonb,
  collection_id uuid,
  initiated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bkash_payments_bill_idx ON public.bkash_payments(bill_id);
CREATE INDEX bkash_payments_customer_idx ON public.bkash_payments(customer_id);
CREATE INDEX bkash_payments_payment_id_idx ON public.bkash_payments(payment_id);
CREATE INDEX bkash_payments_status_idx ON public.bkash_payments(status);

GRANT SELECT ON public.bkash_payments TO authenticated;
GRANT ALL ON public.bkash_payments TO service_role;

ALTER TABLE public.bkash_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage bkash_payments"
  ON public.bkash_payments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin or assigned manager read bkash_payments"
  ON public.bkash_payments FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'manager'::app_role)
      AND (
        EXISTS (
          SELECT 1 FROM public.bills b
          WHERE b.id = bkash_payments.bill_id AND b.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.customer_managers cm
          WHERE cm.customer_id = bkash_payments.customer_id AND cm.manager_id = auth.uid()
        )
      )
    )
  );

CREATE TRIGGER bkash_payments_updated_at
  BEFORE UPDATE ON public.bkash_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

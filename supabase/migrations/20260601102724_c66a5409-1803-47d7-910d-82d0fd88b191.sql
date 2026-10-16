
-- Add public_token + whatsapp_sent_at to bills
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

-- Backfill tokens for existing rows
UPDATE public.bills
SET public_token = encode(gen_random_bytes(9), 'base64')
WHERE public_token IS NULL;

-- Clean URL-unsafe chars
UPDATE public.bills
SET public_token = replace(replace(replace(public_token, '/', '_'), '+', '-'), '=', '');

-- Enforce unique non-null
CREATE UNIQUE INDEX IF NOT EXISTS bills_public_token_uniq ON public.bills(public_token) WHERE public_token IS NOT NULL;

-- Auto-generate token on insert
CREATE OR REPLACE FUNCTION public.bills_set_public_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := replace(replace(replace(encode(gen_random_bytes(9), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bills_set_public_token ON public.bills;
CREATE TRIGGER trg_bills_set_public_token
  BEFORE INSERT ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.bills_set_public_token();

-- whatsapp_logs table
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid REFERENCES public.bills(id) ON DELETE CASCADE,
  recipient_mobile text NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  response text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_logs_bill_idx ON public.whatsapp_logs(bill_id);
CREATE INDEX IF NOT EXISTS whatsapp_logs_sent_at_idx ON public.whatsapp_logs(sent_at DESC);

GRANT SELECT, INSERT ON public.whatsapp_logs TO authenticated;
GRANT ALL ON public.whatsapp_logs TO service_role;

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage whatsapp_logs"
  ON public.whatsapp_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin or manager-own read whatsapp_logs"
  ON public.whatsapp_logs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
      SELECT 1 FROM public.bills b WHERE b.id = whatsapp_logs.bill_id AND b.created_by = auth.uid()
    ))
  );

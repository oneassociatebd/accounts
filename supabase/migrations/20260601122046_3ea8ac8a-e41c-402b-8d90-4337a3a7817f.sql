ALTER TABLE public.whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_bill_id_notnull;
ALTER TABLE public.whatsapp_logs ALTER COLUMN bill_id DROP NOT NULL;

-- Add new columns
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS vat_registration_no text,
  ADD COLUMN IF NOT EXISTS trade_license_no text,
  ADD COLUMN IF NOT EXISTS starting_invoice_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS memo_prefix text NOT NULL DEFAULT 'MEMO-',
  ADD COLUMN IF NOT EXISTS decimal_places integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_minimum_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_tax_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_due_carry_forward boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_negative_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bin_unique_enforcement boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_duplicate_mobile boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_auto_assign boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_month_rule boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'BKASH',
  ADD COLUMN IF NOT EXISTS payment_link_expiry_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS allow_partial_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_collection_enable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_api_key text,
  ADD COLUMN IF NOT EXISTS sms_api_key text,
  ADD COLUMN IF NOT EXISTS sender_id text,
  ADD COLUMN IF NOT EXISTS auto_messaging_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bkash_merchant_number text,
  ADD COLUMN IF NOT EXISTS bkash_api_key text,
  ADD COLUMN IF NOT EXISTS bkash_secret_key text,
  ADD COLUMN IF NOT EXISTS bkash_callback_url text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'bn',
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS auto_logout boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_policy text NOT NULL DEFAULT 'STRONG',
  ADD COLUMN IF NOT EXISTS login_retry_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS two_factor_auth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strict_role_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_report_month text NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS show_zero_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_disabled_cust boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_footer_text text;

-- Enforce single-row + no delete
CREATE OR REPLACE FUNCTION public.company_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Company settings cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (SELECT COUNT(*) FROM public.company_settings) >= 1 THEN
      RAISE EXCEPTION 'Only one company settings row is allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_settings_guard_trg ON public.company_settings;
CREATE TRIGGER company_settings_guard_trg
  BEFORE INSERT OR DELETE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_settings_guard();

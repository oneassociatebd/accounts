ALTER TABLE public.collections 
ADD COLUMN bank_account_id UUID REFERENCES public.bank_accounts(id);

GRANT ALL ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

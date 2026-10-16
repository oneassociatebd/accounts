UPDATE public.company_settings
SET bank_name = 'Pubali Bank PLC',
    bank_branch = 'Dargah Gate Islamic',
    bank_account_number = '3487901003900'
WHERE bank_name IS NULL OR bank_account_number IS NULL;
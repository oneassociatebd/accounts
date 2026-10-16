-- Ensure the function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table for other income sources
CREATE TABLE public.others_income (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    income_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL, -- CASH, BANK, BKASH
    bank_account_id UUID REFERENCES public.bank_accounts(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Use GRANT to set permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.others_income TO authenticated;
GRANT ALL ON public.others_income TO service_role;

-- Enable Row Level Security
ALTER TABLE public.others_income ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all for authenticated users"
ON public.others_income
FOR ALL
TO authenticated
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_others_income_updated_at
BEFORE UPDATE ON public.others_income
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
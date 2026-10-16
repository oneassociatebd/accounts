-- Expense categories
CREATE TABLE public.expense_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bank Accounts
CREATE TABLE public.bank_accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    bank_name TEXT,
    account_number TEXT,
    initial_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category_id UUID REFERENCES public.expense_categories(id),
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL, -- 'CASH', 'BANK', 'BKASH'
    bank_account_id UUID REFERENCES public.bank_accounts(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

-- Policies
CREATE POLICY "Everyone authenticated can manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Everyone authenticated can manage expenses" ON public.expenses FOR ALL TO authenticated USING (true);
CREATE POLICY "Everyone authenticated can manage bank accounts" ON public.bank_accounts FOR ALL TO authenticated USING (true);

-- Insert some default categories
INSERT INTO public.expense_categories (name) VALUES 
('Office Rent'),
('Electricity Bill'),
('Internet Bill'),
('Staff Salary'),
('Marketing'),
('Miscellaneous');

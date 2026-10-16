-- Create a custom type for loan type
CREATE TYPE loan_type AS ENUM ('taken', 'given');

-- Create loans table
CREATE TABLE public.loans (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    person_name TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    type loan_type NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active, closed
    description TEXT,
    loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create loan transactions table
CREATE TABLE public.loan_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_transactions TO authenticated;
GRANT ALL ON public.loan_transactions TO service_role;

-- Enable RLS
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_transactions ENABLE ROW LEVEL SECURITY;

-- Policies (Restricting to admin role)
CREATE POLICY "Admin can do everything on loans"
ON public.loans
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
));

CREATE POLICY "Admin can do everything on loan_transactions"
ON public.loan_transactions
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
));

-- Trigger for updated_at (Assuming update_updated_at_column exists)
CREATE TRIGGER update_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loan_transactions_updated_at
BEFORE UPDATE ON public.loan_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

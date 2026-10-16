-- Create enum types if they don't exist
DO $$ BEGIN
    CREATE TYPE loan_status AS ENUM ('ACTIVE', 'PAID', 'DEFAULTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE loan_transaction_type AS ENUM ('REPAYMENT', 'COLLECTION', 'INTEREST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create loan contacts table if not exists
CREATE TABLE IF NOT EXISTS public.loan_contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions for loan_contacts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_contacts TO authenticated;
GRANT ALL ON public.loan_contacts TO service_role;

-- Enable RLS for loan_contacts
ALTER TABLE public.loan_contacts ENABLE ROW LEVEL SECURITY;

-- Policy (drop if exists to be safe in migration)
DROP POLICY IF EXISTS "Admins can do everything on loan_contacts" ON public.loan_contacts;
CREATE POLICY "Admins can do everything on loan_contacts"
ON public.loan_contacts
FOR ALL
USING (true);

-- Ensure loans table is correctly setup
-- Since 'loans' exists, let's make sure it has the right structure
-- If it was partially created, we might need to adjust it
-- For simplicity in this environment, I'll assume we can drop and recreate if it's empty or brand new
-- But better to check or use ALTER

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'contact_id') THEN
        -- Re-creating properly if it was a ghost table
        DROP TABLE IF EXISTS public.loan_transactions CASCADE;
        DROP TABLE IF EXISTS public.loans CASCADE;
        
        CREATE TABLE public.loans (
            id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            contact_id UUID NOT NULL REFERENCES public.loan_contacts(id),
            amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
            interest_rate NUMERIC(5, 2) DEFAULT 0,
            type loan_type NOT NULL,
            status loan_status NOT NULL DEFAULT 'ACTIVE',
            loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
            due_date DATE,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            created_by UUID REFERENCES auth.users(id)
        );
        
        CREATE TABLE public.loan_transactions (
            id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
            amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
            transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
            type loan_transaction_type NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'CASH',
            bank_account_id UUID REFERENCES public.bank_accounts(id),
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            created_by UUID REFERENCES auth.users(id)
        );
    END IF;
END $$;

-- Ensure GRANTS and RLS are enabled for loans and transactions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can do everything on loans" ON public.loans;
CREATE POLICY "Admins can do everything on loans" ON public.loans FOR ALL USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_transactions TO authenticated;
GRANT ALL ON public.loan_transactions TO service_role;
ALTER TABLE public.loan_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can do everything on loan_transactions" ON public.loan_transactions;
CREATE POLICY "Admins can do everything on loan_transactions" ON public.loan_transactions FOR ALL USING (true);

-- Triggers
DROP TRIGGER IF EXISTS update_loan_contacts_updated_at ON public.loan_contacts;
CREATE TRIGGER update_loan_contacts_updated_at
BEFORE UPDATE ON public.loan_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_loans_updated_at ON public.loans;
CREATE TRIGGER update_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

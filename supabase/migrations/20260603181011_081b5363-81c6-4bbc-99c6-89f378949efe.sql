
-- 1. Fix loans tables: drop public-role policies, restrict to admin
DROP POLICY IF EXISTS "Admins can do everything on loans" ON public.loans;
DROP POLICY IF EXISTS "Admins can do everything on loan_transactions" ON public.loan_transactions;
DROP POLICY IF EXISTS "Admins can do everything on loan_contacts" ON public.loan_contacts;

CREATE POLICY "admin manage loans" ON public.loans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin manage loan_transactions" ON public.loan_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin manage loan_contacts" ON public.loan_contacts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.loans FROM anon;
REVOKE ALL ON public.loan_transactions FROM anon;
REVOKE ALL ON public.loan_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_contacts TO authenticated;

-- 2. bank_accounts: admin-only writes; authenticated read
DROP POLICY IF EXISTS "Everyone authenticated can manage bank accounts" ON public.bank_accounts;
CREATE POLICY "auth read bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage bank_accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. expenses & expense_categories: admin-only
DROP POLICY IF EXISTS "Everyone authenticated can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Everyone authenticated can manage expense categories" ON public.expense_categories;
CREATE POLICY "admin manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin manage expense_categories" ON public.expense_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. others_income: admin-only
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.others_income;
CREATE POLICY "admin manage others_income" ON public.others_income FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. income_sources: admin manage, authenticated read
DROP POLICY IF EXISTS "Allow authenticated users to manage income sources" ON public.income_sources;
CREATE POLICY "auth read income_sources" ON public.income_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage income_sources" ON public.income_sources FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. customers VAT credentials: revoke column-level access from authenticated.
-- Server functions use service_role (supabaseAdmin) which bypasses column GRANTs.
REVOKE SELECT (vat_user_id, vat_password) ON public.customers FROM authenticated;
REVOKE UPDATE (vat_user_id, vat_password) ON public.customers FROM authenticated;

-- 7. Fix function search_path on remaining functions
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

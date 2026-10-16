-- Restrict VAT credential columns on customers to admin/server-side only
REVOKE SELECT (vat_user_id, vat_password) ON public.customers FROM authenticated;
REVOKE UPDATE (vat_user_id, vat_password) ON public.customers FROM authenticated;
REVOKE INSERT (vat_user_id, vat_password) ON public.customers FROM authenticated;

-- Harden has_role: run as definer with locked search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
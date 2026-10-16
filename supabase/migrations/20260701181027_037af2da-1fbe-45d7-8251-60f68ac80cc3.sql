REVOKE SELECT (vat_user_id, vat_password) ON public.customers FROM authenticated;
REVOKE SELECT (vat_user_id, vat_password) ON public.customers FROM anon;

GRANT SELECT (
  id, name, mobile, email, address, area_id, reference, monthly_fee, notes,
  is_active, created_by, created_at, updated_at, customer_type_id, company_name,
  proprietor_name, bin_number, vat_registration_no, trade_license_no,
  alternative_mobile, location_id, reference_id, opening_balance_type,
  opening_balance_amount, enabled_month, disabled_at, vat_service_type
) ON public.customers TO authenticated;
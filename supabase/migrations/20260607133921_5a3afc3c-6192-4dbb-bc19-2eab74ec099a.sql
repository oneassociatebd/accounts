INSERT INTO public.role_permissions (module, action, permission_key, role, allowed) VALUES
('Payroll', 'View manager earnings', 'payroll.view_earnings', 'admin', true),
('Payroll', 'View manager earnings', 'payroll.view_earnings', 'manager', true),
('Payroll', 'Manage manager service rates', 'payroll.manage_rates', 'admin', true),
('Payroll', 'Manage manager service rates', 'payroll.manage_rates', 'manager', false),
('Payroll', 'Record manager payouts', 'payroll.record_payouts', 'admin', true),
('Payroll', 'Record manager payouts', 'payroll.record_payouts', 'manager', false),
('Payroll', 'View payout history', 'payroll.view_payouts', 'admin', true),
('Payroll', 'View payout history', 'payroll.view_payouts', 'manager', true)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (module, action, permission_key, role, allowed) VALUES
('Billing','View draft bills','bills.view_drafts','admin',true),
('Billing','View draft bills','bills.view_drafts','manager',true),
('Billing','View bill list','bills.view_list','admin',true),
('Billing','View bill list','bills.view_list','manager',true),
('Billing','View missing bills','bills.view_missing','admin',true),
('Billing','View missing bills','bills.view_missing','manager',true),
('Collections','View due reports','collections.view_due','admin',true),
('Collections','View due reports','collections.view_due','manager',true)
ON CONFLICT (role, permission_key) DO NOTHING;
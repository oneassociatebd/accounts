
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.role_permissions (role, module, action, permission_key, allowed) VALUES
  ('admin','Dashboard','View dashboard','dashboard.view',true),
  ('admin','Users','View users','users.view',true),
  ('admin','Users','Create / edit users','users.edit',true),
  ('admin','Users','Assign roles & areas','users.assign',true),
  ('admin','Customers','View all customers','customers.view_all',true),
  ('admin','Customers','View own-area customers','customers.view_own',true),
  ('admin','Customers','Create customers','customers.create',true),
  ('admin','Customers','Edit own customers','customers.edit_own',true),
  ('admin','Customers','Delete customers','customers.delete',true),
  ('admin','Master Data','Manage areas / locations','master.areas',true),
  ('admin','Master Data','Manage references / customer types','master.refs',true),
  ('admin','Master Data','Manage service items & rates','master.services',true),
  ('admin','Reports','View reports','reports.view',true),
  ('admin','Settings','Company / invoice / system settings','settings.manage',true),
  ('manager','Dashboard','View dashboard','dashboard.view',true),
  ('manager','Users','View users','users.view',false),
  ('manager','Users','Create / edit users','users.edit',false),
  ('manager','Users','Assign roles & areas','users.assign',false),
  ('manager','Customers','View all customers','customers.view_all',false),
  ('manager','Customers','View own-area customers','customers.view_own',true),
  ('manager','Customers','Create customers','customers.create',true),
  ('manager','Customers','Edit own customers','customers.edit_own',true),
  ('manager','Customers','Delete customers','customers.delete',false),
  ('manager','Master Data','Manage areas / locations','master.areas',false),
  ('manager','Master Data','Manage references / customer types','master.refs',false),
  ('manager','Master Data','Manage service items & rates','master.services',false),
  ('manager','Reports','View reports','reports.view',true),
  ('manager','Settings','Company / invoice / system settings','settings.manage',false);

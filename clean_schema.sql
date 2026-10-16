
SELECT pg_catalog.set_config('search_path', '', false);

CREATE SCHEMA public;

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager'
);

CREATE TYPE public.loan_status AS ENUM (
    'ACTIVE',
    'PAID',
    'DEFAULTED'
);

CREATE TYPE public.loan_transaction_type AS ENUM (
    'REPAYMENT',
    'COLLECTION',
    'INTEREST'
);

CREATE TYPE public.loan_type AS ENUM (
    'taken',
    'given'
);

CREATE FUNCTION public.bills_set_public_token() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := replace(replace(replace(encode(gen_random_bytes(9), 'base64'), '/', '_'), '+', '-'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.company_settings_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Company settings cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (SELECT COUNT(*) FROM public.company_settings) >= 1 THEN
      RAISE EXCEPTION 'Only one company settings row is allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.customers_auto_assign_manager() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND has_role(NEW.created_by, 'manager'::app_role) THEN
    INSERT INTO public.customer_managers (customer_id, manager_id, assigned_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT (customer_id, manager_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.customers_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Derive opening_balance_type from sign of amount (kept for backward compatibility)
  IF NEW.opening_balance_amount IS NULL THEN
    NEW.opening_balance_amount := 0;
  END IF;
  IF NEW.opening_balance_amount > 0 THEN
    NEW.opening_balance_type := 'ADVANCE';
  ELSIF NEW.opening_balance_amount < 0 THEN
    NEW.opening_balance_type := 'DUE';
  ELSE
    NEW.opening_balance_type := NULL;
  END IF;

  -- Area must belong to location when both provided
  IF NEW.area_id IS NOT NULL AND NEW.location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.areas WHERE id = NEW.area_id AND location_id = NEW.location_id) THEN
      RAISE EXCEPTION 'Area does not belong to the selected location';
    END IF;
  END IF;

  -- Keep name in sync with company_name
  IF NEW.company_name IS NOT NULL THEN
    NEW.name := NEW.company_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_latest_rate_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  latest_id uuid;
  target_item uuid;
  target_type uuid;
BEGIN
  -- Use OLD values to find if the record being edited IS the latest for its current scope
  target_item := COALESCE(OLD.service_item_id, NEW.service_item_id);
  target_type := COALESCE(OLD.customer_type_id, NEW.customer_type_id);

  SELECT id INTO latest_id
  FROM public.service_rates
  WHERE service_item_id = target_item
    AND customer_type_id IS NOT DISTINCT FROM target_type
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical service rates cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id <> latest_id THEN
    RAISE EXCEPTION 'Only the latest service rate can be edited';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.service_item_id <> NEW.service_item_id THEN
    RAISE EXCEPTION 'Cannot change service_item_id of an existing rate';
  END IF;

  -- REMOVED: Restriction on changing customer_type_id
  -- This allows fixing mistakes in type assignment for the latest rate.

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.get_db_size() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select pg_database_size(current_database()); $$;

CREATE FUNCTION public.get_storage_files() RETURNS TABLE(name text, bucket_id text, size_bytes bigint, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    o.name::text,
    o.bucket_id::text,
    COALESCE((o.metadata->>'size')::bigint, 0)::bigint AS size_bytes,
    o.updated_at
  FROM storage.objects o
  ORDER BY COALESCE((o.metadata->>'size')::bigint, 0) DESC;
$$;

CREATE FUNCTION public.get_storage_size() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint FROM storage.objects;
$$;

CREATE FUNCTION public.get_table_sizes() RETURNS TABLE(table_name text, size_bytes bigint, row_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    c.relname::text AS table_name,
    pg_total_relation_size(c.oid)::bigint AS size_bytes,
    COALESCE(s.n_live_tup, 0)::bigint AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname AND s.schemaname = n.nspname
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
$$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_username TEXT := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_role app_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'manager');
BEGIN
  INSERT INTO public.profiles (id, name, username, email, mobile, area_id, created_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    v_username,
    NEW.email,
    NEW.raw_user_meta_data->>'mobile',
    NULLIF(NEW.raw_user_meta_data->>'area_id','')::uuid,
    NULLIF(NEW.raw_user_meta_data->>'created_by','')::uuid
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  RETURN NEW;
END; $$;

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    area_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    bank_name text,
    account_number text,
    initial_balance numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_name text
);

CREATE TABLE public.bill_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_id uuid NOT NULL,
    service_item_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    qty numeric NOT NULL,
    rate_used numeric DEFAULT 0 NOT NULL,
    minimum_charge_used numeric DEFAULT 0 NOT NULL,
    calculated_amount numeric DEFAULT 0 NOT NULL,
    final_amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_qty_check CHECK ((qty > (0)::numeric))
);

CREATE SEQUENCE public.bill_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_no text NOT NULL,
    customer_id uuid NOT NULL,
    bill_date date DEFAULT CURRENT_DATE NOT NULL,
    billing_month date NOT NULL,
    previous_balance numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    grand_total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    notes text,
    created_by uuid,
    finalized_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_token text,
    whatsapp_sent_at timestamp with time zone,
    CONSTRAINT bills_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'FINALIZED'::text, 'CANCELLED'::text])))
);

CREATE TABLE public.collection_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT collection_allocations_amount_check CHECK ((amount > (0)::numeric))
);

CREATE TABLE public.collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_no text NOT NULL,
    customer_id uuid NOT NULL,
    collection_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric NOT NULL,
    payment_method text DEFAULT 'CASH'::text NOT NULL,
    reference_no text,
    notes text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    collected_by uuid,
    created_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bank_account_id uuid,
    CONSTRAINT collections_amount_check CHECK ((amount > (0)::numeric))
);

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text DEFAULT ''::text NOT NULL,
    address text,
    phone text,
    email text,
    website text,
    logo_url text,
    bin_number text,
    vat_number text,
    tax_number text,
    invoice_prefix text DEFAULT 'INV-'::text,
    currency text DEFAULT 'BDT'::text,
    invoice_terms text,
    bank_name text,
    bank_account_number text,
    bank_branch text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_registration_no text,
    trade_license_no text,
    starting_invoice_number integer DEFAULT 1 NOT NULL,
    memo_prefix text DEFAULT 'MEMO-'::text NOT NULL,
    decimal_places integer DEFAULT 0 NOT NULL,
    default_minimum_charge numeric DEFAULT 0 NOT NULL,
    default_tax_percent numeric DEFAULT 0 NOT NULL,
    auto_due_carry_forward boolean DEFAULT true NOT NULL,
    allow_negative_balance boolean DEFAULT false NOT NULL,
    bin_unique_enforcement boolean DEFAULT true NOT NULL,
    allow_duplicate_mobile boolean DEFAULT true NOT NULL,
    enable_auto_assign boolean DEFAULT true NOT NULL,
    enable_month_rule boolean DEFAULT true NOT NULL,
    payment_mode text DEFAULT 'BKASH'::text NOT NULL,
    payment_link_expiry_days integer DEFAULT 7 NOT NULL,
    allow_partial_payment boolean DEFAULT false NOT NULL,
    auto_collection_enable boolean DEFAULT true NOT NULL,
    whatsapp_api_key text,
    sms_api_key text,
    sender_id text,
    auto_messaging_enabled boolean DEFAULT true NOT NULL,
    bkash_merchant_number text,
    bkash_api_key text,
    bkash_secret_key text,
    bkash_callback_url text,
    timezone text DEFAULT 'Asia/Dhaka'::text NOT NULL,
    date_format text DEFAULT 'DD/MM/YYYY'::text NOT NULL,
    language text DEFAULT 'bn'::text NOT NULL,
    session_timeout_minutes integer DEFAULT 30 NOT NULL,
    auto_logout boolean DEFAULT true NOT NULL,
    password_policy text DEFAULT 'STRONG'::text NOT NULL,
    login_retry_limit integer DEFAULT 5 NOT NULL,
    two_factor_auth boolean DEFAULT false NOT NULL,
    strict_role_mode boolean DEFAULT true NOT NULL,
    default_report_month text DEFAULT 'CURRENT'::text NOT NULL,
    show_zero_balance boolean DEFAULT false NOT NULL,
    include_disabled_cust boolean DEFAULT false NOT NULL,
    invoice_footer_text text,
    invoice_active boolean DEFAULT true NOT NULL,
    print_margin_top numeric DEFAULT 15 NOT NULL,
    print_margin_bottom numeric DEFAULT 15 NOT NULL,
    print_margin_left numeric DEFAULT 12 NOT NULL,
    print_margin_right numeric DEFAULT 12 NOT NULL,
    print_show_logo boolean DEFAULT true NOT NULL,
    print_show_header boolean DEFAULT true NOT NULL,
    print_show_footer boolean DEFAULT true NOT NULL,
    print_copies text DEFAULT 'ORIGINAL'::text NOT NULL,
    print_signature_line boolean DEFAULT true NOT NULL,
    print_signature_label text,
    print_signature_url text,
    print_page_size text DEFAULT 'A4'::text,
    print_orientation text DEFAULT 'portrait'::text,
    last_invoice_number integer DEFAULT 0 NOT NULL,
    last_invoice_year integer,
    last_memo_number integer DEFAULT 0 NOT NULL,
    last_memo_year integer,
    starting_memo_number integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.customer_managers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    manager_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_yearly_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    year integer NOT NULL,
    opening_due numeric DEFAULT 0 NOT NULL,
    total_bills numeric DEFAULT 0 NOT NULL,
    total_collections numeric DEFAULT 0 NOT NULL,
    closing_due numeric DEFAULT 0 NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    mobile text,
    email text,
    address text,
    area_id uuid,
    reference text,
    monthly_fee numeric(12,2) DEFAULT 0,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_type_id uuid DEFAULT 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54'::uuid NOT NULL,
    company_name text,
    proprietor_name text,
    bin_number text,
    vat_registration_no text,
    trade_license_no text,
    alternative_mobile text,
    location_id uuid,
    reference_id uuid,
    opening_balance_type text,
    opening_balance_amount numeric DEFAULT 0 NOT NULL,
    vat_user_id text,
    vat_password text,
    enabled_month date,
    disabled_at timestamp with time zone
);

CREATE TABLE public.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category_id uuid,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    payment_method text NOT NULL,
    bank_account_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

CREATE TABLE public.income_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.loan_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.loan_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id uuid NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    type public.loan_transaction_type NOT NULL,
    payment_method text DEFAULT 'CASH'::text NOT NULL,
    bank_account_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

CREATE TABLE public.loans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    interest_rate numeric(5,2) DEFAULT 0,
    type public.loan_type NOT NULL,
    status public.loan_status DEFAULT 'ACTIVE'::public.loan_status NOT NULL,
    loan_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mushak_4_3_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mushak_4_3_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id text NOT NULL,
    customer_id uuid NOT NULL,
    reference_id uuid,
    tax_period text NOT NULL,
    tax_period_date date NOT NULL,
    submission_date date DEFAULT CURRENT_DATE NOT NULL,
    item_name text NOT NULL,
    boe_no text NOT NULL,
    boe_date date NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    sms_sent boolean DEFAULT false NOT NULL,
    remarks text,
    created_by uuid,
    updated_by uuid,
    finalized_by uuid,
    finalized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mushak_4_3_submissions_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'FINALIZED'::text])))
);

CREATE TABLE public.others_income (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    income_date date DEFAULT CURRENT_DATE NOT NULL,
    source text NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    payment_method text NOT NULL,
    bank_account_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    source_id uuid
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    mobile text,
    area_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."references" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number text,
    mobile_number text
);

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.app_role NOT NULL,
    module text NOT NULL,
    action text NOT NULL,
    permission_key text NOT NULL,
    allowed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.service_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.service_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_item_id uuid NOT NULL,
    regular_rate numeric(12,2) NOT NULL,
    minimum_charge numeric(12,2) NOT NULL,
    effective_from date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_type_id uuid DEFAULT 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54'::uuid,
    CONSTRAINT service_rates_minimum_charge_check CHECK ((minimum_charge >= (0)::numeric)),
    CONSTRAINT service_rates_regular_rate_check CHECK ((regular_rate >= (0)::numeric))
);

CREATE TABLE public.user_activity (
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_path text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_interaction_at timestamp with time zone
);

CREATE TABLE public.user_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    area_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vat_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    submission_id uuid,
    reference text,
    ip_address text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vat_sms_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid,
    recipient_mobile text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    provider_response text,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_sms_logs_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'FAILED'::text])))
);

CREATE TABLE public.vat_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    tax_period text NOT NULL,
    tax_period_date date NOT NULL,
    submission_id text NOT NULL,
    remarks text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    submission_date date,
    finalized_at timestamp with time zone,
    finalized_by uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_submissions_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'FINALIZED'::text])))
);

CREATE TABLE public.whatsapp_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_id uuid,
    recipient_mobile text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    response text,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    collection_id uuid,
    CONSTRAINT whatsapp_logs_status_check CHECK ((status = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text])))
);

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_bill_no_key UNIQUE (bill_no);

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collection_allocations
    ADD CONSTRAINT collection_allocations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_receipt_no_key UNIQUE (receipt_no);

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_managers
    ADD CONSTRAINT customer_managers_customer_id_manager_id_key UNIQUE (customer_id, manager_id);

ALTER TABLE ONLY public.customer_managers
    ADD CONSTRAINT customer_managers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_type_name_key UNIQUE (type_name);

ALTER TABLE ONLY public.customer_yearly_balances
    ADD CONSTRAINT customer_yearly_balances_customer_id_year_key UNIQUE (customer_id, year);

ALTER TABLE ONLY public.customer_yearly_balances
    ADD CONSTRAINT customer_yearly_balances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.income_sources
    ADD CONSTRAINT income_sources_name_key UNIQUE (name);

ALTER TABLE ONLY public.income_sources
    ADD CONSTRAINT income_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loan_contacts
    ADD CONSTRAINT loan_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loan_transactions
    ADD CONSTRAINT loan_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mushak_4_3_items
    ADD CONSTRAINT mushak_4_3_items_item_name_key UNIQUE (item_name);

ALTER TABLE ONLY public.mushak_4_3_items
    ADD CONSTRAINT mushak_4_3_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mushak_4_3_submissions
    ADD CONSTRAINT mushak_4_3_submissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mushak_4_3_submissions
    ADD CONSTRAINT mushak_4_3_submissions_submission_id_key UNIQUE (submission_id);

ALTER TABLE ONLY public.others_income
    ADD CONSTRAINT others_income_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);

ALTER TABLE ONLY public."references"
    ADD CONSTRAINT references_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public."references"
    ADD CONSTRAINT references_reference_name_key UNIQUE (reference_name);

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_permission_key_key UNIQUE (role, permission_key);

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_item_name_key UNIQUE (item_name);

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_rates
    ADD CONSTRAINT service_rates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_areas
    ADD CONSTRAINT user_areas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_areas
    ADD CONSTRAINT user_areas_user_id_area_id_key UNIQUE (user_id, area_id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

ALTER TABLE ONLY public.vat_audit_logs
    ADD CONSTRAINT vat_audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vat_sms_logs
    ADD CONSTRAINT vat_sms_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vat_submissions
    ADD CONSTRAINT vat_submissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vat_submissions
    ADD CONSTRAINT vat_submissions_unique_customer_period UNIQUE (customer_id, tax_period_date);

ALTER TABLE ONLY public.whatsapp_logs
    ADD CONSTRAINT whatsapp_logs_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX bills_public_token_uniq ON public.bills USING btree (public_token) WHERE (public_token IS NOT NULL);

CREATE UNIQUE INDEX bills_unique_customer_month_active ON public.bills USING btree (customer_id, billing_month) WHERE (status <> 'CANCELLED'::text);

CREATE UNIQUE INDEX customers_bin_number_unique ON public.customers USING btree (bin_number) WHERE ((bin_number IS NOT NULL) AND (bin_number <> ''::text));

CREATE INDEX idx_bill_items_bill ON public.bill_items USING btree (bill_id);

CREATE INDEX idx_bills_bill_date ON public.bills USING btree (bill_date DESC);

CREATE INDEX idx_bills_billing_month ON public.bills USING btree (billing_month);

CREATE INDEX idx_bills_created_at ON public.bills USING btree (created_at);

CREATE INDEX idx_bills_customer ON public.bills USING btree (customer_id);

CREATE INDEX idx_bills_customer_id ON public.bills USING btree (customer_id);

CREATE INDEX idx_bills_status ON public.bills USING btree (status);

CREATE INDEX idx_bills_year ON public.bills USING btree (EXTRACT(year FROM billing_month));

CREATE INDEX idx_collection_allocations_bill ON public.collection_allocations USING btree (bill_id);

CREATE INDEX idx_collection_allocations_collection ON public.collection_allocations USING btree (collection_id);

CREATE INDEX idx_collections_collection_date ON public.collections USING btree (collection_date);

CREATE INDEX idx_collections_created_at ON public.collections USING btree (created_at);

CREATE INDEX idx_collections_customer ON public.collections USING btree (customer_id);

CREATE INDEX idx_collections_customer_id ON public.collections USING btree (customer_id);

CREATE INDEX idx_collections_date ON public.collections USING btree (collection_date DESC);

CREATE INDEX idx_collections_status ON public.collections USING btree (status);

CREATE INDEX idx_collections_year ON public.collections USING btree (EXTRACT(year FROM collection_date));

CREATE INDEX idx_customer_managers_customer ON public.customer_managers USING btree (customer_id);

CREATE INDEX idx_customer_managers_manager ON public.customer_managers USING btree (manager_id);

CREATE INDEX idx_customers_active ON public.customers USING btree (is_active);

CREATE INDEX idx_customers_area ON public.customers USING btree (area_id);

CREATE INDEX idx_customers_area_id ON public.customers USING btree (area_id);

CREATE INDEX idx_customers_company_name ON public.customers USING btree (company_name);

CREATE INDEX idx_customers_created_by ON public.customers USING btree (created_by);

CREATE INDEX idx_customers_location ON public.customers USING btree (location_id);

CREATE INDEX idx_customers_mobile ON public.customers USING btree (mobile);

CREATE INDEX idx_customers_reference ON public.customers USING btree (reference_id);

CREATE INDEX idx_cyb_customer ON public.customer_yearly_balances USING btree (customer_id);

CREATE INDEX idx_cyb_year ON public.customer_yearly_balances USING btree (year);

CREATE INDEX idx_m43_boe_date ON public.mushak_4_3_submissions USING btree (boe_date);

CREATE INDEX idx_m43_customer ON public.mushak_4_3_submissions USING btree (customer_id);

CREATE INDEX idx_m43_reference ON public.mushak_4_3_submissions USING btree (reference_id);

CREATE INDEX idx_m43_status ON public.mushak_4_3_submissions USING btree (status);

CREATE INDEX idx_m43_submission_date ON public.mushak_4_3_submissions USING btree (submission_date);

CREATE INDEX idx_m43_tax_period_date ON public.mushak_4_3_submissions USING btree (tax_period_date);

CREATE INDEX idx_service_rates_item_eff ON public.service_rates USING btree (service_item_id, effective_from DESC, created_at DESC);

CREATE INDEX idx_service_rates_item_type_eff ON public.service_rates USING btree (service_item_id, customer_type_id, effective_from DESC, created_at DESC);

CREATE INDEX idx_user_activity_interaction ON public.user_activity USING btree (last_interaction_at DESC);

CREATE INDEX idx_user_activity_last_seen ON public.user_activity USING btree (last_seen_at DESC);

CREATE INDEX idx_user_areas_area ON public.user_areas USING btree (area_id);

CREATE INDEX idx_user_areas_user ON public.user_areas USING btree (user_id);

CREATE INDEX idx_vat_audit_logs_created_at ON public.vat_audit_logs USING btree (created_at DESC);

CREATE INDEX idx_vat_audit_logs_user ON public.vat_audit_logs USING btree (user_id);

CREATE INDEX idx_vat_sms_logs_sent_at ON public.vat_sms_logs USING btree (sent_at);

CREATE INDEX idx_vat_sms_logs_submission ON public.vat_sms_logs USING btree (submission_id);

CREATE INDEX idx_vat_submissions_created_by ON public.vat_submissions USING btree (created_by);

CREATE INDEX idx_vat_submissions_customer ON public.vat_submissions USING btree (customer_id);

CREATE INDEX idx_vat_submissions_period ON public.vat_submissions USING btree (tax_period_date);

CREATE INDEX idx_vat_submissions_status ON public.vat_submissions USING btree (status);

CREATE INDEX whatsapp_logs_bill_idx ON public.whatsapp_logs USING btree (bill_id);

CREATE INDEX whatsapp_logs_collection_idx ON public.whatsapp_logs USING btree (collection_id);

CREATE INDEX whatsapp_logs_sent_at_idx ON public.whatsapp_logs USING btree (sent_at DESC);

CREATE TRIGGER bills_set_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER company_settings_guard_trg BEFORE INSERT OR DELETE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.company_settings_guard();

CREATE TRIGGER customer_types_set_updated_at BEFORE UPDATE ON public.customer_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customers_auto_assign_manager_trigger AFTER INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customers_auto_assign_manager();

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customers_validate_trigger BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customers_validate();

CREATE TRIGGER mushak_4_3_items_updated_at BEFORE UPDATE ON public.mushak_4_3_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER mushak_4_3_submissions_updated_at BEFORE UPDATE ON public.mushak_4_3_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_references_updated_at BEFORE UPDATE ON public."references" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_role_permissions_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_service_items_updated_at BEFORE UPDATE ON public.service_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_areas_updated BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_bills_set_public_token BEFORE INSERT ON public.bills FOR EACH ROW EXECUTE FUNCTION public.bills_set_public_token();

CREATE TRIGGER trg_cyb_updated_at BEFORE UPDATE ON public.customer_yearly_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_service_rates_enforce_latest BEFORE DELETE OR UPDATE ON public.service_rates FOR EACH ROW EXECUTE FUNCTION public.enforce_latest_rate_only();

CREATE TRIGGER trg_service_rates_updated_at BEFORE UPDATE ON public.service_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_activity_updated BEFORE UPDATE ON public.user_activity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_income_sources_updated_at BEFORE UPDATE ON public.income_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loan_contacts_updated_at BEFORE UPDATE ON public.loan_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_others_income_updated_at BEFORE UPDATE ON public.others_income FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER vat_submissions_set_updated_at BEFORE UPDATE ON public.vat_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_service_item_id_fkey FOREIGN KEY (service_item_id) REFERENCES public.service_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.collection_allocations
    ADD CONSTRAINT collection_allocations_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_allocations
    ADD CONSTRAINT collection_allocations_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.customer_managers
    ADD CONSTRAINT customer_managers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_type_id_fkey FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(id);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_reference_id_fkey FOREIGN KEY (reference_id) REFERENCES public."references"(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.loan_transactions
    ADD CONSTRAINT loan_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);

ALTER TABLE ONLY public.loan_transactions
    ADD CONSTRAINT loan_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.loan_transactions
    ADD CONSTRAINT loan_transactions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.loan_contacts(id);

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.others_income
    ADD CONSTRAINT others_income_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);

ALTER TABLE ONLY public.others_income
    ADD CONSTRAINT others_income_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.others_income
    ADD CONSTRAINT others_income_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.income_sources(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_rates
    ADD CONSTRAINT service_rates_customer_type_id_fkey FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(id);

ALTER TABLE ONLY public.service_rates
    ADD CONSTRAINT service_rates_service_item_id_fkey FOREIGN KEY (service_item_id) REFERENCES public.service_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vat_sms_logs
    ADD CONSTRAINT vat_sms_logs_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.vat_submissions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_logs
    ADD CONSTRAINT whatsapp_logs_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_logs
    ADD CONSTRAINT whatsapp_logs_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;

CREATE POLICY "admin manage areas" ON public.areas TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage bank_accounts" ON public.bank_accounts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage bill_items" ON public.bill_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage bills" ON public.bills TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage collection_allocations" ON public.collection_allocations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage collections" ON public.collections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage company_settings" ON public.company_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage customer_managers" ON public.customer_managers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage customer_types" ON public.customer_types TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage customer_yearly_balances" ON public.customer_yearly_balances TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage customers" ON public.customers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage expense_categories" ON public.expense_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage expenses" ON public.expenses TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage income_sources" ON public.income_sources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage loan_contacts" ON public.loan_contacts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage loan_transactions" ON public.loan_transactions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage loans" ON public.loans TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage locations" ON public.locations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage mushak_4_3_items" ON public.mushak_4_3_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage mushak_4_3_submissions" ON public.mushak_4_3_submissions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage others_income" ON public.others_income TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage profiles" ON public.profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage references" ON public."references" TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage role_permissions" ON public.role_permissions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage service_items" ON public.service_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage service_rates" ON public.service_rates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage user_areas" ON public.user_areas TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage vat_sms_logs" ON public.vat_sms_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage vat_submissions" ON public.vat_submissions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin manage whatsapp_logs" ON public.whatsapp_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin or assigned manager read bills" ON public.bills FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = bills.customer_id) AND (cm.manager_id = auth.uid()))))))));

CREATE POLICY "admin or assigned manager read customer_yearly_balances" ON public.customer_yearly_balances FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = customer_yearly_balances.customer_id) AND (cm.manager_id = auth.uid())))))));

CREATE POLICY "admin or assigned manager read customers" ON public.customers FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = customers.id) AND (cm.manager_id = auth.uid())))))));

CREATE POLICY "admin or manager read collection_allocations" ON public.collection_allocations FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_allocations.collection_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.customer_managers cm
          WHERE ((cm.customer_id = c.customer_id) AND (cm.manager_id = auth.uid())))))))))));

CREATE POLICY "admin or manager-own read bill_items" ON public.bill_items FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_items.bill_id) AND (b.created_by = auth.uid())))))));

CREATE POLICY "admin or manager-own read collections" ON public.collections FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = collections.customer_id) AND (cm.manager_id = auth.uid()))))))));

CREATE POLICY "admin or manager-own read whatsapp_logs" ON public.whatsapp_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = whatsapp_logs.bill_id) AND (b.created_by = auth.uid())))))));

CREATE POLICY "admin read company_settings" ON public.company_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin read references" ON public."references" FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin read vat_audit_logs" ON public.vat_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read areas" ON public.areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read customer_types" ON public.customer_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read income_sources" ON public.income_sources FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read locations" ON public.locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read mushak_4_3_items" ON public.mushak_4_3_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read service_items" ON public.service_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth read service_rates" ON public.service_rates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_allocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_managers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_yearly_balances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loan_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loan_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager create bills" ON public.bills FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "manager create collections" ON public.collections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "manager create customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "manager create mushak_4_3_submissions" ON public.mushak_4_3_submissions FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (created_by = auth.uid())));

CREATE POLICY "manager create vat_submissions" ON public.vat_submissions FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (created_by = auth.uid())));

CREATE POLICY "manager delete own drafts" ON public.vat_submissions FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (status = 'DRAFT'::text) AND (created_by = auth.uid())));

CREATE POLICY "manager manage own bill_items" ON public.bill_items TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_items.bill_id) AND (b.created_by = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_items.bill_id) AND (b.created_by = auth.uid()))))));

CREATE POLICY "manager manage own collection_allocations" ON public.collection_allocations TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_allocations.collection_id) AND (c.created_by = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.collections c
  WHERE ((c.id = collection_allocations.collection_id) AND (c.created_by = auth.uid()))))));

CREATE POLICY "manager read mushak_4_3_submissions" ON public.mushak_4_3_submissions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = mushak_4_3_submissions.customer_id) AND (cm.manager_id = auth.uid()))))))));

CREATE POLICY "manager read own assignments" ON public.customer_managers FOR SELECT TO authenticated USING (((manager_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "manager read own vat_audit_logs" ON public.vat_audit_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (user_id = auth.uid())));

CREATE POLICY "manager read vat_sms_logs" ON public.vat_sms_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.vat_submissions s
  WHERE ((s.id = vat_sms_logs.submission_id) AND ((s.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.customer_managers cm
          WHERE ((cm.customer_id = s.customer_id) AND (cm.manager_id = auth.uid())))))))))));

CREATE POLICY "manager read vat_submissions" ON public.vat_submissions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = vat_submissions.customer_id) AND (cm.manager_id = auth.uid()))))))));

CREATE POLICY "manager update assigned customers" ON public.customers FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = customers.id) AND (cm.manager_id = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = customers.id) AND (cm.manager_id = auth.uid()))))));

CREATE POLICY "manager update mushak_4_3_submissions" ON public.mushak_4_3_submissions FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = mushak_4_3_submissions.customer_id) AND (cm.manager_id = auth.uid()))))))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = mushak_4_3_submissions.customer_id) AND (cm.manager_id = auth.uid())))))));

CREATE POLICY "manager update own bills" ON public.bills FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (created_by = auth.uid()))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND (created_by = auth.uid())));

CREATE POLICY "manager update vat_submissions" ON public.vat_submissions FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = vat_submissions.customer_id) AND (cm.manager_id = auth.uid()))))))) WITH CHECK ((public.has_role(auth.uid(), 'manager'::public.app_role) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.customer_managers cm
  WHERE ((cm.customer_id = vat_submissions.customer_id) AND (cm.manager_id = auth.uid())))))));

ALTER TABLE public.mushak_4_3_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mushak_4_3_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only admin delete user_roles" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "only admin insert user_roles" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "only admin update user_roles" ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.others_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin read activity" ON public.user_activity FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "own or admin read user_areas" ON public.user_areas FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."references" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users update own activity" ON public.user_activity FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "users upsert own activity" ON public.user_activity FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.vat_audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vat_sms_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vat_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

\unrestrict skLd3v26uAIJDVeds5danhiSkAW5nH2OWrcdobG70j8iuxo9BF8bCVBeje0UaVV


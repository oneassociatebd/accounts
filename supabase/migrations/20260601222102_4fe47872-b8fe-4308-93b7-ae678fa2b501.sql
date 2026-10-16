-- Performance indexes for bills table
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_billing_month ON public.bills(billing_month);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON public.bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_year ON public.bills(EXTRACT(YEAR FROM billing_month));
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);

-- Performance indexes for collections table
CREATE INDEX IF NOT EXISTS idx_collections_customer_id ON public.collections(customer_id);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON public.collections(created_at);
CREATE INDEX IF NOT EXISTS idx_collections_collection_date ON public.collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_collections_year ON public.collections(EXTRACT(YEAR FROM collection_date));
CREATE INDEX IF NOT EXISTS idx_collections_status ON public.collections(status);
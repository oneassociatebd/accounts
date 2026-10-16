CREATE UNIQUE INDEX IF NOT EXISTS bills_unique_customer_month_active
ON public.bills (customer_id, billing_month)
WHERE status <> 'CANCELLED';
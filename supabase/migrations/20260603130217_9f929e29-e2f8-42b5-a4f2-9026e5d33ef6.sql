-- Disable user triggers temporarily to allow updating historical rates
ALTER TABLE public.service_rates DISABLE TRIGGER USER;

-- Update existing service rates where customer_type_id is NULL
UPDATE public.service_rates
SET customer_type_id = 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54'
WHERE customer_type_id IS NULL;

-- Set default for service_rates table
ALTER TABLE public.service_rates
ALTER COLUMN customer_type_id SET DEFAULT 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54';

-- Update any customers that might have NULL (safety)
UPDATE public.customers
SET customer_type_id = 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54'
WHERE customer_type_id IS NULL;

-- Set default for customers table
ALTER TABLE public.customers
ALTER COLUMN customer_type_id SET DEFAULT 'f30df488-90ac-4a3a-8555-2bc2d5bf9d54';

-- Re-enable user triggers
ALTER TABLE public.service_rates ENABLE TRIGGER USER;
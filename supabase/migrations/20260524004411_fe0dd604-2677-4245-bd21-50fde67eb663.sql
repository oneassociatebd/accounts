-- Make customer_type_id NOT NULL on existing table
-- First, update any existing rows with NULL customer_type_id to a default value
UPDATE public.customers SET customer_type_id = (
  SELECT id FROM public.customer_types ORDER BY created_at LIMIT 1
) WHERE customer_type_id IS NULL;

-- Now alter the column to NOT NULL
ALTER TABLE public.customers ALTER COLUMN customer_type_id SET NOT NULL;
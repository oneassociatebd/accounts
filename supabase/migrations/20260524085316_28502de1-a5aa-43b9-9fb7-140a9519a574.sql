UPDATE public.bills
SET bill_no = 'INV-' || LPAD(REGEXP_REPLACE(bill_no, '\D', '', 'g'), 6, '0') || '/' || EXTRACT(YEAR FROM created_at)::text
WHERE bill_no !~ '/\d{4}$';
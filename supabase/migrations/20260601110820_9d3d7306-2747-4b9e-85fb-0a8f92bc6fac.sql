UPDATE public.customers
SET mobile = '880' || mobile
WHERE mobile ~ '^01[0-9]{9}$';

UPDATE public.customers
SET alternative_mobile = '+880' || alternative_mobile
WHERE alternative_mobile ~ '^01[0-9]{9}$';

UPDATE public.customers
SET alternative_mobile = '+' || alternative_mobile
WHERE alternative_mobile ~ '^8801[0-9]{9}$';
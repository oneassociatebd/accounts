UPDATE public.customers
SET mobile = '880' || substring(mobile from 5)
WHERE mobile LIKE '8800%' AND length(mobile) = 14;

UPDATE public.customers
SET alternative_mobile = '+880' || substring(alternative_mobile from 6)
WHERE alternative_mobile LIKE '+8800%' AND length(alternative_mobile) = 15;

UPDATE public.customers
SET alternative_mobile = '+880' || substring(alternative_mobile from 5)
WHERE alternative_mobile LIKE '8800%' AND length(alternative_mobile) = 14;
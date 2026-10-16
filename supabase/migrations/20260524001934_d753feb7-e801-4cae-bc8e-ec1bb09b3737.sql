ALTER TABLE public.company_settings
  ADD COLUMN print_page_size TEXT DEFAULT 'A4',
  ADD COLUMN print_orientation TEXT DEFAULT 'portrait';
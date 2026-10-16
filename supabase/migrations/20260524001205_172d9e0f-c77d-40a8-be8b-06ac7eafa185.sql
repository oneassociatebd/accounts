ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS print_margin_top numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS print_margin_bottom numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS print_margin_left numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS print_margin_right numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS print_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_show_header boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_show_footer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_copies text NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN IF NOT EXISTS print_signature_line boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_signature_label text;
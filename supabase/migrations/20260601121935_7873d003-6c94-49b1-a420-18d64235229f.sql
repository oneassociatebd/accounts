ALTER TABLE public.whatsapp_logs ADD COLUMN collection_id uuid REFERENCES collections(id) ON DELETE CASCADE;
CREATE INDEX whatsapp_logs_collection_idx ON public.whatsapp_logs(collection_id);

-- Update existing RLS policies to allow reads with collection context too (admin already full access)
-- The existing read policy checks via bills join; we keep that as-is since collections don't need separate read rules

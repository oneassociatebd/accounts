CREATE OR REPLACE FUNCTION public.get_table_sizes()
RETURNS TABLE(table_name text, size_bytes bigint, row_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    c.relname::text AS table_name,
    pg_total_relation_size(c.oid)::bigint AS size_bytes,
    COALESCE(s.n_live_tup, 0)::bigint AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname AND s.schemaname = n.nspname
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_storage_files()
RETURNS TABLE(name text, bucket_id text, size_bytes bigint, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    o.name::text,
    o.bucket_id::text,
    COALESCE((o.metadata->>'size')::bigint, 0)::bigint AS size_bytes,
    o.updated_at
  FROM storage.objects o
  ORDER BY COALESCE((o.metadata->>'size')::bigint, 0) DESC;
$$;
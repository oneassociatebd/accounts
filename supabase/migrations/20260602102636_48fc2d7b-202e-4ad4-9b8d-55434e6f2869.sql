CREATE OR REPLACE FUNCTION public.get_storage_size()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)::bigint FROM storage.objects;
$$;

REVOKE ALL ON FUNCTION public.get_storage_size() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_size() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM authenticated;
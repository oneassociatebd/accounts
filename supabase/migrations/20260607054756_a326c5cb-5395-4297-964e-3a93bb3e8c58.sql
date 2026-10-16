REVOKE EXECUTE ON FUNCTION public.get_db_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_table_sizes() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_files() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_db_size() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_size() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_table_sizes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_files() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.customers_auto_assign_manager() FROM authenticated;

-- Note: has_role and handle_new_user remain executable by authenticated
-- because has_role is required by RLS policies and handle_new_user is a trigger.
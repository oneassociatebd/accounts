create or replace function public.get_db_size()
returns bigint
language sql
security definer
stable
set search_path = public
as $$ select pg_database_size(current_database()); $$;

revoke execute on function public.get_db_size() from public;
revoke execute on function public.get_db_size() from anon;
revoke execute on function public.get_db_size() from authenticated;
grant execute on function public.get_db_size() to service_role;
CREATE OR REPLACE FUNCTION public.restore_backup_chunk(p_table text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_table text;
  v_pk text;
  v_cols text;
  v_set text;
  v_count integer;
BEGIN
  -- Only allow restoring into real base tables in the public schema
  SELECT c.relname INTO v_table
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = p_table;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown table: %', p_table;
  END IF;

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_pk
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
  WHERE i.indrelid = format('public.%I', p_table)::regclass
    AND i.indisprimary;
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'Table % has no primary key', p_table;
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table;

  SELECT string_agg(quote_ident(c) || ' = EXCLUDED.' || quote_ident(c), ', ')
    INTO v_set
  FROM (
    SELECT column_name AS c
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name NOT IN (
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
        WHERE i.indrelid = format('public.%I', p_table)::regclass
          AND i.indisprimary
      )
  ) cols;

  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1) ON CONFLICT (%s) DO UPDATE SET %s',
    p_table, v_cols, p_table, v_pk, COALESCE(v_set, '')
  ) USING p_rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.restore_backup_chunk(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_backup_chunk(text, jsonb) TO service_role;

-- Allow idempotent restore of historical rates: an UPDATE that changes
-- nothing (same id, same values) may pass; real edits to historical rates
-- remain blocked.
CREATE OR REPLACE FUNCTION public.enforce_latest_rate_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  latest_id uuid;
  target_item uuid;
  target_type uuid;
BEGIN
  target_item := COALESCE(OLD.service_item_id, NEW.service_item_id);
  target_type := COALESCE(OLD.customer_type_id, NEW.customer_type_id);

  SELECT id INTO latest_id
  FROM public.service_rates
  WHERE service_item_id = target_item
    AND customer_type_id IS NOT DISTINCT FROM target_type
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical service rates cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id <> latest_id THEN
    RAISE EXCEPTION 'Only the latest service rate can be edited';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.service_item_id <> NEW.service_item_id THEN
    RAISE EXCEPTION 'Cannot change service_item_id of an existing rate';
  END IF;

  RETURN NEW;
END;
$fn$;
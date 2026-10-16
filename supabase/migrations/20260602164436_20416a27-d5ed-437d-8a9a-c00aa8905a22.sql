
CREATE TABLE public.user_activity (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_activity TO authenticated;
GRANT ALL ON public.user_activity TO service_role;

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users upsert own activity"
ON public.user_activity
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own activity"
ON public.user_activity
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "own or admin read activity"
ON public.user_activity
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_user_activity_last_seen ON public.user_activity (last_seen_at DESC);

CREATE TRIGGER trg_user_activity_updated
BEFORE UPDATE ON public.user_activity
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

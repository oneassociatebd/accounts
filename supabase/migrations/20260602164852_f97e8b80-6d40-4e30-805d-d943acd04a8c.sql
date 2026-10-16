ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;

-- Add index for fast active-user queries
CREATE INDEX IF NOT EXISTS idx_user_activity_interaction ON public.user_activity (last_interaction_at DESC);
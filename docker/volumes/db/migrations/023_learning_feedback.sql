-- English Learning OS MVP feedback collection.
-- The table is intentionally service-role only: authenticated and anonymous
-- clients submit through /api/v1/feedback so account ownership is derived from
-- a verified token and diagnostics can be consent-gated on the server.

CREATE TABLE IF NOT EXISTS public.learning_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  guest_id text NOT NULL CHECK (char_length(guest_id) BETWEEN 1 AND 128),
  message text NOT NULL CHECK (char_length(message) BETWEEN 3 AND 4000),
  diagnostic_consent boolean NOT NULL DEFAULT false,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_feedback_created_at
  ON public.learning_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_feedback_user_id
  ON public.learning_feedback (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.learning_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_feedback FROM anon, authenticated;
GRANT ALL ON public.learning_feedback TO service_role;

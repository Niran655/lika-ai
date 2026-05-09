CREATE TABLE public.user_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'elevenlabs',
  voice_id text NOT NULL,
  name text NOT NULL DEFAULT 'My voice',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own voices" ON public.user_voices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own voices" ON public.user_voices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own voices" ON public.user_voices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own voices" ON public.user_voices FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_voices_user ON public.user_voices(user_id);
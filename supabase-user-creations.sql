-- Histórico de criações por usuário (persistido na conta)
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

CREATE TABLE IF NOT EXISTS public.user_creations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  prompt TEXT DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'video',
  files JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_creations_user_id ON public.user_creations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_creations_created_at ON public.user_creations(created_at DESC);

ALTER TABLE public.user_creations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all user_creations" ON public.user_creations;
CREATE POLICY "Allow all user_creations" ON public.user_creations FOR ALL USING (true) WITH CHECK (true);

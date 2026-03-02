-- Tarefas ativas vinculadas à conta do usuário
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

CREATE TABLE IF NOT EXISTS public.user_active_tasks (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'video',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_active_tasks_user_id ON public.user_active_tasks(user_id);

ALTER TABLE public.user_active_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all user_active_tasks" ON public.user_active_tasks;
CREATE POLICY "Allow all user_active_tasks" ON public.user_active_tasks FOR ALL USING (true) WITH CHECK (true);

-- Suporte a múltiplas tarefas ativas por usuário
-- Execute no Supabase: SQL Editor > New query > Colar e rodar
-- Esta tabela permite várias tarefas em andamento por usuário (até 5)

CREATE TABLE IF NOT EXISTS public.user_active_task_items (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'video',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt TEXT DEFAULT '',
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_user_active_task_items_user_id ON public.user_active_task_items(user_id);

ALTER TABLE public.user_active_task_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all user_active_task_items" ON public.user_active_task_items;
CREATE POLICY "Allow all user_active_task_items" ON public.user_active_task_items FOR ALL USING (true) WITH CHECK (true);

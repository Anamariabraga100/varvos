-- Adiciona coluna model à user_active_task_items (para restaurar tarefas Grok/Kie corretamente)
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

ALTER TABLE public.user_active_task_items
ADD COLUMN IF NOT EXISTS model TEXT;

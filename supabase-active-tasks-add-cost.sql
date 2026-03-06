-- Adiciona coluna cost à user_active_task_items (para reembolso ao restaurar em outro dispositivo)
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

ALTER TABLE public.user_active_task_items
ADD COLUMN IF NOT EXISTS cost INTEGER;

-- Adiciona coluna aspect_ratio para suportar modal 16:9 no histórico
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

ALTER TABLE public.user_creations
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16';

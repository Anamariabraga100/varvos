-- Migração: tabela app_settings + configurações individuais por modelo
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

-- 1. Criar tabela se não existir
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS (ignora erro se já existir)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all app_settings" ON public.app_settings;
CREATE POLICY "Allow all app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- 3. Inserir configurações de modelos (ocultar individualmente)
INSERT INTO public.app_settings (key, value)
VALUES 
  ('hide_model_grok', 'false'::jsonb),
  ('hide_model_veo3', 'false'::jsonb),
  ('hide_model_sora2', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

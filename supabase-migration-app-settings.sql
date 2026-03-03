-- Tabela de configurações da aplicação (admin)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Valor inicial: mostrar seleção de modelo (Sora visível)
INSERT INTO public.app_settings (key, value)
VALUES ('hide_model_selection', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Configuração admin: ocultar VEO 3 e deixar apenas Sora 2 disponível
INSERT INTO public.app_settings (key, value)
VALUES ('hide_veo3', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

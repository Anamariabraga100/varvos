-- Autenticação por e-mail/senha (execute no Supabase SQL Editor)
-- Rode APÓS o supabase-schema.sql

-- Verifica se o e-mail já está cadastrado no Supabase Auth
CREATE OR REPLACE FUNCTION public.check_email_registered(p_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users 
    WHERE email = lower(trim(p_email))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cria/atualiza usuário em public.users após signup por e-mail
CREATE OR REPLACE FUNCTION public.upsert_user_from_email(
  p_email TEXT,
  p_auth_uid UUID
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (p_auth_uid, lower(trim(p_email)))
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

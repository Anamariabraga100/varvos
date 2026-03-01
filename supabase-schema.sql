-- VARVOS — Schema Supabase
-- Execute no Supabase: SQL Editor > New query > Colar e rodar

-- 1. Tabela de usuários
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  google_id TEXT UNIQUE,
  credits INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de pagamentos
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  gateway TEXT, -- stripe, mercadopago, etc
  gateway_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela de log de créditos
CREATE TABLE IF NOT EXISTS public.credit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positivo = ganho, negativo = uso
  type TEXT NOT NULL, -- purchase, usage, bonus, admin_adjustment
  reference_id UUID, -- ex: payment_id para purchase
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON public.credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_created_at ON public.credit_logs(created_at DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Permitir que o frontend (anon) faça as operações necessárias
-- Em produção, refine as políticas conforme sua estratégia de auth

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (execute uma vez; se já existirem, ignore os erros)
DROP POLICY IF EXISTS "Allow all users" ON public.users;
CREATE POLICY "Allow all users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all payments" ON public.payments;
CREATE POLICY "Allow all payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all credit_logs" ON public.credit_logs;
CREATE POLICY "Allow all credit_logs" ON public.credit_logs FOR ALL USING (true) WITH CHECK (true);

-- Função: upsert usuário ao fazer login com Google
CREATE OR REPLACE FUNCTION public.upsert_user_from_google(
  p_email TEXT,
  p_name TEXT,
  p_picture TEXT,
  p_google_id TEXT
)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
BEGIN
  INSERT INTO public.users (email, name, picture, google_id)
  VALUES (p_email, p_name, p_picture, p_google_id)
  ON CONFLICT (google_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    picture = EXCLUDED.picture,
    updated_at = NOW()
  RETURNING id INTO v_user_id;
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SEGURANÇA: Bloquear que usuários (anon) alterem credits ou outros dados sensíveis
--
-- O que aconteceu: A política "Allow all users" permitia que QUALQUER pessoa com a
-- chave anon (que está no config.js do frontend) fizesse UPDATE em public.users.
-- Um usuário pode abrir o DevTools e executar:
--   window.varvosSupabase.from('users').update({ credits: 999950 }).eq('id', seuId)
--
-- Esta migração restringe: anon só pode SELECT (ler). UPDATE/INSERT/DELETE em users
-- só via service_role (APIs: deduct-credits, refund-credits, webhooks, admin).
--
-- Execute no Supabase: SQL Editor > New query

-- 1. Remover política permissiva
DROP POLICY IF EXISTS "Allow all users" ON public.users;

-- 2. Anon pode apenas LER (SELECT) - necessário para fallback de créditos no app
CREATE POLICY "Allow anon read users" ON public.users
  FOR SELECT TO anon
  USING (true);

-- 3. INSERT/UPDATE/DELETE em users: apenas service_role (APIs) e upsert_user_from_google (RPC)
--    O RPC upsert_user_from_google usa SECURITY DEFINER e bypassa RLS.
--    Sem política para anon em INSERT/UPDATE/DELETE = negado por padrão.

# Configuração de autenticação no Supabase

## Desativar confirmação de e-mail

Para evitar o erro **"Error sending confirmation email"** e permitir cadastro imediato sem confirmar e-mail:

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. No menu lateral: **Authentication** → **Providers**
4. Clique em **Email**
5. **Desmarque** a opção **"Confirm email"**
6. Clique em **Save**

Pronto. Novos usuários poderão criar conta e entrar imediatamente, sem precisar confirmar o e-mail.

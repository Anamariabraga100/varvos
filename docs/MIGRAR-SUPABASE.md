# Migrar para outra conta Supabase

Guia para trocar de projeto Supabase mantendo os dados.

## 1. Criar o novo projeto no Supabase

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Crie um novo projeto (ou use uma conta diferente)
3. Anote a **URL** e a **Service Role Key** em: Project Settings → API

## 2. Criar o schema no novo projeto

No **SQL Editor** do novo projeto, execute os arquivos **nesta ordem**:

1. `supabase-schema.sql` — tabelas base (users, payments, credit_logs)
2. `supabase-user-creations.sql` — histórico de criações
3. `supabase-migration-app-settings.sql` — configurações
4. `supabase-active-tasks-multi.sql` — tarefas ativas
5. `supabase-active-tasks-add-cost.sql` — coluna cost
6. `supabase-active-tasks-add-model.sql` — coluna model
7. `supabase-migration-aspect-ratio.sql` — aspect_ratio em user_creations
8. `supabase-auth-email.sql` — funções de auth (se usar login por e-mail)

## 3. Configurar Auth no novo projeto

- **Google**: Authentication → Providers → Google → configure Client ID e Secret
- **E-mail**: Authentication → Providers → Email → desmarque "Confirm email" (se não tiver SMTP)

## 4. Restaurar o backup

Adicione no `.env.local` as credenciais do **novo** projeto:

```env
SUPABASE_RESTORE_URL=https://seu-novo-projeto.supabase.co
SUPABASE_RESTORE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Execute o restore:

```bash
# Usa o backup mais recente
npm run restore-db

# Ou especifique a pasta do backup
node scripts/restore-supabase-json.js backups/backup-2026-03-09T05-01-39
```

## 5. Atualizar o projeto para usar o novo Supabase

No `.env` (ou variáveis do Vercel):

```env
SUPABASE_URL=https://seu-novo-projeto.supabase.co
SUPABASE_ANON_KEY=sua-nova-anon-key
```

Atualize também no **config.js** ou onde as credenciais forem usadas.

## Observações

- **Google Sign-In**: Usuários que fazem login com Google serão reconhecidos pelo `google_id`. Ao logar no novo projeto, o registro restaurado será atualizado.
- **Auth (auth.users)**: O backup restaura apenas `public.users` e tabelas de negócio. Os usuários precisarão fazer login novamente no novo projeto; o Supabase Auth criará novos registros em `auth.users`.
- **Webhooks**: Se usar Pagar.me ou outro gateway, atualize a URL do webhook para apontar para o novo domínio/API.

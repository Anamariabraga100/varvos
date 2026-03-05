# Verificação: PIX pago mas créditos não adicionados

## Como o fluxo funciona

1. **Checkout** → Cria pedido na Pagar.me com `metadata`: `user_id`, `plan_id`, `credits`, `customer.email`
2. **Usuário paga PIX** → Pagar.me confirma o pagamento
3. **Webhook** → Pagar.me envia `order.paid` para `/api/webhooks/pagarme`
4. **Webhook processa** → Busca usuário por `user_id` ou por `email` → Insere em `payments` → Adiciona créditos em `users`

## Onde pode ter falhado

| Causa | Como verificar |
|-------|----------------|
| **Webhook não configurado** | Pagar.me → Configurações → Webhooks → URL deve ser `https://seu-dominio.com/api/webhooks/pagarme` com evento `order.paid` |
| **Usuário não existe no Supabase** | Usuário fez checkout sem estar logado (ou logou só no localStorage) e não há linha em `users` com o email do pagamento |
| **user_id vazio no metadata** | Checkout envia `userId` do localStorage; se `varvos_user` não tem `id`, o metadata vai vazio |
| **Email não encontrado** | Email no checkout pode diferir do cadastrado (maiúsculas, espaços, domínio) |

---

## Passo a passo para verificar

### 1. Pegar o ID do pedido (order_id)

Se você tiver o ID do pedido na Pagar.me, use-o. Caso contrário:

- **Dashboard Pagar.me** → Transações / Pedidos → procure pelo valor (R$ 14,90) e data do pagamento
- Ou peça ao usuário o email usado no checkout para buscar

### 2. Conferir no Supabase

**A) O pagamento foi registrado?**

```sql
-- Substitua ORDER_ID pelo id do pedido (ex: or_xxxxxxxxxxxx)
SELECT * FROM payments 
WHERE gateway_id = 'ORDER_ID' AND status = 'completed';
```

- **Se retornar linha** → Webhook rodou. Os créditos foram para o `user_id` desse pagamento.
- **Se não retornar nada** → Webhook não processou (não recebeu ou deu `skipped`).

**B) O usuário existe?**

```sql
-- Substitua EMAIL pelo email do comprador
SELECT id, email, credits FROM users WHERE email = 'EMAIL';
```

- **Se não existir** → Esse era o problema: o webhook não encontra usuário e devolve `skipped: 'no user_id or email match'`.

**C) Log de créditos**

```sql
SELECT cl.*, p.metadata, p.gateway_id 
FROM credit_logs cl 
LEFT JOIN payments p ON p.id = cl.reference_id
WHERE cl.type = 'purchase'
ORDER BY cl.created_at DESC
LIMIT 20;
```

---

## Como corrigir manualmente

### Opção A: Usuário já existe no Supabase

1. Pegue o `user_id` (UUID) na tabela `users` pelo email do comprador.
2. No Supabase → SQL Editor:

```sql
-- Ajuste USER_ID e quantidade de créditos (ex: 200 para boas-vindas)
UPDATE users 
SET credits = COALESCE(credits, 0) + 200 
WHERE id = 'USER_ID';
```

3. (Opcional) Registrar no log:

```sql
INSERT INTO credit_logs (user_id, amount, type, reference_id)
VALUES ('USER_ID', 200, 'admin_adjustment', NULL);
```

### Opção B: Usuário não existe

1. Crie o usuário:

```sql
INSERT INTO users (email, name, credits)
VALUES ('email@do-comprador.com', 'Nome do Comprador', 200)
ON CONFLICT (email) DO UPDATE SET credits = COALESCE(users.credits, 0) + 200;
```

2. Pegue o `id` retornado e use na inserção em `credit_logs` se quiser logar.

### Opção C: Via script (por email)

```bash
# Credita diretamente no Supabase (não precisa do servidor)
# Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou variáveis de ambiente
EMAIL=comprador@email.com CREDITOS=200 node scripts/credit-manual.js
```

O script cria o usuário se não existir e adiciona os créditos.

### Opção D: Via script (simular webhook por user_id)

```bash
# Com servidor rodando (npx vercel dev)
USER_ID=uuid-do-usuario CREDITOS=200 node scripts/test-webhook-credits.js
```

Isso simula o webhook e adiciona os créditos para esse usuário.

---

## Prevenir no futuro

1. **Webhook** em `https://seu-dominio.com/api/webhooks/pagarme` com evento `order.paid`
2. **Usuário logado no checkout** → Garante `user_id` no metadata
3. **Cadastro real** → Quem usa “Continuar com e-mail” em auth.html precisa finalizar o cadastro no Supabase (ou o webhook precisa criar o usuário, conforme atualização)

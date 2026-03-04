# Integração Pagar.me — VARVOS

## Resumo

- **Planos avulsos**: Pix e Cartão de crédito
- **Planos mensais**: Apenas Cartão de crédito (assinatura)

## Configuração

### 1. Variáveis de ambiente (Vercel)

No projeto Vercel, em Settings → Environment Variables, adicione:

| Variável | Descrição |
|----------|-----------|
| `PAGAR_ME_SECRET_KEY` | Chave secreta (sk_test_ ou sk_live_) — Dashboard Pagar.me |
| `PAGAR_ME_PUBLIC_KEY` | Chave pública (pk_test_ ou pk_live_) — tokenização de cartão no frontend (obrigatória para cartão) |
| `PAGAR_ME_PLAN_START` | ID do plano Start (criar via `/api/create-plan` ou Dashboard) |
| `PAGAR_ME_PLAN_PRO` | ID do plano Pro |
| `PAGAR_ME_PLAN_AGENCY` | ID do plano Agency |
| `SUPABASE_URL` | Já existente |
| `SUPABASE_ANON_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` | Para webhook |

### 2. Criar planos de assinatura

Rode uma vez para cada plano mensal (start, pro, agency):

```bash
curl -X POST https://seu-dominio.vercel.app/api/create-plan \
  -H "Content-Type: application/json" \
  -d '{"planId":"start"}'
```

A resposta incluirá o `plan_id`. Adicione-o como `PAGAR_ME_PLAN_START` no Vercel.

Repita para `pro` e `agency`.

### 3. Domínio para tokenizecard (cartão)

O tokenizecard.js pode exigir domínio cadastrado. Se aparecer erro ou tempo esgotado ao pagar com cartão:
- **Dashboard Pagar.me**: Configurações da conta → procure "Domínios", "Chaves" ou "Segurança"
- Se houver opção de domínios: adicione `localhost`, `127.0.0.1` (dev) e `www.varvos.com`, `varvos.com` (produção)
- **Alternativa**: algumas contas Pagar.me não exigem cadastro; teste primeiro em produção

### 4. Webhook Pagar.me

No Dashboard Pagar.me → Configurações → Webhooks:

- **URL**: `https://seu-dominio.vercel.app/api/webhooks/pagarme`
- **Eventos**: `order.paid`, `subscription.invoice_paid` (ou `invoice.paid`)

### 5. config.js (desenvolvimento local) e build

Para pagamento com cartão, adicione `pagarMePublicKey` (chave pública do Dashboard Pagar.me):

```js
window.VARVOS_CONFIG = {
  // ... outras chaves
  pagarMePublicKey: 'pk_test_xxxx'  // Chave pública (pk_test_ ou pk_live_)
};
```

No Vercel, adicione `PAGAR_ME_PUBLIC_KEY` nas variáveis de ambiente para o build injetar em `config.js`.

## Como testar o webhook (créditos)

### Opção A: Teste real (Pix pago)

1. **Configurar webhook**: Dashboard Pagar.me → Webhooks → URL `https://seu-dominio.vercel.app/api/webhooks/pagarme` → evento `order.paid`
2. **Usuário logado**: O `user_id` vai no metadata; se não logado, o webhook tenta buscar por e-mail (pode não encontrar)
3. **Gerar Pix**: Acesse checkout com um plano (ex. `?plano=popular`), preencha dados e clique em "Gerar QR Code Pix"
4. **Pagar**: Use o app do banco para pagar o Pix
5. **Conferir**: Supabase → Table Editor → `payments`, `credit_logs`, `users.credits`

**Importante:** O usuário deve estar logado ao gerar o Pix, pois o `user_id` vai no metadata do pedido para o webhook creditar na conta certa.

### Opção B: Simular webhook (sem pagar)

Para testar localmente se os créditos chegam na conta, use o script que simula o webhook:

1. **Pegue seu `user_id`**: Supabase → Table Editor → `users` → coluna `id` (UUID)
2. **Com o servidor rodando** (`npx vercel dev`):

```bash
USER_ID=seu-uuid-aqui CREDITOS=60 node scripts/test-webhook-credits.js
```

3. **Conferir**: Supabase → `users.credits`, `payments`, `credit_logs`

O script envia um POST para `/api/webhooks/pagarme` com payload simulado. Não precisa configurar webhook no Pagar.me.

### Opção C: Teste em produção (deploy)

1. Deploy no Vercel
2. Configure webhook no Pagar.me apontando para `https://seu-dominio.vercel.app/api/webhooks/pagarme`
3. Faça um pagamento Pix real e confira no Supabase

## Fluxo

1. **Avulsos (Pix)**: Usuário escolhe Pix → API cria pedido → exibe QR/código → webhook confirma → créditos adicionados
2. **Avulsos (Cartão)**: Frontend usa tokenizecard.js (chave pública) → gera token curto → API cria pedido → webhook confirma
3. **Mensais**: Mesmo fluxo tokenizecard.js → API cria assinatura com plan_id → cobrança recorrente mensal

## Referências

- [Pagar.me API v5 — Criar pedido](https://docs.pagar.me/reference/criar-pedido-2)
- [Pagar.me API — Assinaturas](https://docs.pagar.me/reference/criar-assinatura-de-plano-1)

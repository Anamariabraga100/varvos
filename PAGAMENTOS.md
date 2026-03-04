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
| `PAGAR_ME_ENCRYPTION_KEY` | Chave de criptografia (ek_test_ ou ek_live_) — para tokenização de cartão no frontend |
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

### 3. Webhook Pagar.me

No Dashboard Pagar.me → Configurações → Webhooks:

- **URL**: `https://seu-dominio.vercel.app/api/webhooks/pagarme`
- **Eventos**: `order.paid`, `subscription.invoice_paid` (ou `invoice.paid`)

### 4. config.js (desenvolvimento local)

Adicione `pagarMeEncryptionKey` para pagamento com cartão:

```js
window.VARVOS_CONFIG = {
  // ... outras chaves
  pagarMeEncryptionKey: 'ek_test_xxxx'  // Chave de criptografia
};
```

## Como testar o webhook (créditos)

1. **Configurar**: Dashboard Pagar.me → Webhooks → URL `https://www.varvos.com/api/webhooks/pagarme` → evento `order.paid`
2. **Verificar URL**: Acesse `https://www.varvos.com/api/webhooks/pagarme` (GET) — deve retornar `{ ok: true }`
3. **Teste real**: Faça login, gere um Pix (ex. Starter R$ 14,90), pague no app do banco
4. **Conferir**: Supabase → Table Editor → `payments` (novo registro) e `users` (campo `credits` aumentou)

**Importante:** O usuário deve estar logado ao gerar o Pix, pois o `user_id` vai no metadata do pedido para o webhook creditar na conta certa.

## Fluxo

1. **Avulsos (Pix)**: Usuário escolhe Pix → API cria pedido → exibe QR/código → webhook confirma → créditos adicionados
2. **Avulsos (Cartão)**: Frontend tokeniza cartão com encryption key → API cria pedido com token → webhook confirma
3. **Mensais**: Frontend tokeniza cartão → API cria assinatura com plan_id → cobrança recorrente mensal

## Referências

- [Pagar.me API v5 — Criar pedido](https://docs.pagar.me/reference/criar-pedido-2)
- [Pagar.me API — Assinaturas](https://docs.pagar.me/reference/criar-assinatura-de-plano-1)

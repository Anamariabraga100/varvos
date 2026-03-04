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

O tokenizecard.js só funciona em domínios cadastrados. No Dashboard Pagar.me → Configurações → Chaves/Domínios, adicione:
- Desenvolvimento: `localhost`, `127.0.0.1`
- Produção: `www.varvos.com`, `varvos.com`

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

1. **Configurar**: Dashboard Pagar.me → Webhooks → URL `https://www.varvos.com/api/webhooks/pagarme` → evento `order.paid`
2. **Verificar URL**: Acesse `https://www.varvos.com/api/webhooks/pagarme` (GET) — deve retornar `{ ok: true }`
3. **Teste real**: Faça login, gere um Pix (ex. Starter R$ 14,90), pague no app do banco
4. **Conferir**: Supabase → Table Editor → `payments` (novo registro) e `users` (campo `credits` aumentou)

**Importante:** O usuário deve estar logado ao gerar o Pix, pois o `user_id` vai no metadata do pedido para o webhook creditar na conta certa.

## Fluxo

1. **Avulsos (Pix)**: Usuário escolhe Pix → API cria pedido → exibe QR/código → webhook confirma → créditos adicionados
2. **Avulsos (Cartão)**: Frontend usa tokenizecard.js (chave pública) → gera token curto → API cria pedido → webhook confirma
3. **Mensais**: Mesmo fluxo tokenizecard.js → API cria assinatura com plan_id → cobrança recorrente mensal

## Referências

- [Pagar.me API v5 — Criar pedido](https://docs.pagar.me/reference/criar-pedido-2)
- [Pagar.me API — Assinaturas](https://docs.pagar.me/reference/criar-assinatura-de-plano-1)

# Teste do plano Creator (R$ 9,90)

O plano Creator está temporariamente em **R$ 9,90** para você testar o fluxo de pagamento.

## Passo a passo para ativar o valor de teste

A assinatura usa planos cadastrados no Pagar.me. É preciso criar um plano de R$ 9,90 e apontar a variável de ambiente para ele.

### 1. Salve o plan_id atual (para reverter depois)

No Vercel → Settings → Environment Variables, anote o valor de **PAGAR_ME_PLAN_START**. Você vai precisar dele para voltar ao valor normal.

### 2. Crie o plano de teste no Pagar.me

Após fazer deploy com as alterações, chame a API:

```bash
curl -X POST https://www.varvos.com/api/create-plan \
  -H "Content-Type: application/json" \
  -d '{"planId":"start"}'
```

A resposta inclui algo como:

```json
{
  "plan_id": "plan_xxxxxxxxxxxx",
  "message": "Adicione PAGAR_ME_PLAN_START=plan_xxxxxxxxxxxx nas variáveis de ambiente do Vercel"
}
```

### 3. Atualize a variável no Vercel

- Vá em Vercel → Projeto → Settings → Environment Variables
- Edite **PAGAR_ME_PLAN_START** e cole o novo `plan_id` retornado
- Faça um novo deploy (ou aguarde o próximo) para as variáveis serem aplicadas

### 4. Teste o checkout

Acesse a página de planos e faça a assinatura do Creator. O valor cobrado será R$ 9,90.

---

## Reverter para o valor normal (R$ 59,90)

1. No Vercel, restaure **PAGAR_ME_PLAN_START** com o plan_id original que você anotou
2. Reverta as alterações nos arquivos:
   - `plans-config.js` → amount: 990 → 5990
   - `api/create-plan.js` → amount: 990 → 5990
   - `api/create-subscription.js` → amount: 990 → 5990
   - `precos.html` → R$ 9,90 → R$ 59,90, ≈ R$ 0,33 → ≈ R$ 2,00
   - `checkout.html` → R$ 9,90/mês → R$ 59,90/mês
   - `video/index.html` e `imitar-movimento/index.html` → mesmos valores
3. Faça commit e deploy

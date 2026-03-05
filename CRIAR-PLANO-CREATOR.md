# Criar plano Creator (R$ 59,90) no Pagar.me

O plano Creator está configurado para **R$ 59,90/mês** no código. Para cobrar esse valor, é preciso criar o plano no Pagar.me e configurar a variável de ambiente.

## Passo a passo

### 1. Garantir deploy atualizado

Faça deploy do projeto no Vercel (o código já está com R$ 59,90).

### 2. Criar o plano no Pagar.me

**Opção A — Script (recomendado):**

```bash
node scripts/create-creator-plan.js
```

Se o projeto estiver em outro domínio:

```bash
API_URL=https://seu-dominio.vercel.app node scripts/create-creator-plan.js
```

**Opção B — cURL:**

```bash
curl -X POST https://www.varvos.com/api/create-plan \
  -H "Content-Type: application/json" \
  -d '{"planId":"start"}'
```

### 3. Resposta esperada

```json
{
  "plan_id": "plan_xxxxxxxxxxxx",
  "message": "Adicione PAGAR_ME_PLAN_START=plan_xxxxxxxxxxxx nas variáveis de ambiente do Vercel"
}
```

### 4. Configurar no Vercel

- Acesse **Vercel** → seu projeto → **Settings** → **Environment Variables**
- Edite **PAGAR_ME_PLAN_START** e cole o `plan_id` retornado
- Se já existir um plano antigo (R$ 9,90), substitua pelo novo
- Salve e faça um **novo deploy** para aplicar as variáveis

### 5. Conferir

Acesse a página de planos e faça uma assinatura teste do Creator. O valor cobrado deve ser **R$ 59,90**.

---

## Observação

Se você já tinha um plano Creator de R$ 9,90, a Pagar.me pode não permitir alterar o valor. Nesse caso, crie um novo plano (passos acima) e atualize `PAGAR_ME_PLAN_START` com o novo ID.

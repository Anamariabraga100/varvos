# Configuração do Amazon SES para E-mails Transacionais

## Variáveis de ambiente (Vercel / .env.local)

Adicione no Vercel (Settings → Environment Variables) ou em `.env.local`:

```
AWS_ACCESS_KEY_ID=SEU_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SEU_SECRET_KEY
AWS_REGION=eu-north-1
EMAIL_FROM=no-reply@varvos.com
SITE_URL=https://www.varvos.com
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

**Remetentes preparados** (apenas @varvos.com): `no-reply@varvos.com`, `support@varvos.com`, `billing@varvos.com`

## Verificação do domínio no SES

1. Acesse o [Console AWS SES](https://console.aws.amazon.com/ses/)
2. Região: **eu-north-1** (Estocolmo)
3. **Verified identities** → Adicione `no-reply@varvos.com` ou o domínio `varvos.com`
4. Siga as instruções de verificação (DNS ou e-mail)

## E-mails implementados

| Evento | Assunto | API / Integração |
|--------|---------|------------------|
| Conta criada | Bem-vindo à VARVOS | `/api/send-welcome-email` (chamado após signup) |
| Redefinição de senha | Redefinir sua senha | `/api/request-password-reset` |
| PIX gerado | Seu pagamento foi gerado | `create-order.js` (quando PIX é criado) |
| Pagamento confirmado | Pagamento confirmado | `webhooks/pagarme.js` (order.paid e subscription.invoice_paid) |

## Uso programático

```javascript
import { sendEmail, EMAIL_SENDERS } from './services/emailService.js';

const result = await sendEmail({
  to: 'usuario@email.com',
  subject: 'Assunto',
  html: '<h1>Conteúdo HTML</h1>',
  text: 'Versão texto puro'
});

// Remetente alternativo (opcional)
await sendEmail({
  to: 'cliente@email.com',
  subject: 'Suporte',
  html: '<p>...</p>',
  from: EMAIL_SENDERS.SUPPORT  // support@varvos.com
});

if (result.success) {
  console.log('Enviado:', result.messageId);
} else {
  console.warn('Falha:', result.error);
}
```

O serviço **não quebra** o sistema se o SES falhar: erros são logados e a função retorna `{ success: false, error: '...' }`.

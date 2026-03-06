/**
 * Templates de e-mail transacional — HTML simples e reutilizáveis
 */

const BRAND = 'VARVOS';
const FOOTER = `
  <p style="margin-top:24px;font-size:12px;color:#888;">
    Este e-mail foi enviado por ${BRAND}. Se você não solicitou esta ação, ignore esta mensagem.
  </p>
`;

function wrapBody(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    ${content}
    ${FOOTER}
  </div>
</body>
</html>`;
}

/**
 * Boas-vindas ao criar conta
 */
export function welcomeEmail({ name = 'Usuário' }) {
  const displayName = name && name.trim() ? name.trim() : 'Usuário';
  const html = wrapBody(`
    <h1 style="margin:0 0 16px;font-size:24px;color:#333;">Bem-vindo à ${BRAND}!</h1>
    <p style="margin:0;line-height:1.6;color:#555;">
      Olá, ${displayName}!
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Sua conta foi criada com sucesso. Você já pode usar a plataforma para criar vídeos e imagens com inteligência artificial.
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Acesse o site e comece a criar agora mesmo.
    </p>
  `);
  const text = `Bem-vindo à ${BRAND}! Olá, ${displayName}! Sua conta foi criada com sucesso. Você já pode usar a plataforma para criar vídeos e imagens com IA.`;
  return { subject: 'Bem-vindo à VARVOS', html, text };
}

/**
 * Redefinição de senha — link seguro
 */
export function passwordResetEmail({ resetLink }) {
  const html = wrapBody(`
    <h1 style="margin:0 0 16px;font-size:24px;color:#333;">Redefinir sua senha</h1>
    <p style="margin:0;line-height:1.6;color:#555;">
      Você solicitou a redefinição da senha da sua conta ${BRAND}.
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Clique no link abaixo para definir uma nova senha:
    </p>
    <p style="margin:20px 0 0;">
      <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#ff6b4a,#9b59b6);color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Redefinir senha</a>
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#888;">
      Ou copie e cole no navegador: ${resetLink}
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#888;">
      Este link expira em 1 hora.
    </p>
  `);
  const text = `Redefinir sua senha: ${resetLink}`;
  return { subject: 'Redefinir sua senha', html, text };
}

/**
 * Pagamento gerado (PIX) — instruções
 */
export function paymentGeneratedEmail({ name, amount, credits, pixCode, pixQrUrl }) {
  const displayName = name && name.trim() ? name.trim() : 'Cliente';
  const amountFormatted = typeof amount === 'number' ? `R$ ${amount.toFixed(2).replace('.', ',')}` : amount;
  const html = wrapBody(`
    <h1 style="margin:0 0 16px;font-size:24px;color:#333;">Seu pagamento foi gerado</h1>
    <p style="margin:0;line-height:1.6;color:#555;">
      Olá, ${displayName}!
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Sua cobrança de <strong>${amountFormatted}</strong> foi gerada. Você receberá <strong>${credits || '—'} créditos</strong> após a confirmação do pagamento.
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      <strong>Como pagar com PIX:</strong>
    </p>
    <ol style="margin:8px 0 0;padding-left:20px;color:#555;line-height:1.8;">
      <li>Abra o app do seu banco</li>
      <li>Escolha pagar via PIX (copia e cola ou QR Code)</li>
      <li>Cole o código abaixo ou escaneie o QR Code</li>
      <li>Confirme o pagamento</li>
    </ol>
    ${pixCode ? `
    <p style="margin:20px 0 0;font-size:12px;color:#666;word-break:break-all;">Código PIX: ${pixCode}</p>
    ` : ''}
    ${pixQrUrl ? `<p style="margin:16px 0 0;"><img src="${pixQrUrl}" alt="QR Code PIX" style="max-width:200px;height:auto;"></p>` : ''}
    <p style="margin:16px 0 0;font-size:13px;color:#888;">
      O PIX expira em 30 minutos. Após o pagamento, seus créditos serão liberados automaticamente.
    </p>
  `);
  const text = `Seu pagamento de ${amountFormatted} foi gerado. ${credits} créditos serão liberados após confirmação. Código PIX: ${pixCode || '—'}`;
  return { subject: 'Seu pagamento foi gerado', html, text };
}

/**
 * Pagamento confirmado — créditos/plano ativado
 */
export function paymentConfirmedEmail({ name, amount, credits, planName, isSubscription = false }) {
  const displayName = name && name.trim() ? name.trim() : 'Cliente';
  const amountFormatted = typeof amount === 'number' ? `R$ ${amount.toFixed(2).replace('.', ',')}` : amount;
  const whatWasAdded = isSubscription
    ? `Seu plano <strong>${planName || 'mensal'}</strong> foi ativado e <strong>${credits || '—'} créditos</strong> foram adicionados à sua conta.`
    : `<strong>${credits || '—'} créditos</strong> foram adicionados à sua conta.`;
  const html = wrapBody(`
    <h1 style="margin:0 0 16px;font-size:24px;color:#333;">Pagamento confirmado</h1>
    <p style="margin:0;line-height:1.6;color:#555;">
      Olá, ${displayName}!
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Seu pagamento de <strong>${amountFormatted}</strong> foi confirmado com sucesso.
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      ${whatWasAdded}
    </p>
    <p style="margin:16px 0 0;line-height:1.6;color:#555;">
      Você já pode usar a plataforma para criar vídeos e imagens com IA.
    </p>
  `);
  const text = `Pagamento de ${amountFormatted} confirmado. ${credits} créditos adicionados.`;
  return { subject: 'Pagamento confirmado', html, text };
}

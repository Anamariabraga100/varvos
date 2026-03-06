/**
 * API: Enviar e-mail de boas-vindas
 * POST /api/send-welcome-email
 * Body: { email, name? }
 */
import { sendEmail } from '../services/emailService.js';
import { welcomeEmail } from '../templates/emailTemplates.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email, name } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email é obrigatório' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const { subject, html, text } = welcomeEmail({ name: name || 'Usuário' });

  const result = await sendEmail({
    to: trimmedEmail,
    subject,
    html,
    text,
  });

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Falha ao enviar e-mail' });
  }

  return res.status(200).json({ ok: true, messageId: result.messageId });
}

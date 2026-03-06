/**
 * API: Solicitar redefinição de senha
 * POST /api/request-password-reset
 * Body: { email }
 * Gera link de recuperação via Supabase Admin e envia por e-mail via SES
 */
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../services/emailService.js';
import { passwordResetEmail } from '../templates/emailTemplates.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email é obrigatório' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const baseUrl = (process.env.SITE_URL || '').trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}` : 'https://www.varvos.com');
  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth.html#recovery`;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: trimmedEmail,
      options: { redirectTo },
    });

    if (error) {
      console.error('[request-password-reset] Supabase generateLink:', error.message);
      return res.status(400).json({ error: error.message || 'Não foi possível gerar o link' });
    }

    const resetLink = data?.properties?.action_link || data?.action_link;
    if (!resetLink) {
      console.error('[request-password-reset] Nenhum action_link retornado');
      return res.status(500).json({ error: 'Erro ao gerar link de recuperação' });
    }

    const { subject, html, text } = passwordResetEmail({ resetLink });

    const result = await sendEmail({
      to: trimmedEmail,
      subject,
      html,
      text,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Falha ao enviar e-mail' });
    }

    return res.status(200).json({ ok: true, message: 'E-mail enviado. Verifique sua caixa de entrada.' });
  } catch (err) {
    console.error('[request-password-reset]', err);
    return res.status(500).json({ error: 'Erro interno ao processar solicitação' });
  }
}

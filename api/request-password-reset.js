/**
 * API: Solicitar redefinição de senha OU verificar se e-mail existe
 * POST /api/request-password-reset
 * Body: { email, mode?: 'check' | 'reset' }
 * mode=check: retorna { exists: boolean } (não envia e-mail)
 * mode=reset ou omitido: envia link de recuperação
 */
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../services/emailService.js';
import { passwordResetEmail } from '../templates/emailTemplates.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email, mode } = req.body || {};
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (mode === 'check') {
    try {
      const { data: exists, error } = await supabase.rpc('check_email_registered', { p_email: trimmedEmail });
      if (error) {
        console.error('[request-password-reset] check_email:', error.message);
        return res.status(500).json({ error: 'Não foi possível verificar o e-mail' });
      }
      return res.status(200).json({ exists: !!exists });
    } catch (err) {
      console.error('[request-password-reset] check:', err);
      return res.status(500).json({ error: 'Erro ao verificar e-mail' });
    }
  }

  const baseUrl = (process.env.SITE_URL || '').trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}` : 'https://www.varvos.com');
  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth.html#recovery`;

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

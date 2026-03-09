/**
 * API: Verificar se e-mail já está cadastrado (auth.users)
 * POST /api/check-email
 * Body: { email }
 * Usa service_role para evitar dependência da chave anon no client.
 */
import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: exists, error } = await supabase.rpc('check_email_registered', {
      p_email: trimmedEmail,
    });

    if (error) {
      console.error('[check-email] RPC error:', error.message);
      return res.status(500).json({ error: 'Não foi possível verificar o e-mail' });
    }

    return res.status(200).json({ exists: !!exists });
  } catch (err) {
    console.error('[check-email]', err);
    return res.status(500).json({ error: 'Erro ao verificar e-mail' });
  }
}

/**
 * API: Editar créditos de usuário (admin)
 * POST /api/admin/edit-credits
 * Header: Authorization: Bearer <token>
 * Body: { userId: string, credits: number }
 */
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!requireAdmin(req, res)) return;

  const { userId, credits } = req.body || {};
  const val = parseInt(credits, 10);
  if (!userId || isNaN(val) || val < 0) {
    return res.status(400).json({ error: 'userId e credits (≥ 0) obrigatórios' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: userRow, error: fetchErr } = await supabase.from('users').select('credits').eq('id', userId).single();
    if (fetchErr || !userRow) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const oldCredits = userRow?.credits ?? 0;
    const diff = val - oldCredits;

    const { error: updateErr } = await supabase.from('users').update({ credits: val }).eq('id', userId);
    if (updateErr) {
      return res.status(500).json({ error: updateErr.message || 'Erro ao atualizar' });
    }

    if (diff !== 0) {
      await supabase.from('credit_logs').insert({
        user_id: userId,
        amount: diff,
        type: 'admin_adjustment',
        reference_id: null
      });
    }

    return res.status(200).json({ ok: true, credits: val });
  } catch (err) {
    console.error('Admin edit-credits:', err);
    return res.status(500).json({ error: err?.message || 'Erro ao atualizar' });
  }
}

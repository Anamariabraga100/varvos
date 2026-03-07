/**
 * API: Debitar créditos ao iniciar uma geração de vídeo
 * POST /api/deduct-credits
 * Body: { userId?, email?, amount, taskId }
 * Identifica o usuário por userId ou email. Reduz credits e registra em credit_logs (amount negativo = uso).
 */
import { createClient } from '@supabase/supabase-js';

function isValidAmount(n) {
  if (n === 50) return true;   // vídeo
  if (n === 100) return true;   // vídeo 4K
  if ([15, 30, 45, 60].includes(n)) return true;  // grok image-to-video
  if (n >= 8 && n <= 1200 && Number.isInteger(n)) return true;  // motion
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { userId, email, amount, taskId } = req.body || {};
  const amountNum = parseInt(amount, 10);

  if ((!userId && !email) || isNaN(amountNum) || !isValidAmount(amountNum)) {
    return res.status(400).json({
      error: 'Informe userId ou email e amount válido (vídeo: 50 ou 100 | motion: 8–1200).',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração Supabase incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let userRow;
  if (userId) {
    const { data, error } = await supabase
      .from('users')
      .select('id, credits')
      .eq('id', userId)
      .single();
    if (error || !data) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    userRow = data;
  } else {
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm) {
      return res.status(400).json({ error: 'Email é obrigatório quando userId não é informado.' });
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, credits')
      .eq('email', emailNorm)
      .single();
    if (error || !data) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    userRow = data;
  }

  const currentCredits = userRow.credits ?? 0;
  const newCredits = currentCredits - amountNum;

  if (newCredits < 0) {
    return res.status(402).json({
      error: 'Créditos insuficientes',
      credits: currentCredits,
    });
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ credits: newCredits })
    .eq('id', userRow.id);

  if (updateErr) {
    console.error('[deduct-credits] update:', updateErr);
    return res.status(500).json({ error: 'Erro ao debitar créditos' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(taskId));
  await supabase.from('credit_logs').insert({
    user_id: userRow.id,
    amount: -amountNum,
    type: 'usage',
    reference_id: isUuid ? taskId : null,
  });

  return res.status(200).json({
    ok: true,
    credits: newCredits,
    userId: userRow.id,
  });
}

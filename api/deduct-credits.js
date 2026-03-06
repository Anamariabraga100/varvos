/**
 * API: Deduzir créditos ao iniciar geração (vídeo ou imitar movimento)
 * POST /api/deduct-credits
 * Body: { userId?, email?, amount, taskId } — userId ou email obrigatório
 */
import { createClient } from '@supabase/supabase-js';

function isValidAmount(n) {
  if (n === 50) return true;   // vídeo 720p/1080p
  if (n === 100) return true;  // vídeo veo3.1-fast 4K (dobro)
  // motion: 720p=8/seg, 1080p=11/seg — aceita 8–1200 (até ~100s)
  if (n >= 8 && n <= 1200 && Number.isInteger(n)) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { userId, email, amount, taskId } = req.body || {};
  const amountNum = parseInt(amount, 10);
  const userEmail = (email || '').trim().toLowerCase();

  if ((!userId && !userEmail) || !taskId || isNaN(amountNum) || !isValidAmount(amountNum)) {
    return res.status(400).json({
      error: 'userId ou email, taskId e amount válidos são obrigatórios (vídeo: 50 ou 100 | motion: 8–1200)',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let userRow;
  if (userId) {
    const { data, error } = await supabase.from('users').select('id, credits').eq('id', userId).single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    userRow = data;
  } else {
    const { data, error } = await supabase.from('users').select('id, credits').eq('email', userEmail).single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    userRow = data;
  }
  const resolvedUserId = userRow.id;

  const currentCredits = userRow.credits ?? 0;
  if (currentCredits < amountNum) {
    return res.status(400).json({
      error: 'Créditos insuficientes',
      credits: currentCredits,
    });
  }

  const newCredits = currentCredits - amountNum;

  const { error: updateErr } = await supabase
    .from('users')
    .update({ credits: newCredits })
    .eq('id', resolvedUserId);

  if (updateErr) {
    console.error('deduct-credits update:', updateErr);
    return res.status(500).json({ error: 'Erro ao deduzir créditos' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(taskId));
  await supabase.from('credit_logs').insert({
    user_id: resolvedUserId,
    amount: -amountNum,
    type: 'usage',
    reference_id: isUuid ? taskId : null,
  });

  return res.status(200).json({
    ok: true,
    credits: newCredits,
    userId: resolvedUserId,
  });
}

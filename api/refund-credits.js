/**
 * API: Estornar créditos quando a geração falha
 * POST /api/refund-credits
 * Body: { userId, amount, taskId }
 * Vídeo: 50 créditos | Imitar movimento: 8 créditos/segundo (8–400, múltiplo de 8)
 */
import { createClient } from '@supabase/supabase-js';

function isValidAmount(n) {
  if (n === 50) return true;  // vídeo
  if (n === 100) return true;  // vídeo 4K
  // motion: 720p=8/seg, 1080p=11/seg — aceita 8–1200
  if (n >= 8 && n <= 1200 && Number.isInteger(n)) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { userId, amount, taskId } = req.body || {};
  const amountNum = parseInt(amount, 10);

  if (!userId || !taskId || isNaN(amountNum) || !isValidAmount(amountNum)) {
    return res.status(400).json({
      error: 'userId, taskId e amount válidos são obrigatórios (vídeo: 50 ou 100 | motion: 8–1200)',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: userRow, error: fetchErr } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();

  if (fetchErr || !userRow) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const currentCredits = userRow.credits ?? 0;
  const newCredits = currentCredits + amountNum;

  const { error: updateErr } = await supabase
    .from('users')
    .update({ credits: newCredits })
    .eq('id', userId);

  if (updateErr) {
    console.error('refund-credits update:', updateErr);
    return res.status(500).json({ error: 'Erro ao estornar créditos' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(taskId));
  await supabase.from('credit_logs').insert({
    user_id: userId,
    amount: amountNum,
    type: 'refund',
    reference_id: isUuid ? taskId : null,
  });

  return res.status(200).json({
    ok: true,
    credits: newCredits,
  });
}

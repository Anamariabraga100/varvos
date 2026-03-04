/**
 * API: Deduzir créditos ao iniciar geração (vídeo ou imitar movimento)
 * POST /api/deduct-credits
 * Body: { userId, amount, taskId }
 * Vídeo: 50 créditos | Imitar movimento: 720p 8 créd/seg | 1080p 11 créd/seg
 */
import { createClient } from '@supabase/supabase-js';

function isValidAmount(n) {
  if (n === 50) return true;  // vídeo
  if (n >= 8 && n <= 800 && n % 8 === 0) return true;   // motion 720p
  if (n >= 11 && n <= 1100 && n % 11 === 0) return true;  // motion 1080p
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
      error: 'userId, taskId e amount válidos são obrigatórios (vídeo: 50 | motion 720p: 8–800 múltiplo de 8 | motion 1080p: 11–1100 múltiplo de 11)',
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
    .eq('id', userId);

  if (updateErr) {
    console.error('deduct-credits update:', updateErr);
    return res.status(500).json({ error: 'Erro ao deduzir créditos' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(taskId));
  await supabase.from('credit_logs').insert({
    user_id: userId,
    amount: -amountNum,
    type: 'usage',
    reference_id: isUuid ? taskId : null,
  });

  return res.status(200).json({
    ok: true,
    credits: newCredits,
  });
}

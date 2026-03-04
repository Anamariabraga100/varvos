/**
 * API: Consultar créditos do usuário diretamente do banco
 * GET /api/get-credits?userId=xxx
 * Retorna { credits: number } do Supabase
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const userId = req.query?.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const credits = data.credits != null ? parseInt(data.credits, 10) : 0;
  return res.status(200).json({
    credits: Number.isFinite(credits) ? credits : 0,
  });
}

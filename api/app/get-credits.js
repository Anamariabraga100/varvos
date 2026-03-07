/**
 * API: Retornar créditos e plano do usuário (para o header da app)
 * GET /api/app/get-credits?userId=xxx ou ?email=xxx
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const userId = req.query?.userId;
  const email = (req.query?.email || '').trim().toLowerCase();

  if (!userId && !email) {
    return res.status(400).json({ error: 'Informe userId ou email na query.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let user;
  if (userId) {
    const { data, error } = await supabase
      .from('users')
      .select('id, credits, plan')
      .eq('id', userId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    user = data;
  } else {
    const { data, error } = await supabase
      .from('users')
      .select('id, credits, plan')
      .eq('email', email)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    user = data;
  }

  return res.status(200).json({
    credits: user.credits ?? 0,
    plan: user.plan ?? null,
    next_billing_date: null,
  });
}

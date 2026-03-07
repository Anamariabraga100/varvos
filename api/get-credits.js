/**
 * API: Consultar créditos e plano do usuário
 * GET /api/get-credits?userId=xxx
 * Retorna { credits: number, plan?: string }
 * Se users.plan está vazio, infere de pagamentos de assinatura e faz lazy backfill.
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const userId = req.query?.userId;
  const userEmail = (req.query?.email || '').trim().toLowerCase();
  if (!userId && !userEmail) {
    return res.status(400).json({ error: 'userId ou email é obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let userData;
  if (userId) {
    const { data, error } = await supabase.from('users').select('id, credits, plan').eq('id', userId).single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    userData = data;
  } else {
    const { data, error } = await supabase.from('users').select('id, credits, plan').eq('email', userEmail).single();
    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });
    userData = data;
  }
  const resolvedUserId = userData.id;

  let plan = userData.plan && String(userData.plan).trim() ? String(userData.plan).trim() : null;

  // Contas antigas: se users.plan está vazio, tenta inferir do histórico de pagamentos (assinatura)
  if (!plan) {
    const { data: lastSubPayment } = await supabase
      .from('payments')
      .select('metadata')
      .eq('user_id', resolvedUserId)
      .eq('status', 'completed')
      .contains('metadata', { type: 'assinatura' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const planId = lastSubPayment?.metadata?.plan_id;
    if (planId && String(planId).trim()) {
      plan = String(planId).trim();
      // Lazy backfill: atualiza users.plan para não precisar buscar em payments de novo
      await supabase.from('users').update({ plan }).eq('id', resolvedUserId);
    }
  }

  const credits = userData.credits != null ? parseInt(userData.credits, 10) : 0;

  // Próxima cobrança: data do último pagamento de assinatura + 1 mês
  let nextBillingDate = null;
  if (plan) {
    const { data: lastSubPayment } = await supabase
      .from('payments')
      .select('created_at')
      .eq('user_id', resolvedUserId)
      .eq('status', 'completed')
      .contains('metadata', { type: 'assinatura' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastSubPayment?.created_at) {
      const d = new Date(lastSubPayment.created_at);
      d.setMonth(d.getMonth() + 1);
      nextBillingDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
  }

  return res.status(200).json({
    credits: Number.isFinite(credits) ? credits : 0,
    plan,
    next_billing_date: nextBillingDate,
  });
}

/**
 * API App unificada — créditos, pedidos, dedução e estorno
 * GET /api/app/get-credits?userId=xxx | ?email=xxx
 * GET /api/app/order-status?orderId=xxx
 * POST /api/app/deduct-credits
 * POST /api/app/refund-credits
 */
import { createClient } from '@supabase/supabase-js';

function getRoute(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug) && slug.length > 0) return slug[0];
  if (req.url) {
    const match = String(req.url).match(/\/api\/app\/?([^/?]*)/);
    return match ? match[1] : '';
  }
  return '';
}

function isValidAmount(n) {
  if (n === 50) return true;
  if (n === 100) return true;
  if ([15, 30, 45, 60].includes(n)) return true;
  if (n >= 8 && n <= 1200 && Number.isInteger(n)) return true;
  return false;
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (route === 'get-credits') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    const userId = req.query?.userId;
    const userEmail = (req.query?.email || '').trim().toLowerCase();
    if (!userId && !userEmail) return res.status(400).json({ error: 'userId ou email é obrigatório' });

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
        await supabase.from('users').update({ plan }).eq('id', resolvedUserId);
      }
    }

    const credits = userData.credits != null ? parseInt(userData.credits, 10) : 0;
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
        nextBillingDate = d.toISOString().slice(0, 10);
      }
    }

    return res.status(200).json({
      credits: Number.isFinite(credits) ? credits : 0,
      plan,
      next_billing_date: nextBillingDate,
    });
  }

  if (route === 'order-status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    const orderId = req.query?.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });

    const { data: payment } = await supabase
      .from('payments')
      .select('id, metadata')
      .eq('gateway_id', orderId)
      .eq('status', 'completed')
      .single();

    if (payment) {
      const credits = payment.metadata?.credits ? parseInt(payment.metadata.credits, 10) : undefined;
      return res.status(200).json({ paid: true, credits });
    }
    return res.status(200).json({ paid: false });
  }

  if (route === 'deduct-credits') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const { userId, email, amount, taskId } = req.body || {};
    const amountNum = parseInt(amount, 10);
    const userEmail = (email || '').trim().toLowerCase();

    if ((!userId && !userEmail) || !taskId || isNaN(amountNum) || !isValidAmount(amountNum)) {
      return res.status(400).json({
        error: 'userId ou email, taskId e amount válidos são obrigatórios (vídeo: 50 ou 100 | grok: 15–60 | motion: 8–1200)',
      });
    }

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
      return res.status(400).json({ error: 'Créditos insuficientes', credits: currentCredits });
    }

    const newCredits = currentCredits - amountNum;
    const { error: updateErr } = await supabase.from('users').update({ credits: newCredits }).eq('id', resolvedUserId);
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

    return res.status(200).json({ ok: true, credits: newCredits, userId: resolvedUserId });
  }

  if (route === 'refund-credits') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    const { userId, amount, taskId } = req.body || {};
    const amountNum = parseInt(amount, 10);

    if (!userId || !taskId || isNaN(amountNum) || !isValidAmount(amountNum)) {
      return res.status(400).json({
        error: 'userId, taskId e amount válidos são obrigatórios (vídeo: 50 ou 100 | motion: 8–1200)',
      });
    }

    const { data: userRow, error: fetchErr } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    if (fetchErr || !userRow) return res.status(404).json({ error: 'Usuário não encontrado' });

    const currentCredits = userRow.credits ?? 0;
    const newCredits = currentCredits + amountNum;

    const { error: updateErr } = await supabase.from('users').update({ credits: newCredits }).eq('id', userId);
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

    return res.status(200).json({ ok: true, credits: newCredits });
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}

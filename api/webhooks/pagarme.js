/**
 * Webhook Pagar.me: processa order.paid e subscription/invoice.paid
 * Configurar em: Dashboard Pagar.me → Configurações → Webhooks
 * URL: https://seu-dominio.vercel.app/api/webhooks/pagarme
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Webhook: Supabase não configurado');
    return res.status(500).json({ error: 'Configuração incompleta' });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  const { type, data } = payload;

  // order.paid — pedido avulso (Pix ou Cartão) pago
  if (type === 'order.paid') {
    const orderId = data?.id;
    const metadata = data?.metadata || {};
    const userId = metadata.user_id;
    const planId = metadata.plan_id;
    const credits = parseInt(metadata.credits, 10) || 0;
    const amount = (data?.amount || 0) / 100;

    if (!orderId || !credits) {
      return res.status(200).json({ received: true, skipped: 'no credits in metadata' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('gateway_id', orderId)
      .eq('status', 'completed')
      .single();

    if (existing) {
      return res.status(200).json({ received: true, duplicated: true });
    }

    let targetUserId = userId;
    if (!targetUserId && data?.customer?.email) {
      const { data: userByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.customer.email)
        .single();
      targetUserId = userByEmail?.id;
    }

    if (!targetUserId) {
      return res.status(200).json({ received: true, skipped: 'no user_id or email match' });
    }

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id: targetUserId,
        amount,
        status: 'completed',
        gateway: 'pagar_me',
        gateway_id: orderId,
        metadata: { plan_id: planId, type: 'avulso', ...metadata },
      })
      .select('id')
      .single();

    if (payErr) {
      console.error('Webhook payments insert:', payErr);
      return res.status(500).json({ error: 'Erro ao salvar pagamento' });
    }

    const { error: logErr } = await supabase.from('credit_logs').insert({
      user_id: targetUserId,
      amount: credits,
      type: 'purchase',
      reference_id: payment.id,
    });
    if (logErr) console.error('credit_logs insert:', logErr);

    const { data: userRow } = await supabase.from('users').select('credits').eq('id', targetUserId).single();
    const newCredits = (userRow?.credits || 0) + credits;
    await supabase.from('users').update({ credits: newCredits }).eq('id', targetUserId);

    return res.status(200).json({ received: true });
  }

  // subscription.invoice_paid ou order.paid de assinatura — renovação mensal
  if (type === 'subscription.invoice_paid' || type === 'invoice.paid') {
    const invoice = data?.invoice || data;
    const subscription = data?.subscription || data?.subscription_id;
    const metadata = (invoice?.metadata || data?.metadata || {});
    const userId = metadata.user_id;
    const credits = parseInt(metadata.credits, 10) || 0;
    const gatewayId = invoice?.id || subscription?.id || data?.id;

    if (!gatewayId || !credits) {
      return res.status(200).json({ received: true, skipped: 'subscription credits' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('gateway_id', gatewayId)
      .eq('status', 'completed')
      .single();

    if (existing) {
      return res.status(200).json({ received: true, duplicated: true });
    }

    let targetUserId = userId;
    if (!targetUserId && (invoice?.customer?.email || data?.customer?.email)) {
      const email = invoice?.customer?.email || data?.customer?.email;
      const { data: userByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();
      targetUserId = userByEmail?.id;
    }

    if (!targetUserId) {
      return res.status(200).json({ received: true, skipped: 'no user for subscription' });
    }

    const amount = (invoice?.amount || data?.amount || 0) / 100;

    const { data: payInsert } = await supabase.from('payments').insert({
      user_id: targetUserId,
      amount,
      status: 'completed',
      gateway: 'pagar_me',
      gateway_id: gatewayId,
      metadata: { type: 'assinatura', subscription_id: subscription, ...metadata },
    }).select('id').single();

    await supabase.from('credit_logs').insert({
      user_id: targetUserId,
      amount: credits,
      type: 'purchase',
      reference_id: payInsert?.id,
    });

    const { data: u } = await supabase.from('users').select('credits').eq('id', targetUserId).single();
    await supabase.from('users').update({ credits: (u?.credits || 0) + credits }).eq('id', targetUserId);

    return res.status(200).json({ received: true });
  }

  return res.status(200).json({ received: true, unhandled: type });
}

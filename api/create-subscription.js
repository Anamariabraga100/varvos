/**
 * API: Criar assinatura mensal (apenas Cartão de crédito)
 * POST /api/create-subscription
 * Body: { planId, customer, card }
 */
import { createClient } from '@supabase/supabase-js';

const PLANS = {
  start: { amount: 5990, credits: 1500, name: 'Creator' },  // R$ 59,90/mês
  pro: { amount: 14990, credits: 4000, name: 'Pro' },
  agency: { amount: 44900, credits: 15000, name: 'Agency' },
};

const PLAN_IDS = {
  start: process.env.PAGAR_ME_PLAN_START,
  pro: process.env.PAGAR_ME_PLAN_PRO,
  agency: process.env.PAGAR_ME_PLAN_AGENCY,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const secretKey = process.env.PAGAR_ME_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Pagar.me não configurado (PAGAR_ME_SECRET_KEY)' });
  }

  const { planId, userId, customer, card, cardToken } = req.body;

  const plan = PLANS[planId];
  const planIdPagar = PLAN_IDS[planId];

  if (!plan || !planIdPagar) {
    return res.status(400).json({
      error: 'Plano inválido ou não configurado. Configure PAGAR_ME_PLAN_START, PAGAR_ME_PLAN_PRO e PAGAR_ME_PLAN_AGENCY no Vercel.',
    });
  }

  if (!customer) {
    return res.status(400).json({ error: 'customer é obrigatório' });
  }

  const { name, email } = customer;
  if (!name || !email) {
    return res.status(400).json({ error: 'customer.name e customer.email obrigatórios' });
  }

  if (!cardToken && !card) {
    return res.status(400).json({ error: 'cardToken ou card obrigatório' });
  }

  const subCode = `varvos_${planId}_${Date.now()}`;

  const billingAddr = card?.billing_address || {
    line_1: 'Av Paulista, 1000',
    zip_code: '01310100',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
  };

  const subscriptionPayload = {
    plan_id: planIdPagar,
    payment_method: 'credit_card',
    customer: {
      name: name.substring(0, 64),
      email: email.substring(0, 64),
      type: 'individual',
      address: billingAddr,
      phones: {
        mobile_phone: {
          country_code: '55',
          area_code: '11',
          number: '999999999',
        },
      },
    },
    installments: 1,
    code: subCode,
    metadata: {
      user_id: userId || '',
      plan_id: planId,
      credits: String(plan.credits),
      type: 'assinatura',
    },
  };

  if (cardToken) {
    // Pagar.me Subscriptions API: card_token at root; card only billing_address (like Medium article / Orders pattern)
    subscriptionPayload.card_token = cardToken;
    subscriptionPayload.card = {
      billing_address: billingAddr,
    };
  } else {
    const { holder_name, number, exp_month, exp_year, cvv } = card;
    if (!holder_name || !number || !exp_month || !exp_year) {
      return res.status(400).json({ error: 'card: holder_name, number, exp_month, exp_year obrigatórios' });
    }
    subscriptionPayload.card = {
      holder_name,
      number: String(number).replace(/\D/g, ''),
      exp_month: parseInt(exp_month, 10),
      exp_year: parseInt(exp_year, 10),
      cvv: cvv || undefined,
      billing_address: billingAddr,
    };
  }

  try {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch('https://api.pagar.me/core/v5/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(subscriptionPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errDetails = data.errors ? (typeof data.errors === 'object' ? JSON.stringify(data.errors, null, 2) : String(data.errors)) : null;
      const errMsg = errDetails ? `${data.message || 'Erro ao criar assinatura'}\n\nDetalhes:\n${errDetails}` : (data.message || 'Erro ao criar assinatura');
      return res.status(response.status).json({
        error: errMsg,
        message: data.message,
        details: data.errors,
      });
    }

    // Persiste plano ativo no Supabase
    if (userId && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
        await supabase.from('users').update({ plan: planId }).eq('id', userId);
      } catch (e) {
        console.error('create-subscription: falha ao atualizar plan', e);
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('create-subscription error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar assinatura' });
  }
}

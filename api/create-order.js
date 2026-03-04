/**
 * API: Criar pedido avulso (Pix ou Cartão de crédito)
 * POST /api/create-order
 * Body: { planId, paymentMethod: 'pix'|'credit_card', customer, cardToken? }
 */
const PLANS = {
  starter: { amount: 1490, credits: 20, name: 'Starter' },
  popular: { amount: 3990, credits: 60, name: 'Popular' },
  'pro-avulso': { amount: 7990, credits: 135, name: 'Pro' },
  escala: { amount: 29700, credits: 600, name: 'Escala' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const secretKey = process.env.PAGAR_ME_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Pagar.me não configurado (PAGAR_ME_SECRET_KEY)' });
  }

  const { planId, paymentMethod, userId, customer, cardToken } = req.body;

  const plan = PLANS[planId];
  if (!plan || !paymentMethod || !customer) {
    return res.status(400).json({ error: 'planId, paymentMethod e customer são obrigatórios' });
  }

  if (paymentMethod !== 'pix' && paymentMethod !== 'credit_card') {
    return res.status(400).json({ error: 'paymentMethod deve ser pix ou credit_card' });
  }

  if (paymentMethod === 'credit_card' && !cardToken) {
    return res.status(400).json({ error: 'cardToken obrigatório para pagamento com cartão' });
  }

  const { name, email } = customer;
  if (!name || !email) {
    return res.status(400).json({ error: 'customer.name e customer.email obrigatórios' });
  }

  const orderCode = `varvos_${planId}_${Date.now()}`;

  const payments = [];
  if (paymentMethod === 'pix') {
    payments.push({
      payment_method: 'pix',
      pix: {
        expires_in: 1800,
      },
    });
  } else {
    payments.push({
      payment_method: 'credit_card',
      credit_card: {
        card_token_id: cardToken,
        installments: 1,
      },
    });
  }

  const orderPayload = {
    customer: {
      name: name.substring(0, 64),
      email: email.substring(0, 64),
      type: 'individual',
      address: {
        country: 'BR',
      },
      phones: {},
    },
    items: [
      {
        amount: plan.amount,
        description: `VARVOS ${plan.name} - ${plan.credits} créditos`,
        quantity: 1,
        code: planId,
      },
    ],
    payments,
    metadata: {
      user_id: userId || '',
      plan_id: planId,
      credits: String(plan.credits),
      type: 'avulso',
    },
    code: orderCode,
  };

  try {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch('https://api.pagar.me/core/v5/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Erro ao criar pedido',
        details: data.errors,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar pedido' });
  }
}

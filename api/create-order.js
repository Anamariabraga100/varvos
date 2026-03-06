/**
 * API: Criar pedido avulso (Pix ou Cartão de crédito)
 * POST /api/create-order
 * Body: { planId, paymentMethod: 'pix'|'credit_card', customer, cardToken? }
 */
const PLANS = {
  'boas-vindas': { amount: 1490, credits: 200, name: 'Oferta de boas-vindas' }, // 200 créditos
  starter: { amount: 1490, credits: 200, name: 'Starter' },
  popular: { amount: 3990, credits: 650, name: 'Popular' },
  'pro-avulso': { amount: 7990, credits: 1500, name: 'Pro' },
  escala: { amount: 29700, credits: 6100, name: 'Escala' },
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

  const { name, email, document } = customer;
  if (!name || !email) {
    return res.status(400).json({ error: 'customer.name e customer.email obrigatórios' });
  }
  const docClean = document ? String(document).replace(/\D/g, '') : '';
  if (paymentMethod === 'pix' && (!docClean || docClean.length !== 11)) {
    return res.status(400).json({ error: 'CPF obrigatório para pagamento com Pix' });
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
    const billingAddr = {
      line_1: customer.address?.line_1 || 'Av. Paulista, 1000',
      zip_code: (customer.address?.zip_code || '01310100').replace(/\D/g, '').slice(0, 8) || '01310100',
      city: customer.address?.city || 'São Paulo',
      state: customer.address?.state || 'SP',
      country: 'BR',
    };
    payments.push({
      payment_method: 'credit_card',
      credit_card: {
        card_token: cardToken,
        installments: 1,
        card: {
          billing_address: billingAddr,
        },
      },
    });
  }

  const orderPayload = {
    customer: {
      name: name.substring(0, 64),
      email: email.substring(0, 64),
      type: 'individual',
      document: docClean || undefined,
      document_type: docClean ? 'CPF' : undefined,
      address: {
        line_1: customer.address?.line_1 || 'Av. Paulista, 1000',
        zip_code: customer.address?.zip_code || '01310100',
        city: customer.address?.city || 'São Paulo',
        state: customer.address?.state || 'SP',
        country: 'BR',
      },
      phones: {
        mobile_phone: {
          country_code: '55',
          area_code: '11',
          number: (String(customer.phone || '').replace(/\D/g, '').slice(-9) || '999999999').slice(0, 9),
        },
      },
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
      const detailStr = data.errors && typeof data.errors === 'object'
        ? ' ' + JSON.stringify(data.errors)
        : '';
      return res.status(response.status).json({
        error: (data.message || 'Erro ao criar pedido') + detailStr,
        details: data.errors,
      });
    }

    // Normalizar Pix: extrair código de várias estruturas possíveis da Pagar.me
    if (paymentMethod === 'pix' && data.charges?.[0]) {
      const charge = data.charges[0];
      const tx = charge.last_transaction || {};
      const gw = tx.gateway_response || {};
      const pixCodeRaw = tx.pix_qr_code || tx.qr_code || tx.pix_code || tx.emv
        || gw.emv || gw.qr_code || gw.pix_copy_paste;
      const pixCode = (pixCodeRaw && String(pixCodeRaw).length > 50) ? pixCodeRaw : null;
      if (pixCode) {
        data._pix = { code: pixCode, qr_url: tx.qr_code_url || gw.qr_code_url };
      } else if (charge.status === 'failed' && gw?.errors?.length) {
        data._pix = { error: gw.errors.map(function (e) { return e.message; }).join('. ') };
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar pedido' });
  }
}

/**
 * API: Criar plano na Pagar.me (uso único para configurar planos mensais)
 * POST /api/create-plan
 * Body: { planId } - start | pro | agency
 *
 * Retorna o plan_id para configurar nas variáveis de ambiente.
 * Rode uma vez para cada plano e adicione os IDs no Vercel.
 */
const PLANS = {
  start: { name: 'VARVOS Creator', amount: 990, credits: 1500 },  // TESTE R$ 9,90 — voltar para 5990 depois
  pro: { name: 'VARVOS Pro', amount: 14990, credits: 4000 },
  agency: { name: 'VARVOS Agency', amount: 44900, credits: 15000 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const secretKey = process.env.PAGAR_ME_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Pagar.me não configurado' });
  }

  const { planId } = req.body;
  const plan = PLANS[planId];
  if (!plan) {
    return res.status(400).json({ error: 'planId deve ser start, pro ou agency' });
  }

  const payload = {
    name: plan.name,
    currency: 'BRL',
    interval: 'month',
    interval_count: 1,
    billing_type: 'prepaid',
    payment_methods: ['credit_card'],
    installments: [1],
    minimum_price: plan.amount,
    items: [
      {
        name: plan.name,
        quantity: 1,
        pricing_scheme: {
          scheme_type: 'unit',
          price: plan.amount,
        },
      },
    ],
    metadata: { varvos_plan: planId, credits: String(plan.credits) },
  };

  try {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch('https://api.pagar.me/core/v5/plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Erro ao criar plano',
        details: data.errors,
      });
    }

    return res.status(200).json({
      plan_id: data.id,
      message: `Adicione PAGAR_ME_PLAN_${planId.toUpperCase()}=${data.id} nas variáveis de ambiente do Vercel`,
    });
  } catch (err) {
    console.error('create-plan error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

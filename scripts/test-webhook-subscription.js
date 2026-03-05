/**
 * Script para testar o webhook de assinatura (créditos mensais)
 *
 * Simula o POST subscription.invoice_paid para creditar um usuário sem pagar.
 * Útil para validar se o fluxo de créditos da assinatura está funcionando.
 *
 * Uso:
 *   USER_ID=seu-uuid EMAIL=seu@email.com CREDITOS=1500 node scripts/test-webhook-subscription.js
 *
 * Planos: Creator=1500, Pro=4000, Agency=15000
 */

const BASE = process.env.BASE_URL || 'https://www.varvos.com';
const USER_ID = process.env.USER_ID || '';
const EMAIL = process.env.EMAIL || '';
const CREDITOS = parseInt(process.env.CREDITOS || '1500', 10);

const payload = {
  type: 'subscription.invoice_paid',
  data: {
    invoice: {
      id: `test_inv_${Date.now()}`,
      amount: 5990,
      metadata: {
        user_id: USER_ID,
        plan_id: 'start',
        credits: String(CREDITOS),
        type: 'assinatura',
      },
      customer: { email: EMAIL || 'teste@varvos.com' },
    },
  },
};

async function run() {
  if (!USER_ID && !EMAIL) {
    console.log('Uso: USER_ID=uuid EMAIL=email CREDITOS=1500 node scripts/test-webhook-subscription.js');
    console.log('');
    console.log('  USER_ID  = UUID do usuário no Supabase (opcional se tiver EMAIL)');
    console.log('  EMAIL    = E-mail do usuário (para buscar se não tiver user_id)');
    console.log('  CREDITOS = 1500 (Creator) | 4000 (Pro) | 15000 (Agency)');
    process.exit(1);
  }

  console.log('Enviando webhook assinatura para', BASE + '/api/webhooks/pagarme');
  console.log('User:', USER_ID || EMAIL, '| Créditos:', CREDITOS);
  console.log('');

  try {
    const res = await fetch(BASE + '/api/webhooks/pagarme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    console.log('Status:', res.status);
    console.log('Resposta:', JSON.stringify(json, null, 2));
    if (res.ok && json.received) {
      console.log('');
      console.log('✅ Webhook processado! Verifique no Supabase:');
      console.log('   - users.credits (deve ter aumentado)');
      console.log('   - payments (novo registro)');
      console.log('   - credit_logs (novo registro)');
    } else if (json.skipped) {
      console.log('');
      console.log('⚠️  Webhook ignorado:', json.skipped);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
}

run();

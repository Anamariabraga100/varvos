/**
 * Script para testar o webhook de créditos localmente
 *
 * Simula o POST order.paid para creditar um usuário sem pagar de verdade.
 * Útil para validar se o fluxo de créditos está funcionando.
 *
 * Uso:
 *   1. Coloque seu user_id (UUID do Supabase) e quantidade de créditos abaixo
 *   2. Com o servidor rodando (npx vercel dev), execute:
 *      node scripts/test-webhook-credits.js
 *
 * Ou via curl (substitua USER_ID e CREDITOS):
 *   curl -X POST http://localhost:3000/api/webhooks/pagarme \
 *     -H "Content-Type: application/json" \
 *     -d '{"type":"order.paid","data":{"id":"test_order_123","amount":3990,"metadata":{"user_id":"SEU_USER_ID","plan_id":"popular","credits":"60"},"customer":{"email":"seu@email.com"}}}'
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Edite estes valores:
const USER_ID = process.env.USER_ID || 'COLE_SEU_USER_ID_AQUI';  // UUID do usuário no Supabase
const CREDITOS = parseInt(process.env.CREDITOS || '60', 10);      // Ex: 60 para Popular, 20 para Starter
const PLAN_ID = process.env.PLAN_ID || 'popular';

const payload = {
  type: 'order.paid',
  data: {
    id: `test_order_${Date.now()}`,
    amount: 3990,
    metadata: {
      user_id: USER_ID,
      plan_id: PLAN_ID,
      credits: String(CREDITOS),
      type: 'avulso',
    },
    customer: {
      email: 'teste@varvos.com',
    },
  },
};

async function run() {
  if (USER_ID.includes('COLE') || USER_ID.length < 30) {
    console.log('⚠️  Configure USER_ID no script ou via variável de ambiente.');
    console.log('   Pegue o ID em: Supabase → Table Editor → users → coluna id');
    console.log('');
    console.log('   Exemplo:');
    console.log('   USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx node scripts/test-webhook-credits.js');
    console.log('   ou edite scripts/test-webhook-credits.js');
    process.exit(1);
  }

  console.log('Enviando webhook simulado para', BASE + '/api/webhooks/pagarme');
  console.log('User ID:', USER_ID, '| Créditos:', CREDITOS);
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
    console.log('');
    console.log('Certifique-se de que o servidor está rodando: npx vercel dev');
    process.exit(1);
  }
}

run();

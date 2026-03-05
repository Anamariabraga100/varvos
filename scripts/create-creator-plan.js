/**
 * Cria o plano Creator (R$ 59,90) no Pagar.me via API
 *
 * Pré-requisitos:
 * - Projeto deployado no Vercel com PAGAR_ME_SECRET_KEY configurada
 *
 * Uso:
 *   npm run criar-plano-creator
 *   # ou:
 *   node scripts/create-creator-plan.js
 *   # com URL customizada:
 *   API_URL=https://seu-dominio.vercel.app node scripts/create-creator-plan.js
 *
 * A resposta inclui o plan_id para configurar PAGAR_ME_PLAN_START no Vercel.
 */
const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'https://www.varvos.com';
const url = new URL(API_URL + '/api/create-plan');
const body = JSON.stringify({ planId: 'start' });

const client = url.protocol === 'https:' ? https : http;

const req = client.request(
  url,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        console.error('Resposta inválida:', data);
        process.exit(1);
      }
      if (res.statusCode !== 200) {
        console.error('Erro:', json.error || json.message || res.statusCode);
        if (json.details) console.error('Detalhes:', json.details);
        process.exit(1);
      }
      console.log('✓ Plano Creator (R$ 59,90/mês) criado com sucesso!\n');
      console.log('Plan ID:', json.plan_id);
      console.log('\n' + json.message);
      console.log('\nPróximos passos:');
      console.log('1. Vercel → Settings → Environment Variables');
      console.log('2. Edite PAGAR_ME_PLAN_START e cole:', json.plan_id);
      console.log('3. Faça um novo deploy');
    });
  }
);

req.on('error', (err) => {
  console.error('Erro de conexão:', err.message);
  process.exit(1);
});
req.write(body);
req.end();

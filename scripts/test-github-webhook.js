/**
 * Testa o webhook GitHub em http://localhost:8000/
 * Uso: node scripts/test-github-webhook.js
 *
 * Requer: servidor FastAPI rodando (python main.py)
 */
const crypto = require('crypto');

const SECRET = 'your_secret_token_here';
const BODY = JSON.stringify({ test: 'push', event: 'push' });
const SIG = 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');

const url = 'http://localhost:8000/';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'push',
    'X-Hub-Signature-256': SIG,
  },
  body: BODY,
})
  .then((r) => {
    console.log('Status:', r.status, r.statusText);
    return r.json();
  })
  .then((json) => console.log('Response:', json))
  .catch((e) => console.error('Erro:', e.message));

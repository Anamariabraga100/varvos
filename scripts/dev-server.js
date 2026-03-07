/**
 * Servidor local para desenvolvimento (sem Vercel).
 * Uso: node scripts/dev-server.js
 *
 * Carrega .env.local e serve a app + APIs em http://localhost:8080 (ou PORT)
 */
const { config } = require('dotenv');
const { resolve } = require('path');
const express = require('express');
const path = require('path');

config({ path: resolve(__dirname, '..', '.env.local') });

const app = express();
const PORT = process.env.PORT || 8080;
const ROOT = resolve(__dirname, '..');

app.use(express.json({ limit: '10mb' }));

// Rotas explícitas — serve direto, sem redirect (evita ERR_TOO_MANY_REDIRECTS)
const sendIndex = (dir) => (req, res) => res.sendFile(path.join(ROOT, dir, 'index.html'));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/imitar-movimento', sendIndex('imitar-movimento'));
app.get('/imitar-movimento/', sendIndex('imitar-movimento'));
app.get('/video', sendIndex('video'));
app.get('/video/', sendIndex('video'));
app.get('/danca', sendIndex('danca'));
app.get('/danca/', sendIndex('danca'));
app.get('/marketing', sendIndex('marketing'));
app.get('/marketing/', sendIndex('marketing'));
app.get('/imagem', sendIndex('imagem'));
app.get('/imagem/', sendIndex('imagem'));
app.get('/admin', sendIndex('admin'));
app.get('/admin/', sendIndex('admin'));

app.use(express.static(ROOT, { redirect: false }));

// API: upload-presign
app.post('/api/upload-presign', async (req, res) => {
  try {
    const handler = (await import('../api/upload-presign.js')).default;
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] upload-presign:', err);
    res.status(500).json({ code: 500, msg: err?.message || 'Erro' });
  }
});

// API: kie (todas as rotas)
app.all(/^\/api\/kie(\/.*)?$/, async (req, res) => {
  req.url = req.originalUrl || req.url;
  try {
    const handler = (await import('../api/kie/[[...slug]].js')).default;
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] kie:', err);
    res.status(500).json({ code: 500, msg: err?.message || 'Erro' });
  }
});

// API: débito e estorno de créditos (geração de vídeo)
app.post('/api/deduct-credits', async (req, res) => {
  try {
    const handler = (await import('../api/deduct-credits.js')).default;
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] deduct-credits:', err);
    res.status(500).json({ error: err?.message || 'Erro ao debitar créditos' });
  }
});

app.post('/api/refund-credits', async (req, res) => {
  try {
    const handler = (await import('../api/refund-credits.js')).default;
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] refund-credits:', err);
    res.status(500).json({ error: err?.message || 'Erro ao estornar créditos' });
  }
});

// API: get-credits (créditos e plano do usuário)
app.get('/api/app/get-credits', async (req, res) => {
  try {
    const handler = (await import('../api/app/get-credits.js')).default;
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] get-credits:', err);
    res.status(500).json({ error: err?.message || 'Erro' });
  }
});

// Fallback: SPA
app.get(/^\/(?!api)/, (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  const candidates = [path.join(ROOT, req.path, 'index.html'), path.join(ROOT, req.path + '.html')];
  for (const c of candidates) {
    if (require('fs').existsSync(c)) return res.sendFile(c);
  }
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Local: http://localhost:${PORT}`);
  console.log(`  Imitar Movimento: http://localhost:${PORT}/imitar-movimento\n`);
});

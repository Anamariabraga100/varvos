/**
 * Proxy para Kie AI createTask (Imitar Movimento).
 * A chave KIE_API_KEY fica só no servidor — nunca exposta no frontend.
 * POST /api/kie/create-task
 */
const KIE_API_BASE = 'https://api.kie.ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      code: 500,
      msg: 'KIE_API_KEY não configurada. Configure em Vercel → Environment Variables.',
    });
  }

  try {
    const resKie = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });
    const data = await resKie.json();

    res.status(resKie.status).json(data);
  } catch (err) {
    console.error('[api/kie/create-task]', err);
    res.status(500).json({ code: 500, msg: err?.message || 'Erro ao chamar Kie AI' });
  }
}

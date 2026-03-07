/**
 * API KIE unificada — record-info e create-task em uma única Serverless Function
 * GET /api/kie/record-info?taskId=xxx | POST /api/kie/create-task
 */
const KIE_API_BASE = 'https://api.kie.ai';

function getRoute(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug) && slug.length > 0) return slug[0];
  if (req.url) {
    const match = String(req.url).match(/\/api\/kie\/?([^/?]*)/);
    return match ? match[1] : '';
  }
  return '';
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const apiKey = process.env.KIE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      code: 500,
      msg: 'KIE_API_KEY não configurada',
    });
  }

  if (route === 'record-info') {
    if (req.method !== 'GET') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
    const taskId = req.query?.taskId;
    if (!taskId) return res.status(400).json({ code: 400, msg: 'taskId é obrigatório' });
    try {
      const resKie = await fetch(
        `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const data = await resKie.json();
      return res.status(resKie.status).json(data);
    } catch (err) {
      console.error('[api/kie/record-info]', err);
      return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao chamar Kie AI' });
    }
  }

  if (route === 'create-task') {
    if (req.method !== 'POST') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
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
      return res.status(resKie.status).json(data);
    } catch (err) {
      console.error('[api/kie/create-task]', err);
      return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao chamar Kie AI' });
    }
  }

  return res.status(404).json({ code: 404, msg: 'Rota não encontrada' });
}

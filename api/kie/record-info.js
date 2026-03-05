/**
 * Proxy para Kie AI recordInfo (status do Imitar Movimento).
 * A chave KIE_API_KEY fica só no servidor — nunca exposta no frontend.
 * GET /api/kie/record-info?taskId=xxx
 */
const KIE_API_BASE = 'https://api.kie.ai';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const taskId = req.query?.taskId;
  if (!taskId) {
    return res.status(400).json({ code: 400, msg: 'taskId é obrigatório' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      code: 500,
      msg: 'KIE_API_KEY não configurada',
    });
  }

  try {
    const resKie = await fetch(
      `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
    const data = await resKie.json();

    res.status(resKie.status).json(data);
  } catch (err) {
    console.error('[api/kie/record-info]', err);
    res.status(500).json({ code: 500, msg: err?.message || 'Erro ao chamar Kie AI' });
  }
}

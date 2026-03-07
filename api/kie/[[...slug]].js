/**
 * API KIE unificada — record-info, create-task, upload-file e proxy-video
 * GET /api/kie/record-info?taskId=xxx | POST /api/kie/create-task
 * POST /api/kie/upload-file | GET /api/kie/proxy-video?url=xxx
 */
const KIE_API_BASE = 'https://api.kie.ai';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

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

  // proxy-video não precisa de KIE_API_KEY
  if (route === 'proxy-video') {
    if (req.method !== 'GET') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
    const url = req.query?.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ code: 400, msg: 'url é obrigatório' });
    const decoded = decodeURIComponent(url);
    if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
      return res.status(400).json({ code: 400, msg: 'URL inválida' });
    }
    try {
      const resp = await fetch(decoded, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VARVOS/1.0)' },
        redirect: 'follow',
      });
      if (!resp.ok) return res.status(resp.status).json({ code: resp.status, msg: `Erro ao buscar vídeo: ${resp.status}` });
      const contentType = resp.headers.get('content-type') || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const buf = await resp.arrayBuffer();
      return res.send(Buffer.from(buf));
    } catch (err) {
      console.error('[api/kie/proxy-video]', err);
      return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao buscar vídeo' });
    }
  }

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

  if (route === 'upload-file') {
    if (req.method !== 'POST') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
    const { base64Data, uploadPath, fileName } = req.body || {};
    if (!base64Data) return res.status(400).json({ code: 400, msg: 'base64Data é obrigatório' });
    try {
      const resKie = await fetch(`${KIE_UPLOAD_BASE}/api/file-base64-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          base64Data,
          uploadPath: uploadPath || 'motion-uploads',
          fileName: fileName || undefined,
        }),
      });
      const data = await resKie.json();
      if (!data?.success && data?.code !== 200) {
        return res.status(resKie.status).json(data);
      }
      const url = data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url || data?.downloadUrl || data?.fileUrl;
      if (!url) {
        return res.status(500).json({ code: 500, msg: 'URL não retornada pela KIE' });
      }
      return res.status(200).json({ success: true, url });
    } catch (err) {
      console.error('[api/kie/upload-file]', err);
      return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao fazer upload' });
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

/**
 * API KIE unificada — record-info, create-task, upload-file, upload-from-url e proxy-video
 * GET /api/kie/record-info?taskId=xxx | POST /api/kie/create-task
 * POST /api/kie/upload-file (multipart) | POST /api/kie/upload-from-url (JSON)
 * GET /api/kie/proxy-video?url=xxx
 *
 * upload-file: multipart/form-data (file + bucket). Vercel: 4.5MB limite — use upload-from-url para vídeos.
 * upload-from-url: { fileUrl, bucket, fileName } — KIE baixa da URL. Sem limite de tamanho no serverless.
 */
const KIE_API_BASE = 'https://api.kie.ai';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

import multiparty from 'multiparty';

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

  // Upload-from-URL: KIE baixa da URL (evita 4.5MB do Vercel). Para vídeos grandes.
  if (route === 'upload-from-url') {
    if (req.method !== 'POST') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
    let body;
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ code: 400, msg: 'Body JSON inválido' });
    }
    const { fileUrl, bucket, fileName } = body;
    if (!fileUrl || typeof fileUrl !== 'string') return res.status(400).json({ code: 400, msg: 'fileUrl é obrigatório' });
    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      return res.status(400).json({ code: 400, msg: 'fileUrl deve ser HTTP(S)' });
    }
    const path = bucket === 'images' ? 'motion-images' : 'motion-uploads';
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || (bucket === 'images' ? 'jpg' : 'mp4');
    const safeExt = ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : (bucket === 'images' ? 'jpg' : 'mp4');
    const name = fileName || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    try {
      const resKie = await fetch(`${KIE_UPLOAD_BASE}/api/file-url-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ fileUrl, uploadPath: path, fileName: name }),
      });
      const data = await resKie.json();
      if (!data?.success && data?.code !== 200) {
        return res.status(resKie.status).json(data);
      }
      let url = data?.data?.downloadUrl || data?.data?.fileUrl || data?.data?.url || data?.downloadUrl || data?.fileUrl;
      if (!url) return res.status(500).json({ code: 500, msg: 'URL não retornada pela KIE' });
      const hasExt = /\.(mp4|mov|m4v|jpg|jpeg|png)$/i.test(url.split('?')[0]);
      if (!hasExt) {
        const [base, qs] = url.split('?');
        url = base + '.' + safeExt + (qs ? '?' + qs : '');
      }
      return res.status(200).json({ success: true, url });
    } catch (err) {
      console.error('[api/kie/upload-from-url]', err);
      return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao fazer upload' });
    }
  }

  // Upload via KIE File Stream API — multipart/form-data (file + bucket)
  // Vercel: 4.5MB limite. Para vídeos > 4MB, use frontend → Supabase Storage → upload-from-url
  if (route === 'upload-file' || route === 'upload-stream') {
    if (req.method !== 'POST') return res.status(405).json({ code: 405, msg: 'Método não permitido' });
    const contentType = req.headers['content-type'] || '';
    let buffer, bucket = 'images', fileName = '';

    if (contentType.includes('multipart/form-data')) {
      const { fields, files } = await new Promise((resolve, reject) => {
        const form = new multiparty.Form();
        form.parse(req, (err, f, fs) => {
          if (err) reject(err);
          else resolve({ fields: f, files: fs });
        });
      });
      const file = files?.file?.[0] || files?.file;
      if (!file) return res.status(400).json({ code: 400, msg: 'Campo "file" é obrigatório' });
      const { readFileSync } = await import('fs');
      buffer = readFileSync(file.path);
      fileName = file.originalFilename || file.path?.split(/[/\\]/).pop() || '';
      const b = String(fields?.bucket?.[0] || fields?.bucket || 'images');
      bucket = b === 'videos' ? 'videos' : 'images';
    } else {
      return res.status(400).json({ code: 400, msg: 'Use multipart/form-data com campo "file". Para vídeos grandes, use Supabase Storage + upload-from-url.' });
    }

    if (!buffer || buffer.length === 0) return res.status(400).json({ code: 400, msg: 'Arquivo vazio' });
    const uploadPath = bucket === 'images' ? 'motion-images' : 'motion-uploads';
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || (bucket === 'images' ? 'jpg' : 'mp4');
    const safeExt = ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : (bucket === 'images' ? 'jpg' : 'mp4');
    const name = fileName || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const mime = bucket === 'images'
      ? (safeExt === 'png' ? 'image/png' : 'image/jpeg')
      : (['mov', 'm4v'].includes(safeExt) ? 'video/quicktime' : 'video/mp4');

    try {
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mime }), name);
      formData.append('uploadPath', uploadPath);

      const resKie = await fetch(`${KIE_UPLOAD_BASE}/api/file-stream-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      const data = await resKie.json();
      if (!data?.success && data?.code !== 200) {
        return res.status(resKie.status).json(data);
      }
      let url = data?.data?.downloadUrl || data?.data?.fileUrl || data?.data?.url || data?.downloadUrl || data?.fileUrl;
      if (!url) return res.status(500).json({ code: 500, msg: 'URL não retornada pela KIE' });
      const hasExt = /\.(mp4|mov|m4v|jpg|jpeg|png)$/i.test(url.split('?')[0]);
      if (!hasExt) {
        const [base, qs] = url.split('?');
        url = base + '.' + safeExt + (qs ? '?' + qs : '');
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
      let body = req.body || {};
      // Normalizar body para motion-control (API KIE exige formato exato)
      if (body?.model === 'kling-2.6/motion-control' && body?.input) {
        const inp = body.input;
        const ensureExt = (url, def) => {
          if (!url || typeof url !== 'string') return url;
          const base = url.split('?')[0];
          if (/\.(mp4|mov|m4v|jpg|jpeg|png)$/i.test(base)) return url;
          const [u, qs] = url.split('?');
          return u + '.' + def + (qs ? '?' + qs : '');
        };
        const inputUrls = (Array.isArray(inp.input_urls) ? inp.input_urls : (inp.input_urls ? [inp.input_urls] : [])).map(u => ensureExt(u, 'jpg'));
        const videoUrls = (Array.isArray(inp.video_urls) ? inp.video_urls : (inp.video_urls ? [inp.video_urls] : [])).map(u => ensureExt(u, 'mp4'));
        body = {
          ...body,
          model: 'kling-2.6/motion-control',
          input: {
            ...inp,
            input_urls: inputUrls,
            video_urls: videoUrls,
            character_orientation: inp.character_orientation === 'image' ? 'image' : 'video',
            mode: inp.mode === '1080p' ? '1080p' : '720p',
          },
        };
      }
      const resKie = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
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

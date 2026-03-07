/**
 * Proxy para vídeos externos — evita CORS no preview da Biblioteca
 * GET /api/proxy-video?url=https://...
 */
export default async function handler(req, res) {
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
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('[api/proxy-video]', err);
    return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao buscar vídeo' });
  }
}

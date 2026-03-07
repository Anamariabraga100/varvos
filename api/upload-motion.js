/**
 * Upload para Imitar Movimento — Supabase Storage (aceita MOV, MP4, JPG, PNG)
 * POST /api/upload-motion
 * Body: { base64Data, bucket: 'videos'|'images', fileName? }
 * Retorna { url } — URL pública do arquivo
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { base64Data, bucket, fileName } = req.body || {};
  if (!base64Data || typeof base64Data !== 'string') {
    return res.status(400).json({ error: 'base64Data é obrigatório' });
  }
  const b = bucket === 'images' ? 'images' : 'videos';
  const folder = 'motion-refs';

  // Extrair base64 puro (com ou sem data URL)
  let raw = base64Data;
  if (raw.includes(',')) raw = raw.split(',')[1] || raw;

  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'Base64 inválido' });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Arquivo vazio' });
  }

  const ext = (fileName || '').split('.').pop()?.toLowerCase() || (b === 'videos' ? 'mp4' : 'jpg');
  const safeExt = ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : (b === 'videos' ? 'mp4' : 'jpg');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

  const contentType = b === 'videos'
    ? (['mov', 'm4v'].includes(safeExt) ? 'video/quicktime' : 'video/mp4')
    : (safeExt === 'png' ? 'image/png' : 'image/jpeg');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase.storage
      .from(b)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('[upload-motion]', error);
      return res.status(500).json({ error: error.message || 'Erro ao fazer upload' });
    }

    const { data: urlData } = supabase.storage.from(b).getPublicUrl(data.path);
    const url = urlData?.publicUrl || `${supabaseUrl}/storage/v1/object/public/${b}/${data.path}`;

    return res.status(200).json({ success: true, url });
  } catch (err) {
    console.error('[upload-motion]', err);
    return res.status(500).json({ error: err?.message || 'Erro ao fazer upload' });
  }
}

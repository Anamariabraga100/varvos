/**
 * Gera presigned URL para upload direto no R2 (Cloudflare).
 * POST /api/upload-presign
 * Body: { fileName, contentType, type: 'image'|'video' }
 * Retorna: { uploadUrl, publicUrl }
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from 'dotenv';
import { resolve } from 'path';

// Local: carrega .env.local quando R2 não está definido
if (!process.env.R2_ACCESS_KEY_ID) {
  config({ path: resolve(process.cwd(), '.env.local') });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Método não permitido' });
  }

  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_URL;

  if (!accessKey || !secretKey || !endpoint || !bucket || !publicBase) {
    return res.status(500).json({
      code: 500,
      msg: 'R2 não configurado. Defina R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET e R2_PUBLIC_URL.',
    });
  }

  const { fileName, contentType, type } = req.body || {};
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpg');
  const safeExt = ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : type === 'video' ? 'mp4' : 'jpg';
  const key = `motion-refs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

  const mime = type === 'video'
    ? (['mov', 'm4v'].includes(safeExt) ? 'video/quicktime' : 'video/mp4')
    : (safeExt === 'png' ? 'image/png' : 'image/jpeg');

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      // Sem checksum: o navegador não envia x-amz-checksum-* no PUT, então a URL
      // não pode incluir esses parâmetros senão o R2 responde 403 (assinatura inválida).
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    const putUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mime,
      }),
      { expiresIn: 3600 },
    );

    const base = publicBase.replace(/\/$/, '');
    const publicUrl = `${base}/${key}`;

    return res.status(200).json({ uploadUrl: putUrl, publicUrl });
  } catch (err) {
    console.error('[api/upload-presign]', err);
    return res.status(500).json({ code: 500, msg: err?.message || 'Erro ao gerar URL' });
  }
}

/**
 * Testa o upload KIE localmente (multipart/form-data).
 * Uso: node scripts/test-kie-upload.js [arquivo]
 *
 * 1. Inicie o servidor: vercel dev
 * 2. Em outro terminal: node scripts/test-kie-upload.js
 *    ou com arquivo: node scripts/test-kie-upload.js caminho/para/imagem.jpg
 *
 * Sem argumentos: usa uma imagem PNG mínima (1x1 pixel) para teste.
 */
const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const fileArg = process.argv[2];

let buffer;
let bucket = 'images';
let fileName = 'test.png';
let mime = 'image/png';

if (fileArg && existsSync(fileArg)) {
  buffer = readFileSync(resolve(fileArg));
  const ext = fileArg.split('.').pop()?.toLowerCase() || 'jpg';
  bucket = ['mp4', 'mov', 'm4v'].includes(ext) ? 'videos' : 'images';
  fileName = fileArg.split(/[/\\]/).pop() || `test.${ext}`;
  mime = bucket === 'videos' ? (['mov', 'm4v'].includes(ext) ? 'video/quicktime' : 'video/mp4') : (ext === 'png' ? 'image/png' : 'image/jpeg');
} else {
  // PNG 1x1 pixel mínimo
  buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fileName = 'test.png';
}

async function run() {
  console.log('Testando upload KIE (multipart) em', BASE + '/api/kie/upload-file');
  console.log('Bucket:', bucket, '| Arquivo:', fileName);
  try {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mime }), fileName);
    formData.append('bucket', bucket);
    const res = await fetch(BASE + '/api/kie/upload-file', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (res.ok && data?.url) {
      console.log('OK! URL retornada:', data.url);
    } else {
      console.error('Erro:', res.status, data);
    }
  } catch (err) {
    console.error('Falha:', err.message);
    console.log('\nCertifique-se de que "vercel dev" está rodando.');
  }
}

run();

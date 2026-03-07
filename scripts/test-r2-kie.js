/**
 * Testa o fluxo R2 (presign) + KIE (upload-from-url) com chaves locais.
 * Uso:
 *   1. npm run dev   (em um terminal)
 *   2. node scripts/test-r2-kie.js   (em outro)
 *
 * Ou com servidor já rodando em outra porta:
 *   BASE_URL=http://localhost:3000 node scripts/test-r2-kie.js
 */
const { config } = require('dotenv');
const { resolve } = require('path');

config({ path: resolve(__dirname, '..', '.env.local') });

const BASE = process.env.BASE_URL || 'http://localhost:8080';

async function testPresign(type = 'video') {
  console.log('\n1. Testando /api/upload-presign (R2)...');
  const body = {
    fileName: type === 'video' ? 'test.mp4' : 'test.jpg',
    contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
    type,
  };
  const res = await fetch(BASE + '/api/upload-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('   Falha:', res.status, data?.msg || data);
    return null;
  }
  if (!data.uploadUrl || !data.publicUrl) {
    console.error('   Resposta sem uploadUrl/publicUrl:', data);
    return null;
  }
  console.log('   OK. publicUrl (exemplo):', data.publicUrl.slice(0, 60) + '...');
  return data;
}

async function testKieUploadFromUrl(fileUrl, bucket = 'videos', fileName = 'test.mp4') {
  console.log('\n2. Testando /api/kie/upload-from-url (KIE)...');
  const res = await fetch(BASE + '/api/kie/upload-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl, bucket, fileName }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('   Falha:', res.status, data?.msg || data);
    return null;
  }
  const url = data?.url || data?.data?.downloadUrl || data?.data?.fileUrl;
  if (!url) {
    console.error('   Resposta sem URL:', data);
    return null;
  }
  console.log('   OK. URL KIE:', url.slice(0, 70) + '...');
  return url;
}

async function run() {
  console.log('Base URL:', BASE);
  console.log('R2 configurado:', !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL));
  console.log('KIE_API_KEY configurada:', !!process.env.KIE_API_KEY);

  try {
    const presign = await testPresign('video');
    if (!presign) {
      console.log('\nPresign falhou. Verifique R2_* em .env.local');
      process.exit(1);
    }

    // Testa KIE upload-from-url com uma URL pública de exemplo (vídeo curto)
    const sampleUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
    const kieUrl = await testKieUploadFromUrl(sampleUrl, 'videos', 'sample.mp4');
    if (!kieUrl) {
      console.log('\nKIE upload-from-url falhou. Verifique KIE_API_KEY e se a KIE consegue acessar a URL.');
      process.exit(1);
    }

    console.log('\n--- Todos os testes passaram (R2 presign + KIE upload-from-url). ---\n');
  } catch (err) {
    console.error('\nErro:', err.message);
    console.log('\nCertifique-se de que o servidor está rodando (npm run dev).');
    process.exit(1);
  }
}

run();

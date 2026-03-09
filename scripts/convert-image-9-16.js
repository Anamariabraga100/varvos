/**
 * Converte imagem de 16:9 para 9:16 (formato vertical para vídeo)
 * Adiciona padding em cima e embaixo com a cor dominante da imagem
 *
 * Uso: node scripts/convert-image-9-16.js <caminho-da-imagem>
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('Uso: node scripts/convert-image-9-16.js <caminho-da-imagem>');
    process.exit(1);
  }

  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const outputPath = path.join(dir, `${base}-9x16${ext}`);

  const img = sharp(inputPath);
  const meta = await img.metadata();
  const { width: w, height: h } = meta;

  // 9:16 = vertical (largura menor que altura)
  const targetRatio = 9 / 16;
  const currentRatio = w / h;

  let padTop, padBottom, padLeft, padRight;

  if (currentRatio > targetRatio) {
    // 16:9 ou mais largo: manter largura, adicionar altura (padding em cima/baixo)
    const newHeight = Math.round(w / targetRatio);
    padTop = Math.round((newHeight - h) / 2);
    padBottom = newHeight - h - padTop;
    padLeft = 0;
    padRight = 0;
  } else {
    // Mais alto que 9:16: manter altura, adicionar largura (padding laterais)
    const newWidth = Math.round(h * targetRatio);
    padLeft = Math.round((newWidth - w) / 2);
    padRight = newWidth - w - padLeft;
    padTop = 0;
    padBottom = 0;
  }

  // Cor do padding: usar cor dominante da imagem (fundo vermelho no caso do tênis)
  const stats = await sharp(inputPath).stats();
  const d = stats.dominant;
  const bgColor = { r: Math.round(d.r), g: Math.round(d.g), b: Math.round(d.b), alpha: 1 };

  await img
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: bgColor,
    })
    .toFile(outputPath);

  const outMeta = await sharp(outputPath).metadata();
  console.log(`Salvo: ${outputPath}`);
  console.log(`Formato: ${outMeta.width}x${outMeta.height} (9:16)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

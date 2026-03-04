/**
 * Gera config.js a partir das variáveis de ambiente (Vercel).
 * Rode no build: node scripts/build-config.js
 */
const fs = require('fs');
const path = require('path');

const config = {
  apiKey: process.env.VARVOS_API_KEY || '',
  kieApiKey: process.env.KIE_API_KEY || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  pagarMeEncryptionKey: process.env.PAGAR_ME_ENCRYPTION_KEY || ''
};

const output = `// Gerado automaticamente no build (não edite)
window.VARVOS_CONFIG = ${JSON.stringify(config, null, 2)};
`;

const outPath = path.join(__dirname, '..', 'config.js');
fs.writeFileSync(outPath, output);
console.log('config.js gerado em', outPath);

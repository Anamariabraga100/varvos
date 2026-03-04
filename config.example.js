// Copie este arquivo para config.js e adicione suas chaves
// O config.js não deve ser commitado (adicione ao .gitignore)
window.VARVOS_CONFIG = {
  apiKey: 'sua-api-key-aqui',
  kieApiKey: 'sua-kie-api-key-aqui', // Para Imitar Movimento (api.kie.ai). Se vazio, usa apiKey
  googleClientId: 'SEU_CLIENT_ID.apps.googleusercontent.com',
  // Supabase (https://supabase.com/dashboard) — Project Settings > API
  supabaseUrl: 'https://seu-projeto.supabase.co',
  supabaseAnonKey: 'sua-anon-key-aqui',
  adminPassword: 'senha-secreta-admin',
  // Pagar.me (https://dashboard.pagar.me) — Configurações > Chaves > Chave de criptografia (ek_test_ ou ek_live_)
  pagarMeEncryptionKey: 'ek_test_xxxx' // Obrigatório para pagamento com cartão no checkout
};

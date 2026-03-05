// Copie este arquivo para config.js e adicione suas chaves
// O config.js não deve ser commitado (adicione ao .gitignore)
window.VARVOS_CONFIG = {
  apiKey: 'sua-api-key-aqui',
  // kieApiKey removido: Imitar Movimento usa proxy. Configure KIE_API_KEY no Vercel (Settings → Env Vars).
  googleClientId: 'SEU_CLIENT_ID.apps.googleusercontent.com',
  // Supabase (https://supabase.com/dashboard) — Project Settings > API
  supabaseUrl: 'https://seu-projeto.supabase.co',
  supabaseAnonKey: 'sua-anon-key-aqui',
  adminPassword: 'senha-secreta-admin',
  // Pagar.me (https://dashboard.pagar.me) — Configurações > Chaves
  pagarMePublicKey: 'pk_test_xxxx',   // Chave pública (pk_test_ ou pk_live_) — obrigatório para cartão
  pagarMeEncryptionKey: 'ek_test_xxxx' // Chave de criptografia (legado; tokenizecard usa publicKey)
};

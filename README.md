# VARVOS — Criação de Vídeos com IA

Landing page para geração de **vídeos** (Sora 2) e **imagens** (GPT Image 1.5) usando a API Vidgo.

## Como usar

1. Abra `index.html` no navegador ou use um servidor local:
   ```bash
   npx serve .
   ```
2. Cole sua API Key Vidgo no campo do cabeçalho (ou use `config.js`)
3. Escolha **Vídeo** ou **Imagem**, descreva no prompt e clique em **Gerar**

## Configuração

- **API Key**: Cole no campo ou configure em `config.js` (copie de `config.example.js`)
- **Supabase**: URL e chave em `config.js` (`supabaseUrl`, `supabaseAnonKey`). Execute `supabase-schema.sql` no SQL Editor do Supabase para criar as tabelas.
- **Admin**: Acesse `/admin/` e defina `adminPassword` em `config.js` para proteger o painel.
- **Google Login**: Para ativar login com Google, crie um OAuth 2.0 Client ID no [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (tipo "Web application") e adicione em `config.js`:
  ```js
  googleClientId: 'SEU_CLIENT_ID.apps.googleusercontent.com'
  ```
  Em **Authorized JavaScript origins** adicione `http://localhost:3000` (dev) e sua URL de produção (ex: `https://seu-site.vercel.app`).
- **Imagem de referência**: URL pública para image-to-video (opcional)
- **Estilo**: anime, nostalgic, selfie, news, comic

## Documentação da API

- [Sora 2 (Vídeo)](https://docs.vidgo.ai/api-manual/video-series/sora-2)
- [GPT Image 1.5 (Imagem)](https://docs.vidgo.ai/api-manual/image-series/gpt-image-1.5)
- [Z-Image (Imagem)](https://docs.vidgo.ai/api-manual/image-series/z-image)
- [Status de tarefas](https://docs.vidgo.ai/api-manual/task-management/status)

## Segurança

⚠️ **Não commite sua API Key.** O arquivo `config.js` está no `.gitignore`. Para produção, use um backend para fazer as chamadas à API.

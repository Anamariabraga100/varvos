# CORS no bucket R2 (Cloudflare)

Para o upload direto do navegador (vídeo de referência e foto do personagem no **Imitar Movimento**) funcionar em produção, o bucket R2 precisa permitir a origem do seu site.

Sem CORS configurado, o console do navegador mostra:
`Access to fetch at 'https://....r2.cloudflarestorage.com/...' from origin 'https://www.varvos.com' has been blocked by CORS policy`

## Como configurar

1. Acesse o **Cloudflare Dashboard** → **R2** → selecione o bucket usado pela VARVOS (o mesmo do `R2_BUCKET`).
2. Abra **Settings** do bucket.
3. Na seção **CORS policy**, adicione uma regra (ou substitua a existente) com o JSON abaixo.

### Produção (www.varvos.com)

```json
[
  {
    "AllowedOrigins": [
      "https://www.varvos.com",
      "https://varvos.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "Content-MD5"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Incluir localhost (desenvolvimento)

Se quiser testar em `http://localhost:8080` (ou outra porta), adicione na mesma regra:

```json
"AllowedOrigins": [
  "https://www.varvos.com",
  "https://varvos.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]
```

4. Salve a configuração. As mudanças podem levar alguns segundos para aplicar.

Depois disso, o **PUT** para a URL pré-assinada (upload do vídeo/foto) deve funcionar a partir do seu domínio.

# CORS no bucket R2 (Cloudflare)

Para o upload direto do navegador (vídeo de referência e foto do personagem no **Imitar Movimento**) funcionar em produção, o bucket R2 precisa permitir a origem do seu site.

Sem CORS configurado, o console do navegador mostra:
`Access to fetch at 'https://....r2.cloudflarestorage.com/...' from origin 'https://www.varvos.com' has been blocked by CORS policy`

## Como configurar

1. Acesse o **Cloudflare Dashboard** → **R2** → selecione o bucket usado pela VARVOS (o mesmo do `R2_BUCKET`).
2. Abra **Settings** do bucket.
3. Na seção **CORS policy**, clique em **Editar** e use **exatamente** os valores abaixo.

### Origens permitidas (Allowed origins)
- `https://www.varvos.com`
- `https://varvos.com`
- (opcional) `http://localhost:8080` e `http://127.0.0.1:8080` para desenvolvimento

**Importante:** sem barra no final (`https://www.varvos.com` e não `https://www.varvos.com/`).

### Métodos permitidos (Allowed methods)
- `GET`
- `PUT`
- `HEAD`

### Cabeçalhos permitidos (Allowed headers)
Inclua **todos** estes (o navegador pode enviar alguns extras no preflight):
- `Content-Type`
- `Content-Length`
- `Content-MD5`
- `x-amz-content-sha256`
- `x-amz-date`
- `x-amz-sdk-checksum-algorithm`

### Expose headers (se a interface pedir)
- `ETag`

### MaxAgeSeconds (se a interface pedir)
- `3600`

4. **Salve** a configuração.

---

## Se ainda der erro de CORS

1. **Confirme o bucket:** é o mesmo nome que está em `R2_BUCKET` no Vercel/env. Se tiver mais de um bucket, CORS precisa estar no que a aplicação usa.

2. **Aguarde e limpe cache:** às vezes leva 2–5 minutos para aplicar. Depois:
   - Feche a aba do site e abra de novo, ou
   - Teste em uma janela anônima (Ctrl+Shift+N), ou
   - Hard refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac).

3. **CORS via API (alternativa ao dashboard):** se pelo dashboard não funcionar, configure pelo Wrangler ou pela API S3 do R2 (PUT bucket CORS). A política em JSON fica assim:

```json
[
  {
    "AllowedOrigins": ["https://www.varvos.com", "https://varvos.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "Content-MD5", "x-amz-content-sha256", "x-amz-date", "x-amz-sdk-checksum-algorithm"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. **Verifique o domínio:** no console do navegador o erro mostra `from origin 'https://www.varvos.com'`. O valor em **Allowed origins** tem que bater exatamente com isso (com ou sem `www`, conforme o usuário acesse).

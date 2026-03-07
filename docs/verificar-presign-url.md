# Verificar em ~10 segundos se a URL de upload está sem checksum

## 1. Abra o DevTools
- **F12** ou **Ctrl+Shift+I** (Windows) / **Cmd+Option+I** (Mac)
- Aba **Network** (Rede)

## 2. Faça uma ação que gera a URL
- Vá em **Imitar Movimento**
- Escolha uma **foto do personagem** ou **vídeo de referência** (upload)
- No Network, procure a requisição **POST** para:
  - `upload-presign` (nome da request ou URL contendo isso)

## 3. Veja a resposta (Response)
- Clique na request **upload-presign**
- Aba **Response** ou **Preview**
- Abra o campo **uploadUrl** (a URL longa)

### URL errada (ainda com checksum)
Se aparecer **em qualquer lugar** da URL:
```
x-amz-sdk-checksum-algorithm
```
ou
```
x-amz-checksum-crc32
```
→ o backend ainda está gerando URL com checksum. A mudança não entrou.

### URL correta (sem checksum)
A URL deve ter **apenas** parâmetros como:
- `X-Amz-Algorithm=AWS4-HMAC-SHA256`
- `X-Amz-Credential=...`
- `X-Amz-Date=...`
- `X-Amz-Expires=3600`
- `X-Amz-SignedHeaders=host`
- `X-Amz-Signature=...`

**Não** deve conter `x-amz-sdk-checksum-algorithm` nem `x-amz-checksum-crc32`.

---

## Se ainda aparecer checksum: garantir que o servidor certo está rodando

O app pode estar em **http://localhost:8080** mas a API de presign ser chamada em outra porta (processo antigo ou outro servidor).

1. **Pare todo servidor**
   - No terminal onde está rodando: **Ctrl+C**

2. **Inicie de novo**
   ```bash
   npm run dev
   ```
   - O servidor sobe em **http://localhost:8080** (ou na porta em `PORT`).

3. **Limpe o cache do navegador**
   - **Ctrl+Shift+R** (Windows) ou **Cmd+Shift+R** (Mac)
   - Ou teste em aba anônima

4. **Teste de novo**
   - Imitar Movimento → escolher arquivo → conferir no Network a request **upload-presign** e o conteúdo de **uploadUrl**.

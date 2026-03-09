# Configuração da API — Produção (Vercel)

Para o site funcionar **igual ao localhost** em produção, configure as variáveis de ambiente no **Vercel Dashboard**.

## Onde configurar

1. Acesse [vercel.com](https://vercel.com) → seu projeto
2. **Settings** → **Environment Variables**
3. Adicione as variáveis abaixo

## Variáveis obrigatórias para gerar vídeos

### 1. KIE_API_KEY (Varvos Fast)

Usada pelo modelo **Varvos Fast** (image-to-video). Sem ela, aparece erro:
> "KIE_API_KEY não configurada"

| Nome        | Valor              | Ambiente   |
|-------------|--------------------|------------|
| KIE_API_KEY | sua-chave-kie-ai   | Production, Preview, Development |

**Onde obter:** [Kie AI](https://kie.ai) ou painel da API que você usa.

---

### 2. VARVOS_API_KEY (Varvos Pro e Ultra)

Usada pelos modelos **Varvos Pro** (veo3.1-fast) e **Varvos Ultra** (sora-2). Sem ela, aparece:
> "Configure sua chave API em config.js para começar."

| Nome            | Valor                | Ambiente   |
|-----------------|----------------------|------------|
| VARVOS_API_KEY  | sua-chave-vidgo      | Production, Preview, Development |

**Onde obter:** [Vidgo AI](https://api.vidgo.ai) — essa chave é injetada no `config.js` no build.

---

## Resumo — o que colocar no Vercel

| Variável        | Obrigatória para      | Exemplo (não use valores reais aqui) |
|-----------------|------------------------|--------------------------------------|
| KIE_API_KEY     | Varvos Fast            | `kie_xxxxxxxxxxxx`                   |
| VARVOS_API_KEY  | Varvos Pro, Ultra      | `vidgo_xxxxxxxxxxxx`                 |

---

## Após adicionar

1. **Redeploy** o projeto (Deployments → ⋮ → Redeploy)
2. O `config.js` é gerado no build com `VARVOS_API_KEY` (se definida)
3. A `KIE_API_KEY` fica só no servidor (nunca vai para o cliente)

---

## Erros comuns

| Erro                          | Causa                    | Solução                          |
|-------------------------------|--------------------------|----------------------------------|
| KIE_API_KEY não configurada   | Variável ausente no Vercel | Adicione `KIE_API_KEY` e redeploy |
| Configure sua chave API       | VARVOS_API_KEY vazia     | Adicione `VARVOS_API_KEY` e redeploy |
| Erro 401 / Unauthorized       | Chave inválida ou expirada | Verifique a chave no painel da API |

---

## Painel Admin (/admin)

O painel admin **não** configura chaves de API. Ele só permite:
- Ocultar modelos (Varvos Fast, Pro, Ultra)
- Ver usuários e pagamentos
- Editar créditos

As chaves de API são **sempre** configuradas nas variáveis de ambiente do Vercel.

# Deploy na Vercel (evitar 404)

Este repositório tem **dois mundos na raiz**:

- **Rust / Soroban** — `Cargo.toml`, `contracts/`
- **Next.js** — pasta `crowdfund-next/`

Se o projeto na Vercel estiver com a **raiz do repositório** como diretório de build, a plataforma **não** trata o app como Next.js e o site pode responder **404** em todas as rotas.

## O que fazer (obrigatório)

1. Abra o projeto na [Vercel Dashboard](https://vercel.com/dashboard).
2. **Settings** → **General** → **Root Directory**.
3. Clique em **Edit** e defina: **`crowdfund-next`** (exatamente essa pasta).
4. Salve e faça **Redeploy** (Deployments → ⋮ no último deploy → Redeploy).

Guia oficial: [Monorepos — Root Directory](https://vercel.com/docs/monorepos#add-a-monorepo-through-the-vercel-dashboard).

Se estiver **criando o projeto de novo**: na etapa de importar o Git, use **Edit** ao lado de “Root Directory” e escolha `crowdfund-next` **antes** do primeiro deploy.

## Variáveis de ambiente

O `.env` local **não** sobe no deploy. Copie os nomes do arquivo `crowdfund-next/.env.example` e crie cada entrada na Vercel: **Settings** → **Environment Variables** → escolha **Production** (e **Preview**, se quiser) → **Save** → **Redeploy**.

Chaves esperadas:

- `NEXT_PUBLIC_HORIZON_URL`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_CONTRACT_ID`
- `NEXT_PUBLIC_CAMPAIGN_ADDRESS`

Sem elas, a home mostra “Configuração incompleta” em produção.

## Ainda não funciona depois de cadastrar?

1. Confirme que as variáveis estão em **Production** (não só Preview) e fez **Redeploy** depois de salvar.
2. Abra `https://SEU-DOMINIO.vercel.app/api/env-check` — deve retornar JSON com `"ok": true` e cada chave `"vars": { "...": true }`. Se alguma for `false`, o deploy ainda não recebe essa variável.
3. O código usa **nomes literais** `process.env.NEXT_PUBLIC_…` no cliente (exigência do Next para injetar valores no build). Não use leitura dinâmica por string em componentes client.

## Conferir o build

Depois do redeploy, abra o log do build e confira se aparece algo como **“Next.js”** e `next build`, e não apenas um build vazio na raiz do monorepo.

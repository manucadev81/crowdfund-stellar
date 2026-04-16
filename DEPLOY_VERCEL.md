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

No app, URLs e IDs vêm de variáveis `NEXT_PUBLIC_*` (ver `crowdfund-next/.env.example`).

Na Vercel: **Settings** → **Environment Variables** e cadastre as mesmas chaves para **Production** (e Preview, se quiser).

Sem elas, o build ou o runtime pode falhar.

## Conferir o build

Depois do redeploy, abra o log do build e confira se aparece algo como **“Next.js”** e `next build`, e não apenas um build vazio na raiz do monorepo.

# Stellar Crowdfunding (Soroban + Next.js)

Monorepo with a **Soroban smart contract** (`contracts/crowdfund`) and a **Next.js** web app (`crowdfund-next`) for testnet crowdfunding: multi-wallet payments, on-chain totals, `DONATION` event history, and explorer links.

---

## Live demo

- **Deployed app (Vercel):** [https://crowdfund-stellar-5hwb.vercel.app/](https://crowdfund-stellar-5hwb.vercel.app/)
- **Demo video:** [https://youtu.be/nkGo3x-q_8A](https://youtu.be/nkGo3x-q_8A)
- **Sample Soroban transaction (contract invocation):** [https://stellar.expert/explorer/testnet/tx/bd2b0c531683ab4d52acdd1e98224341a763b436c7ef3bc9948623266773b9fa](https://stellar.expert/explorer/testnet/tx/bd2b0c531683ab4d52acdd1e98224341a763b436c7ef3bc9948623266773b9fa)  
  Transaction hash: `bd2b0c531683ab4d52acdd1e98224341a763b436c7ef3bc9948623266773b9fa`

![Stellar Crowdfunding UI — wallet connect, goal progress, and donation history](./docs/crowdfund-demo.png)

---

## What the app does

1. **Connect a wallet** via [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (Freighter, xBull, Albedo, WalletConnect, etc.).
2. **Donate XLM** in one flow: a **classic Horizon payment** to the campaign account, then a **Soroban `donate`** call on the crowdfund contract (same amount in stroops).
3. **Progress bar** reads `get_total` / `get_goal` from the contract over Soroban RPC.
4. **Donation history** loads `DONATION` contract events from Soroban `getEvents` (paginated from the RPC’s oldest retained ledger when doing a full refresh).
5. After a successful donation, **links** open the payment and Soroban transactions on **Stellar Expert** (or Horizon for custom networks).

---

## Repository layout

```text
.
├── contracts
│   └── crowdfund          # Soroban contract (Rust)
│       ├── src
│       │   ├── lib.rs
│       │   └── test.rs
│       └── Cargo.toml
├── crowdfund-next         # Next.js 16 app (App Router)
│   ├── app/
│   ├── lib/
│   └── package.json
├── Cargo.toml             # Rust workspace
├── DEPLOY_VERCEL.md       # Extra Vercel / monorepo notes (Portuguese)
└── README.md
```

Add new Soroban contracts under `contracts/<name>/` with their own `Cargo.toml` wired to the workspace.

---

## Prerequisites

- **Node.js 20+** and npm (for `crowdfund-next`).
- **Rust + Soroban** toolchain if you want to build or test the contract locally (see `contracts/crowdfund` and its `Makefile`).

---

## Environment variables

All public config uses the **`NEXT_PUBLIC_`** prefix so values are available in the browser. Copy `crowdfund-next/.env.example` to `crowdfund-next/.env` and fill in the blanks.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_HORIZON_URL` | Horizon base URL (e.g. `https://horizon-testnet.stellar.org`). |
| `NEXT_PUBLIC_RPC_URL` | Soroban RPC URL (e.g. `https://soroban-testnet.stellar.org`). |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Network passphrase (testnet: `Test SDF Network ; September 2015`). |
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed crowdfund **contract** id (StrKey `C…`). |
| `NEXT_PUBLIC_CAMPAIGN_ADDRESS` | Stellar **account** address that receives the XLM payment before the contract call (`G…`). |

**Important (Next.js + Vercel):** the client code reads each variable with a **literal** `process.env.NEXT_PUBLIC_*` property name. Dynamic lookups like `process.env[key]` are **not** inlined at build time and will be `undefined` in production.

---

## Run the web app locally

```bash
cd crowdfund-next
cp .env.example .env
# Edit .env and set CONTRACT_ID and CAMPAIGN_ADDRESS (and URLs if needed)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If configuration is missing, the app shows an “incomplete configuration” screen listing the missing keys.

**Diagnostics:** with the dev server or a deployed build, `GET /api/env-check` returns JSON flags showing which `NEXT_PUBLIC_*` keys are set (values are never exposed).

---

## Soroban contract

Sources live in **`contracts/crowdfund`**. Build and test with your usual Soroban / Foundry workflow (see that crate’s `Makefile` and `Cargo.toml`).

The contract publishes **`DONATION`** events used by the frontend history table.

---

## Deploy on Vercel

This repo is a **monorepo**: the Next.js app is **not** at the Git root. You must set Vercel’s **Root Directory** to **`crowdfund-next`**. If you leave the root as the repository root, you often get **404** on all routes.

### Required steps

1. Open the project in the [Vercel Dashboard](https://vercel.com/dashboard).
2. **Settings → General → Root Directory → Edit** → set **`crowdfund-next`** (exact folder name).
3. Save and **Redeploy** (Deployments → menu on the latest deployment → Redeploy).

Official reference: [Monorepos — Root Directory](https://vercel.com/docs/monorepos#add-a-monorepo-through-the-vercel-dashboard).

When **importing a new project**, set Root Directory to `crowdfund-next` **before** the first deploy.

### Environment variables on Vercel

Local `.env` is **not** uploaded. Add every key from `.env.example` under **Settings → Environment Variables**, enable **Production** (and **Preview** if you want), save, then **Redeploy**. Without them, production shows the incomplete-configuration screen.

### Still broken after setting env?

1. Confirm variables exist for **Production** (not only Preview) and you **redeployed** after saving.
2. Open `https://<your-project>.vercel.app/api/env-check` — you should see `"ok": true` and each variable `true` under `vars`. Any `false` means that key is missing for that deployment.
3. Verify the build log shows **Next.js** / `next build` for the `crowdfund-next` app, not an empty root build.

More detail (including Portuguese notes): [`DEPLOY_VERCEL.md`](./DEPLOY_VERCEL.md).

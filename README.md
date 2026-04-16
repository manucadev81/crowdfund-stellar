# Soroban Project

## Project Structure

This repository uses the recommended structure for a Soroban project:

```text
.
├── contracts
│   └── hello_world
│       ├── src
│       │   ├── lib.rs
│       │   └── test.rs
│       └── Cargo.toml
├── Cargo.toml
└── README.md
```

- New Soroban contracts can be put in `contracts`, each in their own directory. There is already a `hello_world` contract in there to get you started.
- If you initialized this project with any other example contracts via `--with-example`, those contracts will be in the `contracts` directory as well.
- Contracts should have their own `Cargo.toml` files that rely on the top-level `Cargo.toml` workspace for their dependencies.
- Frontend libraries can be added to the top-level directory as well. If you initialized this project with a frontend template via `--frontend-template` you will have those files already included.

## Frontend (Next.js)

O app web fica em **`crowdfund-next/`** (Stellar / Soroban + carteiras).

### Vercel

Configure o **Root Directory** do projeto na Vercel como **`crowdfund-next`**. Sem isso, o deploy costuma dar **404**. Passo a passo: [`DEPLOY_VERCEL.md`](./DEPLOY_VERCEL.md).

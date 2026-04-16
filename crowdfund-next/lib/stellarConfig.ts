function env(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Crie um arquivo .env na raiz de crowdfund-next (veja .env.example).`,
    );
  }
  return v.trim();
}

export const HORIZON_URL = env('NEXT_PUBLIC_HORIZON_URL');
export const RPC_URL = env('NEXT_PUBLIC_RPC_URL');
export const NETWORK_PASSPHRASE = env('NEXT_PUBLIC_NETWORK_PASSPHRASE');
export const CONTRACT_ID = env('NEXT_PUBLIC_CONTRACT_ID');
export const CAMPAIGN_ADDRESS = env('NEXT_PUBLIC_CAMPAIGN_ADDRESS');

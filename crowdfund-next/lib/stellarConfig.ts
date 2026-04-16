export type StellarConfig = {
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  campaignAddress: string;
};

const KEYS = [
  'NEXT_PUBLIC_HORIZON_URL',
  'NEXT_PUBLIC_RPC_URL',
  'NEXT_PUBLIC_NETWORK_PASSPHRASE',
  'NEXT_PUBLIC_CONTRACT_ID',
  'NEXT_PUBLIC_CAMPAIGN_ADDRESS',
] as const;

/**
 * Lê configuração em tempo de uso (não no load do módulo), para não derrubar
 * o bundle inteiro na Vercel quando as envs ainda não foram configuradas.
 */
export function readStellarConfig(): StellarConfig | null {
  const raw: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    raw[k] = process.env[k]?.trim();
  }
  for (const k of KEYS) {
    if (!raw[k]) return null;
  }
  return {
    horizonUrl: raw.NEXT_PUBLIC_HORIZON_URL!,
    rpcUrl: raw.NEXT_PUBLIC_RPC_URL!,
    networkPassphrase: raw.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
    contractId: raw.NEXT_PUBLIC_CONTRACT_ID!,
    campaignAddress: raw.NEXT_PUBLIC_CAMPAIGN_ADDRESS!,
  };
}

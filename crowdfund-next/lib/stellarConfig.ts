export type StellarConfig = {
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  campaignAddress: string;
};

export type StellarConfigRead =
  | { ok: true; config: StellarConfig }
  | { ok: false; missing: string[] };

/**
 * Lê variáveis NEXT_PUBLIC_* com nomes literais em cada acesso.
 * Importante no Next.js: `process.env[chaveDinâmica]` no **client** não é
 * inlined no build — fica undefined na Vercel. Acessos explícitos são substituídos
 * pelos valores no momento do deploy.
 */
export function readStellarConfig(): StellarConfigRead {
  const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL?.trim();
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim();
  const networkPassphrase = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE?.trim();
  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID?.trim();
  const campaignAddress = process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS?.trim();

  const missing: string[] = [];
  if (!horizonUrl) missing.push('NEXT_PUBLIC_HORIZON_URL');
  if (!rpcUrl) missing.push('NEXT_PUBLIC_RPC_URL');
  if (!networkPassphrase) missing.push('NEXT_PUBLIC_NETWORK_PASSPHRASE');
  if (!contractId) missing.push('NEXT_PUBLIC_CONTRACT_ID');
  if (!campaignAddress) missing.push('NEXT_PUBLIC_CAMPAIGN_ADDRESS');

  if (missing.length) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    config: {
      horizonUrl: horizonUrl!,
      rpcUrl: rpcUrl!,
      networkPassphrase: networkPassphrase!,
      contractId: contractId!,
      campaignAddress: campaignAddress!,
    },
  };
}

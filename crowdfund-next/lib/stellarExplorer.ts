import { Networks } from '@stellar/stellar-sdk';

const STELLAR_EXPERT_SLUG: Record<string, string> = {
  [Networks.PUBLIC]: 'public',
  [Networks.TESTNET]: 'testnet',
  [Networks.FUTURENET]: 'futurenet',
};

/**
 * URL amigável no Stellar Expert quando a rede é conhecida; senão, link direto no Horizon.
 */
export function transactionExplorerUrl(
  networkPassphrase: string,
  txHash: string,
  horizonBaseUrl?: string,
): string | null {
  const slug = STELLAR_EXPERT_SLUG[networkPassphrase];
  if (slug && txHash) {
    return `https://stellar.expert/explorer/${slug}/tx/${encodeURIComponent(txHash)}`;
  }
  if (horizonBaseUrl && txHash) {
    const base = horizonBaseUrl.replace(/\/$/, '');
    return `${base}/transactions/${encodeURIComponent(txHash)}`;
  }
  return null;
}

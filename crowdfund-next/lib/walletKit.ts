import type { KitEventStateUpdated } from '@creit.tech/stellar-wallets-kit/types';

let kitPromise: Promise<{
  StellarWalletsKit: typeof import('@creit.tech/stellar-wallets-kit/sdk').StellarWalletsKit;
  KitEventType: typeof import('@creit.tech/stellar-wallets-kit/types').KitEventType;
}> | null = null;

/**
 * Inicializa o Stellar Wallets Kit uma vez (testnet) e reutiliza a instância.
 * Deve ser chamado apenas no cliente.
 */
export async function getWalletKit() {
  if (!kitPromise) {
    kitPromise = (async () => {
      const [{ StellarWalletsKit }, { defaultModules }, typesMod] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@creit.tech/stellar-wallets-kit/modules/utils'),
        import('@creit.tech/stellar-wallets-kit/types'),
      ]);
      const { Networks, KitEventType } = typesMod;
      StellarWalletsKit.init({
        modules: defaultModules(),
        network: Networks.TESTNET,
      });
      return { StellarWalletsKit, KitEventType };
    })();
  }
  return kitPromise;
}

export function subscribeWalletState(
  onUpdate: (payload: KitEventStateUpdated['payload']) => void,
): Promise<() => void> {
  return getWalletKit().then(({ StellarWalletsKit, KitEventType }) =>
    StellarWalletsKit.on(KitEventType.STATE_UPDATED, (ev) => {
      onUpdate(ev.payload);
    }),
  );
}

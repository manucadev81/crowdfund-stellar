import * as StellarSdk from '@stellar/stellar-sdk';
import { transactionExplorerUrl } from '@/lib/stellarExplorer';

export type DonationHistoryRow = {
  id: string;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  donor: string;
  amountStroops: bigint;
  totalAfterStroops: bigint;
  explorerUrl: string | null;
};

type RpcEvent = StellarSdk.rpc.Api.EventResponse;

function topicSymbol(topic: StellarSdk.xdr.ScVal): string | null {
  if (topic.switch() !== StellarSdk.xdr.ScValType.scvSymbol()) return null;
  return topic.sym().toString();
}

function hasDonationTopic(topics: StellarSdk.xdr.ScVal[]): boolean {
  return topics.some((t) => topicSymbol(t) === 'DONATION');
}

function scValI128ToBigInt(val: StellarSdk.xdr.ScVal): bigint {
  if (val.switch() !== StellarSdk.xdr.ScValType.scvI128()) {
    throw new Error(`expected i128 ScVal, got ${val.switch().name}`);
  }
  const p = val.i128();
  const lo = BigInt.asUintN(64, BigInt(p.lo().toString()));
  const hi = BigInt.asIntN(64, BigInt(p.hi().toString()));
  return (hi << BigInt(64)) + lo;
}

export function parseDonationEvent(
  evt: RpcEvent,
  networkPassphrase: string,
  horizonUrl: string,
): DonationHistoryRow | null {
  if (evt.type !== 'contract') return null;
  if (!evt.inSuccessfulContractCall) return null;
  if (!hasDonationTopic(evt.topic)) return null;
  if (evt.value.switch() !== StellarSdk.xdr.ScValType.scvVec()) return null;
  const vec = evt.value.vec();
  if (!vec || vec.length !== 3) return null;
  if (vec[0].switch() !== StellarSdk.xdr.ScValType.scvAddress()) return null;
  if (vec[1].switch() !== StellarSdk.xdr.ScValType.scvI128()) return null;
  if (vec[2].switch() !== StellarSdk.xdr.ScValType.scvI128()) return null;

  const donor = StellarSdk.Address.fromScVal(vec[0]).toString();
  const amountStroops = scValI128ToBigInt(vec[1]);
  const totalAfterStroops = scValI128ToBigInt(vec[2]);

  return {
    id: evt.id,
    txHash: evt.txHash,
    ledger: evt.ledger,
    ledgerClosedAt: evt.ledgerClosedAt,
    donor,
    amountStroops,
    totalAfterStroops,
    explorerUrl: transactionExplorerUrl(networkPassphrase, evt.txHash, horizonUrl),
  };
}

export type FetchDonationHistoryOptions = {
  maxPages?: number;
  /** Janela inicial em ledgers (primeira página sem cursor). */
  lookbackLedgers?: number;
  pageLimit?: number;
};

/**
 * Lê eventos on-chain do contrato e monta linhas de doação (evento DONATION).
 */
export async function fetchDonationHistory(
  rpcUrl: string,
  contractId: string,
  networkPassphrase: string,
  horizonUrl: string,
  opts: FetchDonationHistoryOptions = {},
): Promise<{ rows: DonationHistoryRow[]; error?: string }> {
  const maxPages = opts.maxPages ?? 30;
  const lookbackLedgers = opts.lookbackLedgers ?? 400_000;
  const pageLimit = opts.pageLimit ?? 200;

  const rpc = new StellarSdk.rpc.Server(rpcUrl);
  const filter = { type: 'contract' as const, contractIds: [contractId] };
  const byId = new Map<string, DonationHistoryRow>();

  try {
    const latest = await rpc.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - lookbackLedgers);
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const res = cursor
        ? await rpc.getEvents({ filters: [filter], cursor, limit: pageLimit })
        : await rpc.getEvents({ filters: [filter], startLedger, limit: pageLimit });

      if (!res.events.length) break;

      for (const evt of res.events) {
        const row = parseDonationEvent(evt, networkPassphrase, horizonUrl);
        if (row) byId.set(row.id, row);
      }

      cursor = res.cursor;
      if (!cursor) break;
    }

    const rows = [...byId.values()].sort((a, b) => {
      if (b.ledger !== a.ledger) return b.ledger - a.ledger;
      return b.ledgerClosedAt.localeCompare(a.ledgerClosedAt);
    });

    return { rows };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { rows: [], error: msg };
  }
}

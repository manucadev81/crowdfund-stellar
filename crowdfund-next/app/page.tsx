'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletKit, subscribeWalletState } from '@/lib/walletKit';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const CONTRACT_ID = 'CCIXVT52O4B5PGU4XD6FXVDGSVKQZQ4D6NSHL5XOMKURYBO46KTR6YUF';
const CAMPAIGN_ADDRESS = 'GAPDLT5ZUYBXFAH6FZ7FWTRYGFC5QXVYR6JML6FUXKDSKPNLHD2AXXAQ';

function formatPtBR(value: number, minFrac = 2, maxFrac = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

function stroopsToXlmLabel(stroops: number): string {
  return formatPtBR(stroops / 10_000_000);
}

/** Métodos vêm do spec on-chain; o tipo base `Client` não os lista estaticamente. */
type CrowdfundClient = StellarSdk.contract.Client & {
  get_total: () => Promise<{ result: bigint }>;
  get_goal: () => Promise<{ result: bigint }>;
  donate: (args: { donor: string; amount: bigint }) => Promise<
    StellarSdk.contract.AssembledTransaction<unknown>
  >;
};

export default function Home() {
  const [publicKey, setPublicKey] = useState('');
  const [totalRaised, setTotalRaised] = useState(0);
  const [goal, setGoal] = useState(10000000000);
  const [txStatus, setTxStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const eventsCursorRef = useRef<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const client = (await StellarSdk.contract.Client.from({
        contractId: CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
      })) as CrowdfundClient;
      const { result: total } = await client.get_total();
      const { result: g } = await client.get_goal();
      setTotalRaised(Number(total));
      setGoal(Number(g));
      setProgress(Math.min((Number(total) / Number(g)) * 100, 100));
    } catch {
      /* contrato inválido / RPC indisponível */
    }
  }, []);

  const connectWallet = async () => {
    setErrorMsg('');
    try {
      const { StellarWalletsKit } = await getWalletKit();
      const { address } = await StellarWalletsKit.authModal();
      setPublicKey(address);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/close|dismiss|cancel|reject|user/i.test(msg)) {
        setErrorMsg(
          msg ||
            'Não foi possível abrir as carteiras. Use o botão abaixo e escolha Freighter, xBull, Albedo, etc.',
        );
      }
    }
  };

  const disconnectWallet = async () => {
    try {
      const { StellarWalletsKit } = await getWalletKit();
      await StellarWalletsKit.disconnect();
    } finally {
      setPublicKey('');
      setErrorMsg('');
    }
  };

  const makeDonation = async (amountXLM: string) => {
    if (!publicKey) return alert('Conecte uma carteira!');
    setTxStatus('PENDING');
    setErrorMsg('');

    try {
      const { StellarWalletsKit } = await getWalletKit();
      const server = new StellarSdk.Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(publicKey);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: CAMPAIGN_ADDRESS,
            asset: StellarSdk.Asset.native(),
            amount: amountXLM,
          }),
        )
        .setTimeout(180)
        .build();

      const signed = await StellarWalletsKit.signTransaction(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: publicKey,
      });
      const horizonTx = new StellarSdk.Transaction(signed.signedTxXdr, NETWORK_PASSPHRASE);
      await server.submitTransaction(horizonTx);

      const contractClient = (await StellarSdk.contract.Client.from({
        contractId: CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: (xdr, opts) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
            address: opts?.address ?? publicKey,
          }),
      })) as CrowdfundClient;

      const donateTx = await contractClient.donate({
        donor: publicKey,
        amount: BigInt(Math.round(parseFloat(amountXLM) * 10_000_000)),
      });
      await donateTx.signAndSend();

      setTxStatus('SUCCESS');
      fetchProgress();
    } catch (err: unknown) {
      setTxStatus('FAILED');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('AlreadyInitialized')) setErrorMsg('Erro 1: Campanha já inicializada');
      else if (
        msg.includes('InvalidAmount') ||
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          (err as { response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } } }).response?.data?.extras?.result_codes?.operations?.includes(
            'op_bad_auth',
          ))
      ) {
        setErrorMsg('Erro 2: Valor de doação inválido');
      } else if (msg.includes('GoalReached')) setErrorMsg('Erro 3: Meta já atingida');
      else if (/reject|denied|cancel/i.test(msg)) setErrorMsg('Operação cancelada na carteira.');
      else setErrorMsg('Erro: ' + msg);
    }
  };

  /** Sincroniza totais na carga e periodicamente (qualquer visitante). */
  useEffect(() => {
    fetchProgress();
    const interval = setInterval(fetchProgress, 4000);
    return () => clearInterval(interval);
  }, [fetchProgress]);

  /** Troca de conta / rede na carteira (multi-wallet). */
  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    subscribeWalletState((payload) => {
      if (!cancelled) setPublicKey(payload.address ?? '');
    }).then((unsub) => {
      off = unsub;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  /**
   * Soroban getEvents: quando há novos eventos do contrato, atualiza a UI
   * (integração “tempo real” com o ledger, sem WebSocket obrigatório).
   */
  useEffect(() => {
    const rpc = new StellarSdk.rpc.Server(RPC_URL);
    const pollEvents = async () => {
      try {
        const filter = { type: 'contract' as const, contractIds: [CONTRACT_ID] };
        const res = eventsCursorRef.current
          ? await rpc.getEvents({
              filters: [filter],
              cursor: eventsCursorRef.current,
              limit: 40,
            })
          : await (async () => {
              const latest = await rpc.getLatestLedger();
              const start = Math.max(1, latest.sequence - 2500);
              return rpc.getEvents({
                filters: [filter],
                startLedger: start,
                limit: 40,
              });
            })();
        eventsCursorRef.current = res.cursor;
        if (res.events.length > 0) fetchProgress();
      } catch {
        /* RPC pode limitar startLedger em alguns momentos */
      }
    };
    pollEvents();
    const id = setInterval(pollEvents, 6000);
    return () => clearInterval(id);
  }, [fetchProgress]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2">Stellar Crowdfunding</h1>
        <p className="text-center text-zinc-400 mb-2">
          Multi-wallet (Freighter, xBull, Albedo, WalletConnect, …) + contrato na testnet
        </p>
        <p className="text-center text-zinc-500 text-sm mb-8">
          Atualização em tempo quase real via Soroban <code className="text-zinc-400">getEvents</code> e leitura
          on-chain
        </p>

        <div className="flex flex-col gap-3 mb-8">
          <button
            type="button"
            onClick={connectWallet}
            className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-xl text-lg font-semibold"
          >
            {publicKey ? `Conectado: ${publicKey.slice(0, 8)}…` : 'Conectar carteira'}
          </button>
          {publicKey ? (
            <button
              type="button"
              onClick={disconnectWallet}
              className="w-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800 py-3 rounded-xl text-sm"
            >
              Desconectar
            </button>
          ) : null}
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 mb-8">
          <div className="flex justify-between text-sm mb-3">
            <span>Arrecadado</span>
            <span>Meta</span>
          </div>
          <div className="h-4 bg-zinc-800 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-3xl font-mono">
            <span>{stroopsToXlmLabel(totalRaised)} XLM</span>
            <span>{stroopsToXlmLabel(goal)} XLM</span>
          </div>
          <p className="text-center text-emerald-400 mt-2">{formatPtBR(progress, 0, 1)}% atingido</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[10, 50, 100].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => makeDonation(amt.toString())}
              className="bg-emerald-600 hover:bg-emerald-700 py-6 rounded-2xl text-xl font-bold"
            >
              Doar {amt} XLM
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p
            className={`text-lg font-semibold ${
              txStatus === 'SUCCESS' ? 'text-emerald-400' : txStatus === 'FAILED' ? 'text-red-400' : 'text-yellow-400'
            }`}
          >
            {txStatus === 'PENDING' && 'Processando…'}
            {txStatus === 'SUCCESS' && 'Doação enviada!'}
            {txStatus === 'FAILED' && 'Falhou'}
          </p>
          {errorMsg ? <p className="text-red-500 mt-2 text-sm">{errorMsg}</p> : null}
        </div>

        {publicKey ? (
          <p className="text-xs text-zinc-500 text-center mt-12">
            Campanha: <span className="font-mono">{CAMPAIGN_ADDRESS.slice(0, 12)}…</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

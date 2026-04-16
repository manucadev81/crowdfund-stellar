'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletKit, subscribeWalletState } from '@/lib/walletKit';
import { readStellarConfig } from '@/lib/stellarConfig';

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

function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex items-center justify-center">
      <div className="max-w-lg rounded-2xl border border-amber-500/40 bg-zinc-900/80 p-8 text-center">
        <h1 className="text-xl font-semibold text-amber-200 mb-3">Configuração incompleta</h1>
        <p className="text-zinc-300 text-sm mb-3">
          O arquivo <code className="text-amber-100/90">.env</code> da sua máquina{' '}
          <strong className="text-amber-100">não é enviado</strong> para a Vercel. Cadastre as variáveis no
          projeto: <strong>Settings → Environment Variables</strong>, marque Production (e Preview se quiser), depois
          faça um <strong>Redeploy</strong>.
        </p>
        <p className="text-zinc-400 text-xs mb-3">Variáveis ausentes neste deploy:</p>
        <ul className="mb-4 rounded-lg bg-zinc-950/80 px-4 py-3 text-left font-mono text-xs text-amber-100/90">
          {missing.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <p className="text-zinc-500 text-xs mb-2">
          Modelo: <code className="text-zinc-400">crowdfund-next/.env.example</code> no repositório.
        </p>
        <p className="text-zinc-500 text-xs">
          Diagnóstico no servidor: abra{' '}
          <a href="/api/env-check" className="text-sky-400 underline">
            /api/env-check
          </a>{' '}
          (mostra quais chaves o deploy enxerga, sem revelar valores).
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const stellar = useMemo(() => readStellarConfig(), []);
  const cfg = stellar.ok ? stellar.config : null;
  const [publicKey, setPublicKey] = useState('');
  const [totalRaised, setTotalRaised] = useState(0);
  const [goal, setGoal] = useState(10000000000);
  const [txStatus, setTxStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const eventsCursorRef = useRef<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!cfg) return;
    try {
      const client = (await StellarSdk.contract.Client.from({
        contractId: cfg.contractId,
        networkPassphrase: cfg.networkPassphrase,
        rpcUrl: cfg.rpcUrl,
      })) as CrowdfundClient;
      const { result: total } = await client.get_total();
      const { result: g } = await client.get_goal();
      const totalN = Number(total);
      const goalN = Number(g);
      setTotalRaised(totalN);
      setGoal(goalN);
      const pct = goalN > 0 ? Math.min((totalN / goalN) * 100, 100) : 0;
      setProgress(pct);
    } catch {
      /* contrato inválido / RPC indisponível */
    }
  }, [cfg]);

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
    if (!cfg) return;
    if (!publicKey) return alert('Conecte uma carteira!');
    setTxStatus('PENDING');
    setErrorMsg('');

    try {
      const { StellarWalletsKit } = await getWalletKit();
      const server = new StellarSdk.Horizon.Server(cfg.horizonUrl);
      const account = await server.loadAccount(publicKey);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: cfg.campaignAddress,
            asset: StellarSdk.Asset.native(),
            amount: amountXLM,
          }),
        )
        .setTimeout(180)
        .build();

      const signed = await StellarWalletsKit.signTransaction(tx.toXDR(), {
        networkPassphrase: cfg.networkPassphrase,
        address: publicKey,
      });
      const horizonTx = new StellarSdk.Transaction(signed.signedTxXdr, cfg.networkPassphrase);
      await server.submitTransaction(horizonTx);

      const contractClient = (await StellarSdk.contract.Client.from({
        contractId: cfg.contractId,
        networkPassphrase: cfg.networkPassphrase,
        rpcUrl: cfg.rpcUrl,
        publicKey,
        signTransaction: (xdr, opts) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? cfg.networkPassphrase,
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

  useEffect(() => {
    if (!cfg) return;
    fetchProgress();
    const interval = setInterval(fetchProgress, 4000);
    return () => clearInterval(interval);
  }, [cfg, fetchProgress]);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    subscribeWalletState((payload) => {
      if (!cancelled) setPublicKey(payload.address ?? '');
    })
      .then((unsub) => {
        if (!cancelled) off = unsub;
      })
      .catch(() => {
        /* kit pode falhar em iframes / preview restrito — não derruba a página */
      });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    if (!cfg) return;
    const rpc = new StellarSdk.rpc.Server(cfg.rpcUrl);
    const pollEvents = async () => {
      try {
        const filter = { type: 'contract' as const, contractIds: [cfg.contractId] };
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
  }, [cfg, fetchProgress]);

  if (!cfg) {
    return <ConfigMissing missing={stellar.ok === false ? stellar.missing : []} />;
  }

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
            Campanha: <span className="font-mono">{cfg.campaignAddress.slice(0, 12)}…</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletKit, subscribeWalletState } from '@/lib/walletKit';
import { readStellarConfig, type StellarConfig } from '@/lib/stellarConfig';
import { transactionExplorerUrl } from '@/lib/stellarExplorer';
import { fetchDonationHistory, formatUnknownError, type DonationHistoryRow } from '@/lib/donationHistory';

function formatPtBR(value: number, minFrac = 2, maxFrac = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

function stroopsToXlmLabel(stroops: number): string {
  return formatPtBR(stroops / 10_000_000);
}

function stroopsBigintToXlmLabel(stroops: bigint): string {
  return formatPtBR(Number(stroops) / 10_000_000);
}

function shortAccount(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
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
  const cfgRef = useRef<StellarConfig | null>(null);
  cfgRef.current = cfg;

  const configKey = useMemo(
    () =>
      stellar.ok
        ? `${stellar.config.rpcUrl}|${stellar.config.contractId}|${stellar.config.networkPassphrase}|${stellar.config.horizonUrl}`
        : '',
    [stellar],
  );

  const [publicKey, setPublicKey] = useState('');
  const [totalRaised, setTotalRaised] = useState(0);
  const [goal, setGoal] = useState(10000000000);
  const [txStatus, setTxStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [explorerLinks, setExplorerLinks] = useState<{
    payment?: string;
    soroban?: string;
  } | null>(null);
  const [donationHistory, setDonationHistory] = useState<DonationHistoryRow[]>([]);
  const [donationHistoryLoading, setDonationHistoryLoading] = useState(false);
  const [donationHistoryError, setDonationHistoryError] = useState('');
  const eventsCursorRef = useRef<string | null>(null);
  const readClientCache = useRef<{ key: string; client: CrowdfundClient | null }>({ key: '', client: null });
  /** Incrementado no cleanup dos efeitos para ignorar respostas antigas (troca de rede / desmontagem). */
  const donationHistoryEpoch = useRef(0);

  const getReadClient = useCallback(async (c: StellarConfig) => {
    const key = `${c.contractId}|${c.rpcUrl}|${c.networkPassphrase}`;
    if (readClientCache.current.key === key && readClientCache.current.client) {
      return readClientCache.current.client;
    }
    const client = (await StellarSdk.contract.Client.from({
      contractId: c.contractId,
      networkPassphrase: c.networkPassphrase,
      rpcUrl: c.rpcUrl,
    })) as CrowdfundClient;
    readClientCache.current = { key, client };
    return client;
  }, []);

  const fetchProgress = useCallback(async () => {
    const c = cfgRef.current;
    if (!c) return;
    try {
      const client = await getReadClient(c);
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
  }, [getReadClient]);

  const fetchProgressRef = useRef(fetchProgress);
  fetchProgressRef.current = fetchProgress;

  const loadDonationHistory = useCallback(async (mode: 'full' | 'soft' = 'full') => {
    const c = cfgRef.current;
    if (!c) return;
    const epoch = donationHistoryEpoch.current;
    if (mode === 'full') setDonationHistoryLoading(true);
    setDonationHistoryError('');
    const { rows, error } = await fetchDonationHistory(
      c.rpcUrl,
      c.contractId,
      c.networkPassphrase,
      c.horizonUrl,
      mode === 'soft'
        ? { maxPages: 3, lookbackLedgers: 12_000, pageLimit: 200 }
        : { maxPages: 12, lookbackLedgers: 150_000, pageLimit: 200 },
    );
    if (epoch !== donationHistoryEpoch.current) return;
    if (error) setDonationHistoryError(formatUnknownError(error));
    setDonationHistory(rows);
    if (mode === 'full') setDonationHistoryLoading(false);
  }, []);

  const loadDonationHistoryRef = useRef(loadDonationHistory);
  loadDonationHistoryRef.current = loadDonationHistory;

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
    setExplorerLinks(null);

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
      const paymentSubmit = (await server.submitTransaction(horizonTx)) as { hash?: string };
      const paymentHash = paymentSubmit.hash;

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
      const sent = await donateTx.signAndSend();
      const sorobanHash = sent.sendTransactionResponse?.hash;

      setExplorerLinks({
        payment: paymentHash
          ? transactionExplorerUrl(cfg.networkPassphrase, paymentHash, cfg.horizonUrl) ?? undefined
          : undefined,
        soroban: sorobanHash
          ? transactionExplorerUrl(cfg.networkPassphrase, sorobanHash, cfg.horizonUrl) ?? undefined
          : undefined,
      });

      setTxStatus('SUCCESS');
      fetchProgress();
      void loadDonationHistory('soft');
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
    if (!configKey) return;
    void fetchProgressRef.current();
    const interval = setInterval(() => void fetchProgressRef.current(), 10_000);
    return () => clearInterval(interval);
  }, [configKey]);

  useEffect(() => {
    if (!configKey) return;
    void loadDonationHistoryRef.current('full');
    const id = setInterval(() => void loadDonationHistoryRef.current('soft'), 120_000);
    return () => {
      donationHistoryEpoch.current += 1;
      clearInterval(id);
    };
  }, [configKey]);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    subscribeWalletState((payload) => {
      if (cancelled) return;
      const addr = payload.address ?? '';
      setPublicKey((prev) => (prev === addr ? prev : addr));
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
    if (!configKey) return;
    const c = cfgRef.current;
    if (!c) return;
    const rpc = new StellarSdk.rpc.Server(c.rpcUrl);
    const filter = { type: 'contract' as const, contractIds: [c.contractId] };

    const pollEvents = async () => {
      try {
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
        if (res.events.length > 0) void fetchProgressRef.current();
      } catch {
        /* RPC pode limitar startLedger em alguns momentos */
      }
    };

    void pollEvents();
    const id = setInterval(() => void pollEvents(), 15_000);
    return () => {
      clearInterval(id);
      eventsCursorRef.current = null;
    };
  }, [configKey]);

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
          {txStatus === 'SUCCESS' && explorerLinks && (explorerLinks.payment || explorerLinks.soroban) ? (
            <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-300">
              {explorerLinks.payment ? (
                <a
                  href={explorerLinks.payment}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline hover:text-sky-300"
                >
                  Ver transação de pagamento (XLM) no explorador
                </a>
              ) : null}
              {explorerLinks.soroban ? (
                <a
                  href={explorerLinks.soroban}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline hover:text-sky-300"
                >
                  Ver transação do contrato (Soroban) no explorador
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-14 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Histórico de doações</h2>
            <button
              type="button"
              onClick={() => void loadDonationHistory('full')}
              disabled={donationHistoryLoading}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {donationHistoryLoading ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
          {donationHistoryError ? (
            <p className="text-sm text-amber-400/90 mb-3">
              Não foi possível carregar o histórico: {donationHistoryError}
            </p>
          ) : null}
          {donationHistoryLoading && donationHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">Carregando eventos on-chain…</p>
          ) : null}
          {!donationHistoryLoading && donationHistory.length === 0 && !donationHistoryError ? (
            <p className="text-sm text-zinc-500">Nenhuma doação registrada no contrato ainda.</p>
          ) : null}
          {donationHistory.length > 0 ? (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Carteira (doador)</th>
                    <th className="py-2 pr-3 font-medium text-right">Valor</th>
                    <th className="py-2 pr-3 font-medium text-right">Total após</th>
                    <th className="py-2 font-medium">Transação</th>
                  </tr>
                </thead>
                <tbody>
                  {donationHistory.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/80 text-zinc-200">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-zinc-400">
                        {new Date(row.ledgerClosedAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs" title={row.donor}>
                        {shortAccount(row.donor)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono">{stroopsBigintToXlmLabel(row.amountStroops)} XLM</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-zinc-400">
                        {stroopsBigintToXlmLabel(row.totalAfterStroops)} XLM
                      </td>
                      <td className="py-2.5">
                        {row.explorerUrl ? (
                          <a
                            href={row.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 underline hover:text-sky-300"
                          >
                            Ver no explorador
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-zinc-500" title={row.txHash}>
                            {shortAccount(row.txHash)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-zinc-600">
            Fonte: eventos <code className="text-zinc-500">DONATION</code> do contrato (Soroban). A lista cobre a
            janela de ledgers suportada pelo RPC.
          </p>
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

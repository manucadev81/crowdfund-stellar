import { NextResponse } from 'next/server';

/**
 * Diagnóstico: mostra se cada NEXT_PUBLIC_* está definida no **runtime do servidor**
 * (útil após configurar a Vercel). Não expõe valores.
 */
export async function GET() {
  const checks = {
    NEXT_PUBLIC_HORIZON_URL: Boolean(process.env.NEXT_PUBLIC_HORIZON_URL?.trim()),
    NEXT_PUBLIC_RPC_URL: Boolean(process.env.NEXT_PUBLIC_RPC_URL?.trim()),
    NEXT_PUBLIC_NETWORK_PASSPHRASE: Boolean(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE?.trim()),
    NEXT_PUBLIC_CONTRACT_ID: Boolean(process.env.NEXT_PUBLIC_CONTRACT_ID?.trim()),
    NEXT_PUBLIC_CAMPAIGN_ADDRESS: Boolean(process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS?.trim()),
  };
  const allOk = Object.values(checks).every(Boolean);
  return NextResponse.json(
    {
      ok: allOk,
      vars: checks,
      hint: allOk
        ? 'Variáveis visíveis no servidor. Se a home ainda reclama, faça Redeploy após salvar na Vercel.'
        : 'Alguma variável falta no ambiente deste deploy (Vercel → Settings → Environment Variables → Production).',
    },
    { status: 200 },
  );
}

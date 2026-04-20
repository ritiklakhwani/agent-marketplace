"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  DEFAULT_DELEGATION_MICRO_USDC,
  USDC_DECIMALS,
  buildApproveDelegationTx,
  getDelegationStatus,
  type DelegationStatus,
} from "@/lib/delegation";

const USDC_MINT_STR =
  process.env.NEXT_PUBLIC_USDC_DEVNET_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DELEGATE_PUBKEY_STR = process.env.NEXT_PUBLIC_AGENT_HOT_WALLET_PUBKEY ?? "";

type Phase = "idle" | "checking" | "signing" | "confirming" | "ready" | "error";

function formatUsdc(micro: bigint): string {
  return (Number(micro) / 10 ** USDC_DECIMALS).toFixed(2);
}

export function ApproveDelegation() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey || !DELEGATE_PUBKEY_STR) return;
    setPhase("checking");
    try {
      const s = await getDelegationStatus(
        connection,
        publicKey,
        new PublicKey(USDC_MINT_STR),
        new PublicKey(DELEGATE_PUBKEY_STR),
      );
      setStatus(s);
      setPhase(s.isActive ? "ready" : "idle");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = async () => {
    if (!publicKey || !signTransaction) return;
    if (!DELEGATE_PUBKEY_STR) {
      setError("NEXT_PUBLIC_AGENT_HOT_WALLET_PUBKEY missing in env");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("signing");
    try {
      const { transaction } = await buildApproveDelegationTx(
        connection,
        publicKey,
        new PublicKey(USDC_MINT_STR),
        new PublicKey(DELEGATE_PUBKEY_STR),
      );
      const signed = await signTransaction(transaction);
      setPhase("confirming");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      setLastTxSig(sig);
      await connection.confirmTransaction(sig, "confirmed");
      await refresh();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  if (!publicKey) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Connect a wallet to authorize AgentBazaar to move USDC on your behalf.
      </section>
    );
  }

  if (!DELEGATE_PUBKEY_STR) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        Delegation target not configured. Set
        <code className="mx-1 rounded bg-rose-100 px-1">NEXT_PUBLIC_AGENT_HOT_WALLET_PUBKEY</code>
        in .env.local.
      </section>
    );
  }

  if (status && !status.userAtaExists) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">No devnet USDC in this wallet.</p>
        <p className="mt-1">
          Visit <a className="underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>, select Solana Devnet, paste your wallet address, and request USDC. Then click &quot;Refresh&quot; below.
        </p>
        <button
          onClick={refresh}
          className="mt-2 rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50"
        >
          Refresh
        </button>
      </section>
    );
  }

  if (status?.isActive) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">
          Authorization active · {formatUsdc(status.delegatedAmount)} USDC remaining
        </p>
        <p className="mt-1 text-emerald-800">
          AgentBazaar can spend up to this amount from your wallet to pay agents. Each rebalance consumes ~1 USDC.
        </p>
        <div className="mt-1 text-xs text-emerald-700">
          Wallet balance: {formatUsdc(status.balance)} USDC
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-900">
        Step 1 · Authorize AgentBazaar
      </p>
      <p className="mt-1 text-sm text-zinc-600">
        One-time approval lets AgentBazaar spend up to {formatUsdc(DEFAULT_DELEGATION_MICRO_USDC)} USDC from your wallet to pay agents for tasks. You can revoke at any time.
      </p>

      {status ? (
        <div className="mt-2 text-xs text-zinc-500">
          Balance: {formatUsdc(status.balance)} USDC
          {status.delegate ? (
            <> · Existing delegate: {status.delegate.toBase58().slice(0, 8)}...</>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={phase === "signing" || phase === "confirming" || phase === "checking"}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
        >
          {phase === "signing" && "Sign in wallet..."}
          {phase === "confirming" && "Confirming..."}
          {phase === "checking" && "Checking..."}
          {(phase === "idle" || phase === "error") && `Approve ${formatUsdc(DEFAULT_DELEGATION_MICRO_USDC)} USDC`}
          {phase === "ready" && "Approved"}
        </button>
        <button
          onClick={refresh}
          disabled={phase === "signing" || phase === "confirming"}
          className="text-xs text-zinc-500 underline disabled:text-zinc-300"
        >
          Refresh
        </button>
      </div>

      {lastTxSig ? (
        <a
          href={`https://explorer.solana.com/tx/${lastTxSig}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-xs text-zinc-500 underline"
        >
          Last approval tx: {lastTxSig.slice(0, 12)}...
        </a>
      ) : null}
    </section>
  );
}

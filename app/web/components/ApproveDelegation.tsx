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

/**
 * Compact delegation control — designed to live in the nav bar next to the
 * wallet button. Three visual states:
 *
 * - "Approve 20 USDC" button (dark) when no active delegation
 * - "20.00 USDC" pill (green dot) with expandable tooltip when authorized
 * - "Get USDC" amber pill when the user's ATA doesn't exist yet
 */
export function ApproveDelegation() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<DelegationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);

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
      await connection.confirmTransaction(sig, "confirmed");
      await refresh();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("already been processed")) {
        await refresh();
        return;
      }
      if (msg.includes("User rejected")) {
        setPhase("idle");
        return;
      }
      setError(msg);
      setPhase("error");
    }
  };

  if (!publicKey || !DELEGATE_PUBKEY_STR) return null;

  // No ATA — user has Phantom but no devnet USDC yet
  if (status && !status.userAtaExists) {
    return (
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noreferrer"
        className="text-[12px] font-medium px-3 py-1.5 flex items-center gap-2 transition-opacity hover:opacity-80"
        style={{ background: "rgba(245,158,11,0.12)", color: "#92400e" }}
        title="Get devnet USDC from Circle's faucet, then refresh"
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#d97706" }} />
        Get USDC
      </a>
    );
  }

  // Authorized — compact pill with hover tooltip
  if (status?.isActive) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div
          className="text-[12px] font-medium px-3 py-1.5 flex items-center gap-2 cursor-default"
          style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full live-dot"
            style={{ background: "var(--color-positive)" }}
          />
          <span className="font-mono tabular-nums text-text-primary">
            {formatUsdc(status.delegatedAmount)}
          </span>
          <span className="text-text-tertiary">USDC</span>
        </div>

        {isHovering ? (
          <div
            className="absolute right-0 top-full mt-2 z-50 min-w-[240px] px-4 py-3"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.22)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Delegation
            </p>
            <p className="mt-1 text-[12px] text-text-primary">
              Remaining to spend:{" "}
              <span className="font-mono tabular-nums font-semibold">
                {formatUsdc(status.delegatedAmount)}
              </span>{" "}
              USDC
            </p>
            <p className="mt-0.5 text-[12px] text-text-secondary">
              Wallet balance:{" "}
              <span className="font-mono tabular-nums">
                {formatUsdc(status.balance)}
              </span>{" "}
              USDC
            </p>
            <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed">
              Each rebalance consumes ~1 USDC from this allowance.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  // Not authorized — compact dark button
  const busy = phase === "signing" || phase === "confirming" || phase === "checking";
  return (
    <div className="relative">
      <button
        onClick={handleApprove}
        disabled={busy}
        className="text-[12px] font-medium px-3 py-1.5 border-none cursor-pointer transition-colors duration-150 flex items-center gap-2"
        style={
          busy
            ? { background: "rgba(0,0,0,0.05)", color: "#a1a1aa", cursor: "not-allowed" }
            : { background: "#111111", color: "#ffffff" }
        }
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f59e0b" }} />
        {phase === "signing"
          ? "Sign in wallet…"
          : phase === "confirming"
            ? "Confirming…"
            : phase === "checking"
              ? "Checking…"
              : `Approve ${formatUsdc(DEFAULT_DELEGATION_MICRO_USDC)} USDC`}
      </button>

      {error ? (
        <div
          className="absolute right-0 top-full mt-2 z-50 min-w-[240px] max-w-[320px] px-4 py-3 text-[11px]"
          style={{
            background: "var(--color-negative-dim)",
            border: "1px solid rgba(220,38,38,0.22)",
            color: "var(--color-negative)",
          }}
        >
          {error.slice(0, 200)}
        </div>
      ) : null}
    </div>
  );
}

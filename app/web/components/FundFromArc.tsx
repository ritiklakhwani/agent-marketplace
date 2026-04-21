"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";

const ARC_EXPLORER =
  process.env.NEXT_PUBLIC_ARC_EXPLORER ?? "https://testnet.arcscan.io";

type StepState = "idle" | "pending" | "complete" | "failed";

type Step = {
  key: "burn" | "attest" | "mint";
  label: string;
  state: StepState;
  detail?: string;
};

const DEFAULT_AMOUNT = 1;

export function FundFromArc() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [steps, setSteps] = useState<Step[]>([
    { key: "burn", label: "Burn USDC on Arc", state: "idle" },
    { key: "attest", label: "Circle attestation", state: "idle" },
    { key: "mint", label: "Mint USDC on Solana", state: "idle" },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);

  const setStep = useCallback((key: Step["key"], patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const handleFund = async () => {
    if (!publicKey) {
      setError("Connect your wallet first");
      return;
    }
    setError(null);
    setIsRunning(true);
    setBalanceAfter(null);
    setSteps((prev) => prev.map((s) => ({ ...s, state: "idle", detail: undefined })));

    // Snapshot current USDC balance so we can show the delta after the flow
    try {
      const usdcMint = process.env.NEXT_PUBLIC_USDC_DEVNET_MINT!;
      const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: new (await import("@solana/web3.js")).PublicKey(usdcMint),
      });
      const pre = accounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      setBalanceBefore(pre);
    } catch {
      // non-fatal — delta display skipped
    }

    try {
      const res = await fetch("/api/cctp/fund-from-arc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: publicKey.toBase58(),
          amount: DEFAULT_AMOUNT,
        }),
      });
      if (!res.ok) {
        throw new Error(`/api/cctp/fund-from-arc failed: ${res.status}`);
      }
      const { taskId: id } = (await res.json()) as { taskId: string };
      setTaskId(id);

      // Subscribe to SSE for step-by-step progress
      const es = new EventSource(`/api/sse/task/${id}`);
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.type === "execution_step") {
          if (data.stepIndex === 0) {
            setStep("burn", {
              state: data.status,
              detail: data.label,
            });
          } else if (data.stepIndex === 1) {
            setStep("attest", {
              state: data.status,
              detail: data.label,
            });
          } else if (data.stepIndex === 2) {
            setStep("mint", {
              state: data.status,
              detail: data.label,
            });
          } else if (data.status === "failed") {
            setError(data.label);
            setIsRunning(false);
          }
        } else if (data.type === "task_complete") {
          setIsRunning(false);
          es.close();
          // Refresh balance after ~2s to catch final state
          setTimeout(async () => {
            if (!publicKey) return;
            try {
              const { PublicKey: PK } = await import("@solana/web3.js");
              const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                mint: new PK(process.env.NEXT_PUBLIC_USDC_DEVNET_MINT!),
              });
              const post = accounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
              setBalanceAfter(post);
            } catch {}
          }, 2500);
        }
      };
      es.onerror = () => {
        es.close();
        setIsRunning(false);
      };
    } catch (e) {
      setError(String(e));
      setIsRunning(false);
    }
  };

  return (
    <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-sky-50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Fund from Arc · Circle CCTP V2
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Bridge USDC from Circle Arc testnet into your Solana wallet. Admin burns on Arc, Circle attests, your Solana ATA is credited.
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800">
          Cross-chain
        </span>
      </div>

      {!publicKey ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Connect your wallet to receive bridged USDC.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {steps.map((step, idx) => (
            <motion.div
              key={step.key}
              layout
              initial={false}
              animate={{
                backgroundColor:
                  step.state === "complete"
                    ? "#ecfdf5"
                    : step.state === "failed"
                      ? "#fef2f2"
                      : step.state === "pending"
                        ? "#eff6ff"
                        : "#fafafa",
              }}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              <span
                className={`inline-block h-6 w-6 rounded-full text-center text-xs font-semibold leading-6 ${
                  step.state === "complete"
                    ? "bg-emerald-500 text-white"
                    : step.state === "failed"
                      ? "bg-rose-500 text-white"
                      : step.state === "pending"
                        ? "bg-sky-500 text-white"
                        : "bg-zinc-300 text-zinc-600"
                }`}
              >
                {step.state === "complete" ? "✓" : step.state === "failed" ? "✕" : idx + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium text-zinc-900">{step.label}</p>
                {step.detail ? (
                  <p className="text-xs text-zinc-500">{step.detail}</p>
                ) : null}
              </div>
              {step.state === "pending" ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
              ) : null}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {balanceAfter !== null && balanceBefore !== null ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            Your Solana USDC balance: {balanceBefore.toFixed(2)} → <strong>{balanceAfter.toFixed(2)}</strong>{" "}
            ({(balanceAfter - balanceBefore).toFixed(2)} USDC bridged from Arc)
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          {error}
        </p>
      ) : null}

      {taskId ? (
        <p className="mt-2 text-xs text-zinc-500">
          Task {taskId} — see{" "}
          <a
            href={ARC_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-900"
          >
            Arc Explorer
          </a>{" "}
          for the burn tx.
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Funds {DEFAULT_AMOUNT} USDC to your wallet. Arc attestation takes 2-5 min.
        </p>
        <button
          onClick={handleFund}
          disabled={!publicKey || isRunning}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
        >
          {isRunning ? "Bridging..." : `Fund ${DEFAULT_AMOUNT} USDC from Arc`}
        </button>
      </div>
    </section>
  );
}

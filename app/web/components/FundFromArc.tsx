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
const B = "rgba(0,0,0,0.22)";

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
      if (!res.ok) throw new Error(`/api/cctp/fund-from-arc failed: ${res.status}`);
      const { taskId: id } = (await res.json()) as { taskId: string };
      setTaskId(id);

      const es = new EventSource(`/api/sse/task/${id}`);
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.type === "execution_step") {
          if (data.stepIndex === 0) setStep("burn",   { state: data.status, detail: data.label });
          else if (data.stepIndex === 1) setStep("attest", { state: data.status, detail: data.label });
          else if (data.stepIndex === 2) setStep("mint",   { state: data.status, detail: data.label });
          else if (data.status === "failed") {
            setError(data.label);
            setIsRunning(false);
          }
        } else if (data.type === "task_complete") {
          setIsRunning(false);
          es.close();
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

  if (!publicKey) return null;

  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      {/* Header row */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${B}` }}
      >
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            Fund from Arc
          </p>
          <p className="text-[12px] text-text-tertiary">
            Circle CCTP V2 · Arc → Solana
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status pill: red "Cross-chain" during idle/running, green delta
              once the bridged USDC lands on Solana. */}
          <AnimatePresence mode="wait">
            {balanceAfter !== null && balanceBefore !== null ? (
              <motion.span
                key="delta"
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-[12px] font-medium px-3 py-1 font-mono tabular-nums"
                style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}
                title={`Solana USDC balance ${balanceBefore.toFixed(2)} → ${balanceAfter.toFixed(2)}`}
              >
                +{(balanceAfter - balanceBefore).toFixed(2)} USDC
              </motion.span>
            ) : (
              <motion.span
                key="badge"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[12px] font-medium px-3 py-1"
                style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
              >
                Cross-chain
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={handleFund}
            disabled={isRunning}
            className="text-[12px] font-medium px-4 py-2 border-none cursor-pointer transition-colors duration-150"
            style={
              isRunning
                ? { background: "rgba(0,0,0,0.05)", color: "#a1a1aa", cursor: "not-allowed" }
                : { background: "#111111", color: "#ffffff" }
            }
          >
            {isRunning ? "Bridging…" : `Fund ${DEFAULT_AMOUNT} USDC`}
          </button>
        </div>
      </div>

      {/* 3-step progress grid — each step has a fill-bar background that
          animates left→right while pending and snaps green on complete.
          Uses transform: scaleX() (GPU-accelerated) for silky-smooth motion. */}
      <div className="grid grid-cols-3">
        {steps.map((step, idx) => {
          // Per-step expected duration so the bar paces with real latency.
          const expectedDurationSec =
            step.key === "burn" ? 15 : step.key === "attest" ? 75 : 10;

          const fillColor =
            step.state === "complete"
              ? "rgba(22,163,74,0.14)"
              : step.state === "failed"
                ? "rgba(220,38,38,0.14)"
                : step.state === "pending"
                  ? "rgba(37,99,235,0.10)"
                  : "transparent";

          const targetScale =
            step.state === "complete" || step.state === "failed"
              ? 1
              : step.state === "pending"
                ? 0.92
                : 0;

          return (
            <div
              key={step.key}
              className="relative px-5 flex items-center gap-3 overflow-hidden"
              style={{
                // Fixed height so when step.detail populates (adds a second
                // text line), the cell doesn't grow and push sibling
                // sections out. Detail truncates within this envelope.
                height: 56,
                ...(idx < 2 ? { borderRight: `1px solid ${B}` } : {}),
              }}
            >
              {/* Progress fill — scaleX from the left edge, GPU-accelerated */}
              <motion.div
                className="absolute inset-0 pointer-events-none origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: targetScale, background: fillColor }}
                transition={{
                  scaleX:
                    step.state === "pending"
                      ? { duration: expectedDurationSec, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                  background: { duration: 0.35, ease: "easeOut" },
                }}
                style={{ willChange: "transform" }}
              />

              {/* Content sits on top of the fill */}
              <span
                className="relative text-[11px] font-mono tabular-nums w-6 inline-block text-center font-semibold"
                style={{
                  color:
                    step.state === "complete"
                      ? "var(--color-positive)"
                      : step.state === "failed"
                        ? "var(--color-negative)"
                        : step.state === "pending"
                          ? "#2563eb"
                          : "#a1a1aa",
                }}
              >
                {step.state === "complete" ? "✓" : step.state === "failed" ? "✕" : String(idx + 1).padStart(2, "0")}
              </span>
              <div className="relative flex flex-col min-w-0">
                <p className="text-[13px] font-medium text-text-primary truncate">{step.label}</p>
                {step.detail ? (
                  <p className="text-[11px] text-text-tertiary truncate">{step.detail}</p>
                ) : null}
              </div>
              {step.state === "pending" ? (
                <span className="relative ml-auto h-2 w-2 rounded-full bg-[#2563eb] live-dot" />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <div
          className="px-6 py-2.5 text-[12px]"
          style={{
            borderTop: `1px solid ${B}`,
            background: "var(--color-negative-dim)",
            color: "var(--color-negative)",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Footer: task ID + Arc Explorer link. After success, also folds in
          the before→after Solana USDC balance as a low-key mono line so the
          info doesn't take a dedicated green banner. */}
      {taskId ? (
        <div
          className="px-6 py-2 text-[11px] text-text-tertiary flex items-center justify-between gap-4"
          style={{ borderTop: `1px solid ${B}` }}
        >
          <span className="font-mono truncate">Task {taskId.slice(0, 16)}…</span>
          {balanceAfter !== null && balanceBefore !== null ? (
            <span className="font-mono tabular-nums whitespace-nowrap">
              Solana USDC{" "}
              <span className="text-text-tertiary">{balanceBefore.toFixed(2)}</span>
              {" → "}
              <span style={{ color: "var(--color-positive)" }}>{balanceAfter.toFixed(2)}</span>
            </span>
          ) : null}
          <a
            href={ARC_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text-primary transition-colors shrink-0"
          >
            Arc Explorer →
          </a>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

type TaskInputProps = {
  onSubmit: (args: { prompt: string; insurance: boolean }) => void;
  isRunning: boolean;
  defaultPrompt?: string;
  shellMode?: "auction" | "direct";
};

const DEFAULT_PROMPT = "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500";
const B = "rgba(0,0,0,0.22)";

export function TaskInput({
  onSubmit,
  isRunning,
  defaultPrompt = DEFAULT_PROMPT,
  shellMode = "auction",
}: TaskInputProps) {
  const [prompt,    setPrompt]    = useState(defaultPrompt);
  const [insurance, setInsurance] = useState(false);

  // Sync textarea to the new defaultPrompt when the parent swaps agents.
  // Without this, switching Swap → Remittance leaves the swap prompt behind.
  useEffect(() => {
    setPrompt(defaultPrompt);
  }, [defaultPrompt]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ prompt, insurance }); }}
      className="shrink-0 flex flex-col"
      style={{ borderBottom: `1px solid ${B}` }}
    >
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Task Input</p>
          <p className="text-[12px] text-text-tertiary">
            {shellMode === "auction" ? "Rebalance flow" : "Remittance flow"}
          </p>
        </div>
        <span className="text-[12px] font-medium px-3 py-1" style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}>
          Router LLM
        </span>
      </div>

      <div className="px-6 py-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full text-[15px] text-text-primary bg-transparent outline-none resize-none placeholder:text-text-tertiary"
          style={{ border: "none" }}
          placeholder="Enter your prompt…"
        />
      </div>

      <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid ${B}` }}>
        {/* Insurance only applies to the rebalance auction (routes to
            Portfolio B for the intentional-fail + refund demo). Hide on
            direct flows like remittance where it has no effect. */}
        {shellMode === "auction" ? (
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} className="h-4 w-4" />
            <span className="text-[13px] text-text-tertiary">Insure (+0.5%)</span>
          </label>
        ) : (
          <span className="text-[12px] text-text-tertiary">Direct flow · no auction</span>
        )}
        <button
          type="submit"
          disabled={isRunning}
          className="text-[13px] font-medium px-6 py-2.5 border-none cursor-pointer transition-colors duration-150"
          style={
            isRunning
              ? { background: "rgba(0,0,0,0.05)", color: "#a1a1aa", cursor: "not-allowed" }
              : { background: "#111111", color: "#ffffff" }
          }
        >
          {isRunning ? "Running…" : shellMode === "auction" ? "Start Rebalance" : "Start Remittance"}
        </button>
      </div>
    </form>
  );
}

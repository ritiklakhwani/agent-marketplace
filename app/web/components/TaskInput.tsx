"use client";

import { useState } from "react";

type TaskInputProps = {
  onSubmit: (args: { prompt: string; insurance: boolean }) => void;
  isRunning: boolean;
  defaultPrompt?: string;
  shellMode?: "auction" | "direct";
};

const DEFAULT_PROMPT = "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500";
const B = "rgba(0,0,0,0.08)";

export function TaskInput({
  onSubmit,
  isRunning,
  defaultPrompt = DEFAULT_PROMPT,
  shellMode = "auction",
}: TaskInputProps) {
  const [prompt,    setPrompt]    = useState(defaultPrompt);
  const [insurance, setInsurance] = useState(false);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ prompt, insurance }); }}
      className="shrink-0 flex flex-col"
      style={{ borderBottom: `1px solid ${B}` }}
    >
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Task Input</p>
          <p className="text-[10px] text-text-tertiary">
            {shellMode === "auction" ? "Rebalance flow" : "Remittance flow"}
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5" style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}>
          Router LLM
        </span>
      </div>

      <div className="px-4 py-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full text-[11px] text-text-primary bg-transparent outline-none resize-none placeholder:text-text-tertiary"
          style={{ border: "none" }}
          placeholder="Enter your prompt…"
        />
      </div>

      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: `1px solid ${B}` }}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} className="h-3 w-3" />
          <span className="text-[10px] text-text-tertiary">Insure (+0.5%)</span>
        </label>
        <button
          type="submit"
          disabled={isRunning}
          className="text-[11px] font-medium px-4 py-1.5 border-none cursor-pointer transition-colors duration-150"
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

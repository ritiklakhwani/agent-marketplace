"use client";

import { useState } from "react";

type TaskInputProps = {
  onSubmit: (args: { prompt: string; insurance: boolean }) => void;
  isRunning: boolean;
  defaultPrompt?: string;
  shellMode?: "auction" | "direct";
};

const DEFAULT_PROMPT =
  "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500";

export function TaskInput({
  onSubmit,
  isRunning,
  defaultPrompt = DEFAULT_PROMPT,
  shellMode = "auction",
}: TaskInputProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [insurance, setInsurance] = useState(false);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ prompt, insurance }); }}
      className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Task Input</p>
          <p className="text-sm text-zinc-500">
            {shellMode === "auction"
              ? "Natural language in, routed to the flagship rebalance flow."
              : "Natural language in, routed to the remittance flow."}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Router is the only LLM
        </span>
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-zinc-700">
          Prompt
        </span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
        />
      </label>

      <label className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={insurance}
          onChange={(event) => setInsurance(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Insure this task (+0.5%) — refund from on-chain insurance vault if the agent fails
      </label>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Connect your wallet to run the live on-chain flow.
        </p>
        <button
          type="submit"
          disabled={isRunning}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isRunning
            ? "Running..."
            : shellMode === "auction"
            ? "Start Rebalance"
            : "Start Remittance"}
        </button>
      </div>
    </form>
  );
}

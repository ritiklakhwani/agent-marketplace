import { TaskEvent } from "@agent-marketplace/types";

export type PortfolioRow = {
  symbol: string;
  target: number;
  current: number;
};

export const initialPortfolio: PortfolioRow[] = [
  { symbol: "AAPL", target: 40, current: 0 },
  { symbol: "TSLA", target: 30, current: 0 },
  { symbol: "NVDA", target: 30, current: 0 },
];

export function createMockTaskEvents(insurance: boolean): TaskEvent[] {
  const baseEvents: TaskEvent[] = [
    { type: "bid", agent: "portfolio-a", feePct: 0.6 },
    { type: "bid", agent: "portfolio-b", feePct: 0.4 },
    { type: "bid", agent: "portfolio-a", feePct: 0.3 },
    {
      type: "winner_selected",
      winner: insurance ? "portfolio-b" : "portfolio-a",
      reason: insurance
        ? "Selected for insured test flow"
        : "Lowest fee with acceptable reputation",
    },
    {
      type: "execution_step",
      stepIndex: 0,
      label: "Oracle Agent quoted AAPL, TSLA, NVDA",
      status: "complete",
    },
    {
      type: "execution_step",
      stepIndex: 1,
      label: "Swap Agent leg 1",
      status: "complete",
    },
  ];

  if (insurance) {
    return [
      ...baseEvents,
      {
        type: "execution_step",
        stepIndex: 2,
        label: "Swap Agent leg 2 failed: slippage exceeded",
        status: "failed",
      },
      { type: "reputation_update", agent: "portfolio-b", delta: -1 },
      { type: "insurance_refund", amount: 502.5, txSig: "mock-refund-tx" },
      { type: "task_complete" },
    ];
  }

  return [
    ...baseEvents,
    {
      type: "execution_step",
      stepIndex: 2,
      label: "Swap Agent leg 2",
      status: "complete",
    },
    {
      type: "execution_step",
      stepIndex: 3,
      label: "Swap Agent leg 3",
      status: "complete",
    },
    { type: "reputation_update", agent: "portfolio-a", delta: 1 },
    { type: "task_complete" },
  ];
}

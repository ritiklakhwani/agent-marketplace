import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { RebalanceTask } from "@agent-marketplace/types";

export type PriceMap = Record<string, number>; // { AAPL: 182.5, ... }

export type Trade = {
  symbol: string;
  amountUsd: number; // dollars to spend on this asset
};

export function computeTrades(task: RebalanceTask, _prices: PriceMap): Trade[] {
  return Object.entries(task.targets).map(([symbol, targetPct]) => ({
    symbol,
    amountUsd: (targetPct / 100) * task.budget,
  }));
}

export async function logStep(
  taskId: string,
  stepIndex: number,
  agentId: string,
  action: string,
  input: object,
  output: object | undefined,
  status: "complete" | "failed",
  txSig?: string
) {
  await prisma.executionStep.create({
    data: { taskId, stepIndex, agentId, action, input, output, status, txSig },
  });

  emitSSE(taskId, {
    type: "execution_step",
    stepIndex,
    label: action === "oracle_query"
      ? `Oracle Agent quoted ${((input as { symbols?: string[] }).symbols ?? Object.keys(input as Record<string, unknown>)).join(", ")}`
      : `Swap Agent leg ${stepIndex}: ${(input as Trade).symbol}`,
    status,
  });
}
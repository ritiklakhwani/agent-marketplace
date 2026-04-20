import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { computeTrades, logStep } from "@/lib/portfolio-core";
import { incrementReputation } from "@agentbazaar/solana";
import { PublicKey } from "@solana/web3.js";
import { RebalanceTask } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const AGENT_ID = "portfolio-a";

export async function POST(request: Request) {
  const { taskId, task } = (await request.json()) as {
    taskId: string;
    task: RebalanceTask;
    userWallet: string;
    insurance: boolean;
  };

  try {
    // Step 0: hire Oracle Agent
    const oracleRes = await fetch(`${BASE}/api/agents/oracle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // TODO: add X-PAYMENT header via makeX402Payment once shared/x402 is built
      body: JSON.stringify({ symbols: Object.keys(task.targets) }),
    });

    const { prices } = await oracleRes.json();
    await logStep(taskId, 0, AGENT_ID, "oracle_query", { symbols: Object.keys(task.targets) }, { prices }, "complete");

    // Compute how much of each asset to buy
    const trades = computeTrades(task, prices);

    // Steps 1-N: hire Swap Agent for each leg
    for (const [i, trade] of trades.entries()) {
      const swapRes = await fetch(`${BASE}/api/agents/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // TODO: add X-PAYMENT header via makeX402Payment once shared/x402 is built
        body: JSON.stringify(trade),
      });

      const swapResult = await swapRes.json();
      await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, swapResult, "complete", swapResult.txSig);
    }

    // Increment reputation on-chain
    const pubkeyStr = process.env.PORTFOLIO_A_PUBKEY;
    if (pubkeyStr) {
      await incrementReputation(new PublicKey(pubkeyStr), BigInt(Math.round(task.budget)));
      emitSSE(taskId, { type: "reputation_update", agent: AGENT_ID, delta: 1 });
    }

    await prisma.task.update({ where: { id: taskId }, data: { status: "completed" } });
    emitSSE(taskId, { type: "task_complete" });

    return Response.json({ status: "completed" });
  } catch (err) {
    await prisma.task.update({ where: { id: taskId }, data: { status: "failed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
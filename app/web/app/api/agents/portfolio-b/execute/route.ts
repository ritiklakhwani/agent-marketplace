import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { computeTrades, logStep } from "@/lib/portfolio-core";
import { handleAgentFailure, incrementReputation } from "@agentbazaar/solana";
import { PublicKey } from "@solana/web3.js";
import { RebalanceTask } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const AGENT_ID = "portfolio-b";

export async function POST(request: Request) {
  const { taskId, task, userWallet, insurance } = (await request.json()) as {
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
      body: JSON.stringify({ symbols: Object.keys(task.targets) }),
    });

    const { prices } = await oracleRes.json();
    await logStep(taskId, 0, AGENT_ID, "oracle_query", { symbols: Object.keys(task.targets) }, { prices }, "complete");

    const trades = computeTrades(task, prices);

    // Steps 1-N: hire Swap Agent — intentionally fail on leg 2 when insured
    for (const [i, trade] of trades.entries()) {
      const isIntentionalFail = insurance && i === 1;

      if (isIntentionalFail) {
        await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, undefined, "failed");
        throw new Error("Slippage exceeded — intentional fail for insurance demo");
      }

      const swapRes = await fetch(`${BASE}/api/agents/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });

      const swapResult = await swapRes.json();
      await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, swapResult, "complete", swapResult.txSig);
    }

    // Happy path: increment reputation
    const pubkeyStr = process.env.PORTFOLIO_B_PUBKEY;
    if (pubkeyStr) {
      await incrementReputation(new PublicKey(pubkeyStr), BigInt(Math.round(task.budget)));
      emitSSE(taskId, { type: "reputation_update", agent: AGENT_ID, delta: 1 });
    }

    await prisma.task.update({ where: { id: taskId }, data: { status: "completed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ status: "completed" });

  } catch (err) {
    const pubkeyStr = process.env.PORTFOLIO_B_PUBKEY;

    if (pubkeyStr) {
      const refundAmount = BigInt(Math.round(task.budget * 1.005 * 1_000_000)); // micro-USDC
      const result = await handleAgentFailure({
        taskId,
        agentOwner: new PublicKey(pubkeyStr),
        userTokenAccount: new PublicKey(userWallet),
        refundAmount,
        hasInsurance: insurance,
      }).catch(() => ({ refundTxSig: undefined, slashTxSig: "mock-slash" }));

      if (insurance) {
        const refundTxSig = result.refundTxSig ?? "mock-refund";
        await prisma.insuranceEvent.create({
          data: { taskId, type: "refunded", amount: task.budget * 1.005, txSig: refundTxSig },
        }).catch(() => {});
        emitSSE(taskId, { type: "insurance_refund", amount: task.budget * 1.005, txSig: refundTxSig });
      }

      emitSSE(taskId, { type: "reputation_update", agent: AGENT_ID, delta: -1 });
    }

    await prisma.task.update({ where: { id: taskId }, data: { status: insurance ? "refunded" : "failed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
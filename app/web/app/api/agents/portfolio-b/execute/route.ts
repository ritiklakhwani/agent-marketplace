import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { computeTrades, logStep } from "@/lib/portfolio-core";
import { loadAgentKeypair } from "@/lib/agentKeypair";
import { handleAgentFailure, incrementReputation, getConnection } from "@agentbazaar/solana";
import { makeX402Payment } from "@agentbazaar/x402";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { RebalanceTask } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const AGENT_ID = "portfolio-b";

const FALLBACK = "11111111111111111111111111111111";
const ORACLE_PUBKEY = new PublicKey(process.env.AGENT_ORACLE_PUBKEY ?? FALLBACK);
const SWAP_PUBKEY = new PublicKey(process.env.AGENT_SWAP_PUBKEY ?? FALLBACK);
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? FALLBACK);


async function x402Header(recipient: PublicKey, amount: bigint): Promise<Record<string, string>> {
  const keypair = loadAgentKeypair("portfolio-b");
  if (!keypair) throw new Error("portfolio-b keypair not found");
  const header = await makeX402Payment({ signer: keypair, recipient, amount, mint: USDC_MINT, connection: getConnection() });
  return { "X-PAYMENT": header };
}

export async function POST(request: Request) {
  const { taskId, task, userWallet, insurance } = (await request.json()) as {
    taskId: string;
    task: RebalanceTask;
    userWallet: string;
    insurance: boolean;
  };

  try {
    // Step 0: hire Oracle Agent via x402
    const oracleRes = await fetch(`${BASE}/api/agents/oracle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await x402Header(ORACLE_PUBKEY, 20_000n) },
      body: JSON.stringify({ symbols: Object.keys(task.targets) }),
    });

    if (!oracleRes.ok) throw new Error(`Oracle payment rejected: ${await oracleRes.text()}`);
    const { prices } = await oracleRes.json();
    await logStep(taskId, 0, AGENT_ID, "oracle_query", { symbols: Object.keys(task.targets) }, { prices }, "complete");

    const trades = computeTrades(task, prices);

    // Steps 1-N: hire Swap Agent via x402 — intentionally fail on leg 2 when insured
    for (const [i, trade] of trades.entries()) {
      const isIntentionalFail = insurance && i === 1;

      if (isIntentionalFail) {
        await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, undefined, "failed");
        throw new Error("Slippage exceeded — intentional fail for insurance demo");
      }

      const swapRes = await fetch(`${BASE}/api/agents/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await x402Header(SWAP_PUBKEY, 50_000n) },
        body: JSON.stringify(trade),
      });

      if (!swapRes.ok) throw new Error(`Swap payment rejected: ${await swapRes.text()}`);
      const swapResult = await swapRes.json();
      await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, swapResult, "complete", swapResult.txSig);
    }

    const pubkeyStr = process.env.PORTFOLIO_B_PUBKEY;
    if (pubkeyStr) {
      await incrementReputation(new PublicKey(pubkeyStr), BigInt(Math.round(task.budget)));
      emitSSE(taskId, { type: "reputation_update", agent: AGENT_ID, delta: 1 });
    }

    await prisma.task.update({ where: { id: taskId }, data: { status: "completed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ status: "completed" });

  } catch (taskErr) {
    // Ensure task always reaches a terminal state even if the failure handler throws
    try {
      const pubkeyStr = process.env.PORTFOLIO_B_PUBKEY;
      if (pubkeyStr) {
        const premiumAmount = task.budget * 0.005;
        const refundAmount = BigInt(Math.round(premiumAmount * 1_000_000));
        const userAta = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(userWallet));
        const result = await handleAgentFailure({
          taskId,
          agentOwner: new PublicKey(pubkeyStr),
          userTokenAccount: userAta,
          refundAmount,
          hasInsurance: insurance,
        });

        if (insurance && result.refundTxSig) {
          await prisma.insuranceEvent.create({
            data: { taskId, type: "refunded", amount: premiumAmount, txSig: result.refundTxSig },
          });
          emitSSE(taskId, { type: "insurance_refund", amount: premiumAmount, txSig: result.refundTxSig });
        }

        emitSSE(taskId, { type: "reputation_update", agent: AGENT_ID, delta: -1 });
      }
    } catch (failureErr) {
      console.error("[portfolio-b] handleAgentFailure threw:", failureErr);
    }

    await prisma.task.update({ where: { id: taskId }, data: { status: insurance ? "refunded" : "failed" } });
    emitSSE(taskId, { type: "task_complete" });
    return Response.json({ error: String(taskErr) }, { status: 500 });
  }
}
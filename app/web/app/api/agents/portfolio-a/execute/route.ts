import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { computeTrades, logStep } from "@/lib/portfolio-core";
import { loadAgentKeypair } from "@/lib/agentKeypair";
import { incrementReputation, getConnection } from "@agentbazaar/solana";
import { makeX402Payment } from "@agentbazaar/x402";
import { PublicKey } from "@solana/web3.js";
import { RebalanceTask } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const AGENT_ID = "portfolio-a";

const FALLBACK = "11111111111111111111111111111111";
const ORACLE_PUBKEY = new PublicKey(process.env.AGENT_ORACLE_PUBKEY ?? FALLBACK);
const SWAP_PUBKEY = new PublicKey(process.env.AGENT_SWAP_PUBKEY ?? FALLBACK);
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? FALLBACK);


async function x402Header(recipient: PublicKey, amount: bigint): Promise<Record<string, string>> {
  const keypair = loadAgentKeypair("portfolio-a");
  if (!keypair) throw new Error("portfolio-a keypair not found");
  const header = await makeX402Payment({ signer: keypair, recipient, amount, mint: USDC_MINT, connection: getConnection() });
  return { "X-PAYMENT": header };
}

export async function POST(request: Request) {
  const { taskId, task } = (await request.json()) as {
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

    // Steps 1-N: hire Swap Agent via x402 for each leg
    for (const [i, trade] of trades.entries()) {
      const swapRes = await fetch(`${BASE}/api/agents/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await x402Header(SWAP_PUBKEY, 50_000n) },
        body: JSON.stringify(trade),
      });

      if (!swapRes.ok) throw new Error(`Swap payment rejected: ${await swapRes.text()}`);
      const swapResult = await swapRes.json();
      await logStep(taskId, i + 1, AGENT_ID, "swap_leg", trade, swapResult, "complete", swapResult.txSig);
    }

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
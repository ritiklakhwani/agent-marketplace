import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { AGENT_HOT_WALLET, getConnection, readReputation } from "@agentbazaar/solana";
import { makeX402Payment } from "@agentbazaar/x402";
import { PublicKey } from "@solana/web3.js";
import { Task } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const USDC_MINT = new PublicKey(
  process.env.USDC_DEVNET_MINT ?? "11111111111111111111111111111111",
);

// Must match EXECUTE_FEE_MICRO_USDC in portfolio-{a,b}/execute routes.
// V0: Coordinator signs this payment on behalf of the user using AGENT_HOT_WALLET.
// V1: frontend prompts the user's Backpack to sign this header themselves.
const EXECUTE_FEE_MICRO_USDC = 1_000_000n; // 1 USDC

// On-chain pubkeys for each agent — sourced from AgentMetadata seed
const AGENT_PUBKEYS: Record<string, string> = {
  "portfolio-a": process.env.PORTFOLIO_A_PUBKEY ?? "",
  "portfolio-b": process.env.PORTFOLIO_B_PUBKEY ?? "",
};

type BidConfig = {
  agentId: string;
  initialFeePct: number;
  floorFeePct: number;
  reputation: number;
};

async function fetchBidConfig(agentId: string): Promise<BidConfig> {
  const res = await fetch(`${BASE}/api/agents/${agentId}/bid`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Bid fetch failed for ${agentId}: ${res.status}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safePubkey(input: string): PublicKey | null {
  try {
    return new PublicKey(input);
  } catch {
    return null;
  }
}

// Simulates a Dutch auction: A drops from initial to floor over 3 rounds
function stageBidDrops(a: BidConfig, b: BidConfig) {
  const step = (a.initialFeePct - a.floorFeePct) / 2;
  return [
    { agentId: a.agentId, feePct: a.initialFeePct, reputation: a.reputation },
    { agentId: b.agentId, feePct: b.initialFeePct, reputation: b.reputation },
    { agentId: a.agentId, feePct: a.initialFeePct - step, reputation: a.reputation },
    { agentId: a.agentId, feePct: a.floorFeePct, reputation: a.reputation },
  ];
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { taskId, task, userWallet, insurance } = body as {
    taskId: string;
    task: Task;
    userWallet: string;
    insurance: boolean;
  };

  if (task.type !== "rebalance") {
    return Response.json({ error: `Unsupported task type: ${task.type}` }, { status: 400 });
  }

  try {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "bidding" },
  });

  const [configA, configB] = await Promise.all([
    fetchBidConfig("portfolio-a"),
    fetchBidConfig("portfolio-b"),
  ]);

  // Read live reputation from chain if pubkeys are configured, else fall back to bid config
  const [repA, repB] = await Promise.all([
    AGENT_PUBKEYS["portfolio-a"]
      ? readReputation(new PublicKey(AGENT_PUBKEYS["portfolio-a"]))
      : Promise.resolve(configA.reputation),
    AGENT_PUBKEYS["portfolio-b"]
      ? readReputation(new PublicKey(AGENT_PUBKEYS["portfolio-b"]))
      : Promise.resolve(configB.reputation),
  ]);

  configA.reputation = repA;
  configB.reputation = repB;

  // Stream bid events with 1.5s gaps so the UI animates
  for (const bid of stageBidDrops(configA, configB)) {
    await prisma.bid.create({
      data: {
        taskId,
        agentId: bid.agentId,
        feePct: bid.feePct,
        reputation: bid.reputation,
      },
    });
    emitSSE(taskId, { type: "bid", agent: bid.agentId, feePct: bid.feePct });
    await sleep(1500);
  }

  // Pick winner: lowest fee/reputation wins — insured tasks route to portfolio-b to demo the failure+refund flow
  const scoreA = configA.floorFeePct / (configA.reputation || 1);
  const scoreB = configB.floorFeePct / (configB.reputation || 1);
  const winner = insurance ? "portfolio-b" : (scoreA <= scoreB ? "portfolio-a" : "portfolio-b");
  const winnerScore = winner === "portfolio-a" ? scoreA : scoreB;

  await prisma.task.update({
    where: { id: taskId },
    data: { winnerId: winner, status: "executing" },
  });

  emitSSE(taskId, {
    type: "winner_selected",
    winner,
    reason: `Lowest fee × reputation score: ${winnerScore.toFixed(4)}`,
  });

  // Coordinator uses SPL token delegation to pay the winning agent on behalf
  // of the user. The user previously signed `approve(delegate=AGENT_HOT_WALLET)`
  // granting us authority to move up to N USDC from their wallet. Here we
  // spend 1 USDC of that delegation per task — USDC leaves the user's wallet
  // on-chain (Explorer shows user -> agent), while the tx + x402 envelope are
  // signed by AGENT_HOT_WALLET as the delegate.
  //
  // If the user never called approve, this transfer will fail with
  // "owner does not match" — graceful fallback: sign as hot wallet directly
  // (no delegation), so dev / admin-wallet flows still work.
  const executeHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const winnerPubkeyStr = AGENT_PUBKEYS[winner];
  if (winnerPubkeyStr) {
    const winnerPubkey = new PublicKey(winnerPubkeyStr);
    const userPubkey = userWallet ? safePubkey(userWallet) : null;
    try {
      const x402 = await makeX402Payment({
        signer: AGENT_HOT_WALLET,
        sourceOwner: userPubkey ?? undefined,
        recipient: winnerPubkey,
        amount: EXECUTE_FEE_MICRO_USDC,
        mint: USDC_MINT,
        connection: getConnection(),
      });
      executeHeaders["X-PAYMENT"] = x402;
    } catch (e) {
      console.error("[coordinator] delegated x402 payment failed:", e);
      // Fallback for dev: try signing without delegation (pay from hot wallet).
      try {
        const fallback = await makeX402Payment({
          signer: AGENT_HOT_WALLET,
          recipient: winnerPubkey,
          amount: EXECUTE_FEE_MICRO_USDC,
          mint: USDC_MINT,
          connection: getConnection(),
        });
        executeHeaders["X-PAYMENT"] = fallback;
        console.warn("[coordinator] falling back to direct hot-wallet payment (no delegation)");
      } catch (fallbackErr) {
        console.error("[coordinator] fallback payment also failed:", fallbackErr);
        // Execute will 402 and task ends in failed state.
      }
    }
  }

  // Trigger winner execute — fire and forget
  void fetch(`${BASE}/api/agents/${winner}/execute`, {
    method: "POST",
    headers: executeHeaders,
    body: JSON.stringify({ taskId, task, userWallet, insurance }),
  }).catch(console.error);

  return Response.json({ winner });
  } catch (err) {
    console.error("[coordinator] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
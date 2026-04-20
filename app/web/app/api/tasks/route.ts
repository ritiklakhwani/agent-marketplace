import { prisma } from "@/lib/prisma";
import {
  AGENT_HOT_WALLET,
  getConnection,
} from "@agentbazaar/solana";
import { makeX402Payment } from "@agentbazaar/x402";
import { PublicKey } from "@solana/web3.js";
import type { Task } from "@agent-marketplace/types";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const FALLBACK = "11111111111111111111111111111111";
const REMIT_PUBKEY = new PublicKey(process.env.AGENT_REMIT_PUBKEY ?? FALLBACK);
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? FALLBACK);

// Mirrors REMIT_FEE_MICRO_USDC in /api/agents/remit/route.ts
const REMIT_FEE_MICRO_USDC = 10_000n; // 0.01 USDC

async function callRouter(prompt: string): Promise<Task> {
  const res = await fetch(`${BASE}/api/agents/router`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Router failed: ${res.status}`);
  return res.json();
}

async function dispatchRebalance(params: {
  taskId: string;
  task: Task;
  userWallet?: string;
  insurance?: boolean;
}) {
  void fetch(`${BASE}/api/coordinator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(console.error);
}

async function dispatchRemit(params: {
  taskId: string;
  amount: number;
  recipient: string;
  userWallet?: string;
}) {
  // User pays Remit Agent via x402 using SPL delegation — hot wallet signs
  // as delegate, user's USDC is the actual source. Falls back to direct
  // hot-wallet payment if the user hasn't delegated (dev flow).
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let userPubkey: PublicKey | null = null;
  if (params.userWallet) {
    try {
      userPubkey = new PublicKey(params.userWallet);
    } catch {
      userPubkey = null;
    }
  }
  try {
    const x402 = await makeX402Payment({
      signer: AGENT_HOT_WALLET,
      sourceOwner: userPubkey ?? undefined,
      recipient: REMIT_PUBKEY,
      amount: REMIT_FEE_MICRO_USDC,
      mint: USDC_MINT,
      connection: getConnection(),
    });
    headers["X-PAYMENT"] = x402;
  } catch (e) {
    console.error("[tasks] delegated x402 for remit failed:", e);
    try {
      const fallback = await makeX402Payment({
        signer: AGENT_HOT_WALLET,
        recipient: REMIT_PUBKEY,
        amount: REMIT_FEE_MICRO_USDC,
        mint: USDC_MINT,
        connection: getConnection(),
      });
      headers["X-PAYMENT"] = fallback;
      console.warn("[tasks] falling back to direct hot-wallet payment for remit");
    } catch (fallbackErr) {
      console.error("[tasks] fallback remit payment also failed:", fallbackErr);
    }
  }

  void fetch(`${BASE}/api/agents/remit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      taskId: params.taskId,
      amount: params.amount,
      recipient: params.recipient,
    }),
  }).catch(console.error);
}

export async function POST(request: Request) {
  const { prompt, userWallet, insurance } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const parsed = await callRouter(prompt);

    const task = await prisma.task.create({
      data: {
        userWallet: userWallet ?? "anonymous",
        type: parsed.type,
        payload: parsed,
        insurance: insurance ?? false,
      },
    });

    if (parsed.type === "rebalance") {
      await dispatchRebalance({
        taskId: task.id,
        task: parsed,
        userWallet,
        insurance,
      });
    } else if (parsed.type === "remit") {
      await dispatchRemit({
        taskId: task.id,
        amount: parsed.amount,
        recipient: parsed.recipient,
        userWallet,
      });
    } else {
      return Response.json(
        { error: `Unsupported task type: ${(parsed as Task).type}` },
        { status: 400 },
      );
    }

    return Response.json({ taskId: task.id, task: parsed });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

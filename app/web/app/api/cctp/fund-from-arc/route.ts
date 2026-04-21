import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import {
  burnOnArc,
  pollAttestationFromArc,
  receiveMessageOnSolana,
} from "@/lib/cctp";
import { AGENT_HOT_WALLET, getConnection } from "@agentbazaar/solana";
import {
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

const USDC_DEVNET_MINT = new PublicKey(
  process.env.USDC_DEVNET_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

/**
 * Fund-from-Arc orchestrator. Bridges USDC from Arc testnet to the user's
 * Solana wallet using Circle CCTP V2.
 *
 * Flow:
 *   1. Burn USDC on Arc testnet (admin-signed, uses ARC_PRIVATE_KEY)
 *   2. Poll Circle attestation service for the cross-chain proof
 *   3. Call receive_message on Solana MessageTransmitterV2 to mint USDC
 *      into the user's Solana USDC ATA
 *
 * Body: { userWallet: string (base58), amount: number (human USDC, e.g. 5) }
 * Emits SSE events for each step.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { userWallet, amount } = (body ?? {}) as {
    userWallet?: string;
    amount?: number;
  };

  if (!userWallet || !amount || amount <= 0) {
    return Response.json(
      { error: "userWallet (base58) and amount (>0) are required" },
      { status: 400 },
    );
  }

  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(userWallet);
  } catch {
    return Response.json({ error: "Invalid userWallet pubkey" }, { status: 400 });
  }

  const amountMicroUsdc = BigInt(Math.round(amount * 1_000_000));

  // Create a Task row so the SSE stream has something to key off of
  const task = await prisma.task.create({
    data: {
      userWallet,
      type: "fund-from-arc",
      payload: { amount, direction: "arc-to-solana" },
      insurance: false,
    },
  });
  const taskId = task.id;

  // Fire-and-forget orchestration. The SSE stream endpoint picks up events
  // keyed by taskId. Client polls /api/sse/task/[id] with the returned taskId.
  void (async () => {
    try {
      // Derive user's USDC ATA — this is where the minted USDC will land
      const recipientAta = await getAssociatedTokenAddress(
        USDC_DEVNET_MINT,
        userPubkey,
      );

      // Step 1 — Burn on Arc
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 0,
        label: `Burning ${amount} USDC on Arc testnet (CCTP V2)`,
        status: "pending",
      });
      const burnTxHash = await burnOnArc(amountMicroUsdc, recipientAta);
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 0,
        label: `Burning ${amount} USDC on Arc testnet (CCTP V2)`,
        status: "complete",
      });

      // Step 2 — Poll Circle attestation
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 1,
        label: "Awaiting Circle attestation (~2-5 min on Arc testnet)",
        status: "pending",
      });
      const { message, attestation } = await pollAttestationFromArc(burnTxHash);
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 1,
        label: "Awaiting Circle attestation (~2-5 min on Arc testnet)",
        status: "complete",
      });

      // Step 3 — Mint on Solana
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 2,
        label: `Minting ${amount} USDC on Solana devnet`,
        status: "pending",
      });
      const solanaTxSig = await receiveMessageOnSolana(
        getConnection(),
        AGENT_HOT_WALLET,
        recipientAta,
        userPubkey,
        message,
        attestation,
      );
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 2,
        label: `Minting ${amount} USDC on Solana devnet (tx ${solanaTxSig.slice(0, 8)}...)`,
        status: "complete",
      });

      await prisma.task.update({
        where: { id: taskId },
        data: { status: "completed" },
      });
      emitSSE(taskId, { type: "task_complete" });
    } catch (err) {
      console.error("[fund-from-arc] failed:", err);
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "failed" },
      }).catch(console.error);
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 99,
        label: `Fund-from-Arc failed: ${String(err).slice(0, 120)}`,
        status: "failed",
      });
      emitSSE(taskId, { type: "task_complete" });
    }
  })();

  return Response.json({ taskId });
}

import { prisma } from "@/lib/prisma";
import { emitSSE } from "@/lib/sse";
import { loadAgentKeypair } from "@/lib/agentKeypair";
import { getConnection } from "@agentbazaar/solana";
import { withX402 } from "@agentbazaar/x402/next";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";

const FALLBACK = "11111111111111111111111111111111";
const REMIT_PUBKEY = new PublicKey(process.env.AGENT_REMIT_PUBKEY ?? FALLBACK);
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? FALLBACK);

// Fee per remit — mirrors how other marketplace agents charge via x402.
const REMIT_FEE_MICRO_USDC = 10_000n; // 0.01 USDC per transfer

const USDC_DECIMALS = 6;

export const POST = withX402(
  {
    expectedRecipient: REMIT_PUBKEY,
    expectedAmount: REMIT_FEE_MICRO_USDC,
    expectedMint: USDC_MINT,
  },
  async (req, _ctx, payment) => {
    const { taskId, amount, recipient } = (await req.json()) as {
      taskId?: string;
      amount: number; // human-readable USDC (e.g., 20 for $20)
      recipient: string; // base58 Solana address
    };

    if (!amount || !recipient) {
      return Response.json(
        { error: "amount (number) and recipient (pubkey) required" },
        { status: 400 },
      );
    }

    // Load the Remit Agent's keypair. The agent signs outbound USDC transfers
    // from its own wallet. In V0 the agent wallet is seeded from the hot
    // wallet; in V1 Dodo Payments bridges INR -> USDC for this flow.
    const remitKeypair = loadAgentKeypair("remit");
    if (!remitKeypair) {
      return Response.json(
        { error: "remit keypair not available on this host" },
        { status: 500 },
      );
    }

    const recipientPubkey = new PublicKey(recipient);
    const connection = getConnection();

    const remitAta = await getAssociatedTokenAddress(
      USDC_MINT,
      remitKeypair.publicKey,
    );
    const recipientAta = await getAssociatedTokenAddress(
      USDC_MINT,
      recipientPubkey,
    );

    const amountBase = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
    if (amountBase <= 0n) {
      return Response.json(
        { error: "amount must be greater than zero" },
        { status: 400 },
      );
    }

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        remitKeypair.publicKey,
        recipientAta,
        recipientPubkey,
        USDC_MINT,
      ),
      createTransferInstruction(
        remitAta,
        recipientAta,
        remitKeypair.publicKey,
        amountBase,
      ),
    );

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = remitKeypair.publicKey;
    tx.sign(remitKeypair);

    let txSig: string;
    try {
      txSig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "processed",
      });
    } catch (err) {
      // Likely insufficient USDC in the Remit Agent's wallet. Record a failed
      // event so the UI surfaces it, then propagate the error.
      if (taskId) {
        await prisma.remitEvent.create({
          data: {
            taskId,
            amount,
            recipient,
            txSig: null,
            status: "failed",
          },
        });
        emitSSE(taskId, {
          type: "execution_step",
          stepIndex: 0,
          label: `Remit failed: ${String(err).slice(0, 80)}`,
          status: "failed",
        });
      }
      return Response.json(
        { error: `remit failed: ${String(err)}` },
        { status: 500 },
      );
    }

    if (taskId) {
      await prisma.remitEvent.create({
        data: {
          taskId,
          amount,
          recipient,
          txSig,
          status: "completed",
        },
      });
      emitSSE(taskId, {
        type: "execution_step",
        stepIndex: 0,
        label: `Remit $${amount} -> ${recipient.slice(0, 8)}...`,
        status: "complete",
      });
      emitSSE(taskId, { type: "task_complete" });
    }

    return Response.json({
      txSig,
      amount,
      recipient: recipientPubkey.toBase58(),
      mint: USDC_MINT.toBase58(),
      status: "completed",
      paidBy: payment.payer,
    });
  },
);

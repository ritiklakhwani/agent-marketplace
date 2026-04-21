import { withX402 } from "@agentbazaar/x402/next";
import {
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { getConnection } from "@agentbazaar/solana";
import { loadAgentKeypair } from "@/lib/agentKeypair";

const FALLBACK = "11111111111111111111111111111111";
const SWAP_PUBKEY = new PublicKey(process.env.AGENT_SWAP_PUBKEY ?? FALLBACK);
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? FALLBACK);

// Mock stock token mints created in Phase 1.7 (scripts/mint-mock-tokens.ts).
// Each has 6 decimals and 1M supply held in the Swap Agent's ATA.
const MOCK_MINTS: Record<string, string | undefined> = {
  AAPL: process.env.MOCK_TAAPL_MINT,
  TSLA: process.env.MOCK_TTSLA_MINT,
  NVDA: process.env.MOCK_TNVDA_MINT,
};

const MOCK_TOKEN_DECIMALS = 6;

export const POST = withX402(
  {
    expectedRecipient: SWAP_PUBKEY,
    expectedAmount: 50_000n, // 0.05 USDC per leg
    expectedMint: USDC_MINT,
  },
  async (req, _ctx, payment) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const { symbol, amountUsd, price, userWallet } = (body ?? {}) as {
      symbol?: string;
      amountUsd?: number;
      price?: number;
      userWallet?: string;
    };

    if (!symbol || !amountUsd) {
      return Response.json(
        { error: "symbol and amountUsd required" },
        { status: 400 },
      );
    }

    const tokenQty = price && price > 0 ? amountUsd / price : 0;
    const mintAddr = MOCK_MINTS[symbol.toUpperCase()];

    // Graceful degrade: if prerequisites missing, return a mock sig.
    // This keeps the demo flowing if a mint env var or keypair is absent on a
    // given dev machine. The real path below is preferred.
    if (!userWallet || !mintAddr) {
      const txSig = `mock_swap_${symbol}_${Date.now()}`;
      return Response.json({
        txSig,
        symbol,
        amountUsd,
        price,
        tokenQty,
        status: "mock",
        reason: !userWallet
          ? "userWallet not provided in request body"
          : `MOCK_T${symbol.toUpperCase()}_MINT not set in env`,
        paidBy: payment.payer,
      });
    }

    const swapKeypair = loadAgentKeypair("swap");
    if (!swapKeypair) {
      return Response.json(
        { error: "swap keypair not available on this host" },
        { status: 500 },
      );
    }

    let mint: PublicKey;
    let userPubkey: PublicKey;
    try {
      mint = new PublicKey(mintAddr);
      userPubkey = new PublicKey(userWallet);
    } catch {
      return Response.json(
        { error: "invalid mint or userWallet pubkey" },
        { status: 400 },
      );
    }
    const connection = getConnection();

    const swapAta = await getAssociatedTokenAddress(
      mint,
      swapKeypair.publicKey,
    );
    const userAta = await getAssociatedTokenAddress(mint, userPubkey);

    // Convert human tokens to base units (6 decimals)
    const amountBase = BigInt(Math.round(tokenQty * 10 ** MOCK_TOKEN_DECIMALS));
    if (amountBase <= 0n) {
      return Response.json(
        { error: "computed token quantity is zero or negative" },
        { status: 400 },
      );
    }

    const tx = new Transaction().add(
      // Idempotent: no-op if user's ATA for this mint already exists
      createAssociatedTokenAccountIdempotentInstruction(
        swapKeypair.publicKey,
        userAta,
        userPubkey,
        mint,
      ),
      createTransferInstruction(
        swapAta,
        userAta,
        swapKeypair.publicKey,
        amountBase,
      ),
    );

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = swapKeypair.publicKey;
    tx.sign(swapKeypair);

    const txSig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "processed",
    });

    return Response.json({
      txSig,
      symbol,
      amountUsd,
      price,
      tokenQty,
      tokenAmountBase: amountBase.toString(),
      mint: mint.toBase58(),
      recipient: userPubkey.toBase58(),
      status: "filled",
      paidBy: payment.payer,
    });
  },
);

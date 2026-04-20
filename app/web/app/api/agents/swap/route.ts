import { withX402 } from "@agentbazaar/x402/next";
import { PublicKey } from "@solana/web3.js";

export const POST = withX402(
  {
    expectedRecipient: new PublicKey(process.env.AGENT_SWAP_PUBKEY ?? "11111111111111111111111111111111"),
    expectedAmount: 50_000n, // 0.05 USDC per leg
    expectedMint: new PublicKey(process.env.USDC_DEVNET_MINT ?? "11111111111111111111111111111111"),
  },
  async (req, _ctx, payment) => {
    const { symbol, amountUsd } = (await req.json()) as {
      symbol: string;
      amountUsd: number;
    };

    if (!symbol || !amountUsd) {
      return Response.json({ error: "symbol and amountUsd required" }, { status: 400 });
    }

    // Mock transaction signature — real SPL transfer goes here in V1
    const txSig = `mock_swap_${symbol}_${Date.now()}`;

    return Response.json({ txSig, symbol, amountUsd, status: "filled", paidBy: payment.payer });
  },
);
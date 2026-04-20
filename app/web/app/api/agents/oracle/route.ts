import { withX402 } from "@agentbazaar/x402/next";
import { PublicKey } from "@solana/web3.js";

const MOCK_PRICES: Record<string, number> = {
  AAPL: 182.5,
  TSLA: 248.3,
  NVDA: 467.1,
};

// Falls back to system pubkey if env not set — withX402 will reject all calls,
// but individual routes handle 402 gracefully.
const ORACLE_PUBKEY = new PublicKey(process.env.AGENT_ORACLE_PUBKEY ?? "11111111111111111111111111111111");
const USDC_MINT = new PublicKey(process.env.USDC_DEVNET_MINT ?? "11111111111111111111111111111111");

export const POST = withX402(
  {
    expectedRecipient: ORACLE_PUBKEY,
    expectedAmount: 20_000n, // 0.02 USDC
    expectedMint: USDC_MINT,
  },
  async (req, _ctx, payment) => {
    const { symbols } = (await req.json()) as { symbols: string[] };

    if (!symbols?.length) {
      return Response.json({ error: "symbols required" }, { status: 400 });
    }

    const prices: Record<string, number> = {};
    for (const symbol of symbols) {
      prices[symbol] = MOCK_PRICES[symbol] ?? 100;
    }

    return Response.json({ prices, paidBy: payment.payer });
  },
);
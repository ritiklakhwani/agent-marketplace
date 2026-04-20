// TODO: wrap with withX402(0.02, ORACLE_PUBKEY) once shared/x402 is built

// Mock prices used when Pyth fetch fails — Path B fallback per build plan
const MOCK_PRICES: Record<string, number> = {
  AAPL: 182.5,
  TSLA: 248.3,
  NVDA: 467.1,
};

export async function POST(request: Request) {
  const { symbols } = (await request.json()) as { symbols: string[] };

  if (!symbols?.length) {
    return Response.json({ error: "symbols required" }, { status: 400 });
  }

  const prices: Record<string, number> = {};

  for (const symbol of symbols) {
    prices[symbol] = MOCK_PRICES[symbol] ?? 100;
  }

  return Response.json({ prices });
}
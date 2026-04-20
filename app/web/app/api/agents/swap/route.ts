// TODO: wrap with withX402(0.05, SWAP_PUBKEY) once shared/x402 is built
// TODO: replace mock tx sig with real SPL transfer once mint addresses are in env

export async function POST(request: Request) {
  const { symbol, amountUsd } = (await request.json()) as {
    symbol: string;
    amountUsd: number;
  };

  if (!symbol || !amountUsd) {
    return Response.json({ error: "symbol and amountUsd required" }, { status: 400 });
  }

  // Mock transaction signature — real SPL transfer goes here in V1
  const txSig = `mock_swap_${symbol}_${Date.now()}`;

  return Response.json({ txSig, symbol, amountUsd, status: "filled" });
}
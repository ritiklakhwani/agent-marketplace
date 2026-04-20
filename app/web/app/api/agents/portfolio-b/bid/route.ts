// Conservative agent: fixed fee, lower reputation — loses the auction
const INITIAL_FEE = 0.4;
const FLOOR_FEE = 0.4;
const REPUTATION = 30;

export async function POST() {
  return Response.json({
    agentId: "portfolio-b",
    initialFeePct: INITIAL_FEE,
    floorFeePct: FLOOR_FEE,
    reputation: REPUTATION,
    strategy: "conservative",
  });
}
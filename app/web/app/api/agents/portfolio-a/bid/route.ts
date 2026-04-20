// Aggressive agent: starts high, willing to drop to win
const INITIAL_FEE = 0.6;
const FLOOR_FEE = 0.3;
const REPUTATION = 50;

export async function POST() {
  return Response.json({
    agentId: "portfolio-a",
    initialFeePct: INITIAL_FEE,
    floorFeePct: FLOOR_FEE,
    reputation: REPUTATION,
    strategy: "aggressive",
  });
}
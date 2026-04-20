import type { TaskEvent, BidEvent, WinnerSelectedEvent } from "@agent-marketplace/types";

type AuctionTickerProps = {
  events: TaskEvent[];
};

const AGENT_LABELS: Record<string, string> = {
  "portfolio-a": "Portfolio Agent A",
  "portfolio-b": "Portfolio Agent B",
};

export function AuctionTicker({ events }: AuctionTickerProps) {
  const bids = events.filter((e): e is BidEvent => e.type === "bid");
  const winnerEvent = events.find((e): e is WinnerSelectedEvent => e.type === "winner_selected");

  const latestByAgent = bids.reduce<Record<string, number>>((acc, bid) => {
    acc[bid.agent] = bid.feePct;
    return acc;
  }, {});

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Live Auction</p>
          <p className="text-sm text-zinc-500">
            Live Dutch auction — bids stream via SSE from the coordinator.
          </p>
        </div>
        {winnerEvent ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {AGENT_LABELS[winnerEvent.winner] ?? winnerEvent.winner} selected
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {["portfolio-a", "portfolio-b"].map((agentId) => {
          const isWinner =
            winnerEvent?.type === "winner_selected" &&
            winnerEvent.winner === agentId;

          return (
            <div
              key={agentId}
              className={`rounded-2xl border p-4 transition ${
                isWinner
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <p className="text-sm font-semibold text-zinc-900">
                {AGENT_LABELS[agentId]}
              </p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">
                {latestByAgent[agentId] !== undefined
                  ? `${latestByAgent[agentId].toFixed(1)}%`
                  : "--"}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                {isWinner
                  ? winnerEvent.reason
                  : "Waiting for the next bid event"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

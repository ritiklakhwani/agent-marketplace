"use client";

import { motion, AnimatePresence } from "framer-motion";
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
        <AnimatePresence>
          {winnerEvent ? (
            <motion.span
              key="winner-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              {AGENT_LABELS[winnerEvent.winner] ?? winnerEvent.winner} selected
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {["portfolio-a", "portfolio-b"].map((agentId) => {
          const isWinner =
            winnerEvent?.type === "winner_selected" &&
            winnerEvent.winner === agentId;
          const currentBid = latestByAgent[agentId];

          return (
            <motion.div
              key={agentId}
              layout
              animate={{
                borderColor: isWinner ? "#6ee7b7" : "#e4e4e7",
                backgroundColor: isWinner ? "#ecfdf5" : "#fafafa",
              }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border p-4"
            >
              <p className="text-sm font-semibold text-zinc-900">
                {AGENT_LABELS[agentId]}
              </p>

              <div className="mt-2 h-10 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${agentId}-${currentBid ?? "waiting"}`}
                    initial={{ y: 20, opacity: 0, scale: 1.15, color: "#10b981" }}
                    animate={{ y: 0, opacity: 1, scale: 1, color: "#18181b" }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="text-3xl font-semibold"
                  >
                    {currentBid !== undefined ? `${currentBid.toFixed(1)}%` : "--"}
                  </motion.p>
                </AnimatePresence>
              </div>

              <p className="mt-2 text-sm text-zinc-500">
                {isWinner
                  ? winnerEvent.reason
                  : "Waiting for the next bid event"}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

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

const B = "rgba(0,0,0,0.08)";

export function AuctionTicker({ events }: AuctionTickerProps) {
  const bids = events.filter((e): e is BidEvent => e.type === "bid");
  const winnerEvent = events.find((e): e is WinnerSelectedEvent => e.type === "winner_selected");

  const latestByAgent = bids.reduce<Record<string, number>>((acc, bid) => {
    acc[bid.agent] = bid.feePct;
    return acc;
  }, {});

  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Live Auction</p>
          <p className="text-[10px] text-text-tertiary">Dutch · SSE stream</p>
        </div>
        <AnimatePresence>
          {winnerEvent && (
            <motion.span
              key="winner"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[10px] font-medium px-2 py-0.5"
              style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}
            >
              {AGENT_LABELS[winnerEvent.winner] ?? winnerEvent.winner} won
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${B}` }}>
        {["portfolio-a", "portfolio-b"].map((agentId, idx) => {
          const isWinner   = winnerEvent?.winner === agentId;
          const currentBid = latestByAgent[agentId];

          return (
            <motion.div
              key={agentId}
              className="px-4 py-3"
              animate={{ background: isWinner ? "rgba(22,163,74,0.05)" : "transparent" }}
              transition={{ duration: 0.4 }}
              style={idx === 0 ? { borderRight: `1px solid ${B}` } : {}}
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {AGENT_LABELS[agentId]}
              </p>

              <div className="mt-1 h-7 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${agentId}-${currentBid ?? "—"}`}
                    initial={{ y: 14, opacity: 0, color: "#16a34a" }}
                    animate={{ y: 0,  opacity: 1, color: "#111111" }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="text-[22px] font-semibold font-mono tabular-nums leading-none"
                  >
                    {currentBid !== undefined ? `${currentBid.toFixed(1)}%` : "—"}
                  </motion.p>
                </AnimatePresence>
              </div>

              <p className="mt-1 text-[10px] text-text-tertiary">
                {isWinner ? winnerEvent!.reason : "Awaiting bid…"}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

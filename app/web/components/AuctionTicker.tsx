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

const B = "rgba(0,0,0,0.22)";

export function AuctionTicker({ events }: AuctionTickerProps) {
  const bids = events.filter((e): e is BidEvent => e.type === "bid");
  const winnerEvent = events.find((e): e is WinnerSelectedEvent => e.type === "winner_selected");

  const latestByAgent = bids.reduce<Record<string, number>>((acc, bid) => {
    acc[bid.agent] = bid.feePct;
    return acc;
  }, {});

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Live Auction</p>
          <p className="text-[12px] text-text-tertiary">Dutch · SSE stream</p>
        </div>
        <AnimatePresence>
          {winnerEvent && (
            <motion.span
              key="winner"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[12px] font-medium px-3 "
              style={{ background: "var(--color-positive-dim)", color: "var(--color-positive)" }}
            >
              {AGENT_LABELS[winnerEvent.winner] ?? winnerEvent.winner} won
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 flex-1" style={{ borderBottom: `1px solid ${B}` }}>
        {["portfolio-a", "portfolio-b"].map((agentId, idx) => {
          const isWinner   = winnerEvent?.winner === agentId;
          const currentBid = latestByAgent[agentId];
          const letter     = agentId.endsWith("-a") ? "A" : "B";

          return (
            <motion.div
              key={agentId}
              className="relative px-8 py-8 flex flex-col justify-center overflow-hidden"
              animate={{ background: isWinner ? "rgba(22,163,74,0.05)" : "transparent" }}
              transition={{ duration: 0.4 }}
              style={idx === 0 ? { borderRight: `1px solid ${B}` } : {}}
            >
              {/* Agent ID as a watermark — large faded letter lives behind the
                  bid number. Subtle but asserts identity without a redundant
                  header. */}
              <span
                aria-hidden
                className="absolute font-mono font-semibold select-none pointer-events-none"
                style={{
                  right: -8,
                  top: -24,
                  fontSize: "180px",
                  lineHeight: 1,
                  color: isWinner ? "rgba(22,163,74,0.08)" : "rgba(0,0,0,0.04)",
                  letterSpacing: "-0.05em",
                }}
              >
                {letter}
              </span>

              <div className="relative h-20 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${agentId}-${currentBid ?? "—"}`}
                    initial={{ y: 14, opacity: 0, color: "#16a34a" }}
                    animate={{ y: 0,  opacity: 1, color: "#111111" }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="text-[72px] font-semibold font-mono tabular-nums leading-none"
                  >
                    {currentBid !== undefined ? `${currentBid.toFixed(1)}%` : "—"}
                  </motion.p>
                </AnimatePresence>
              </div>

              <p className="relative mt-4 text-[12px] text-text-tertiary">
                <span className="font-mono text-text-primary mr-2">· {letter}</span>
                {isWinner ? winnerEvent!.reason : "Awaiting bid…"}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

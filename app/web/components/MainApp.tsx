"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { TaskInput } from "@/components/TaskInput";
import { AuctionTicker } from "@/components/AuctionTicker";
import { CompositionChain } from "@/components/CompositionChain";
import { StatusPanel } from "@/components/StatusPanel";
import { PortfolioView } from "@/components/PortfolioView";
import { AgentOverview } from "@/components/AgentOverview";
import { useTaskStream } from "@/hooks/useTaskStream";
import { agents } from "@/lib/agents";

const swapAgent  = agents.find((a) => a.slug === "swap-agent")!;
const remitAgent = agents.find((a) => a.slug === "remittance-agent")!;

const TABS = [
  { slug: "swap-agent"       as const, label: swapAgent.name  },
  { slug: "remittance-agent" as const, label: remitAgent.name },
];

const B = "rgba(0,0,0,0.08)";

export function MainApp() {
  const [activeAgent,  setActiveAgent]  = useState<"swap-agent" | "remittance-agent">("swap-agent");
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const { publicKey } = useWallet();

  const swapStream  = useTaskStream();
  const remitStream = useTaskStream();
  const stream       = activeAgent === "swap-agent" ? swapStream : remitStream;
  const currentAgent = activeAgent === "swap-agent" ? swapAgent  : remitAgent;

  const handleSubmit = ({ prompt, insurance }: { prompt: string; insurance: boolean }) => {
    if (publicKey) {
      stream.startStream(prompt, publicKey.toBase58(), insurance);
    } else {
      stream.startMockStream(activeAgent, insurance);
    }
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-bg text-text-primary">

      {/* ── NAVBAR ── */}
      <nav
        className="shrink-0 flex items-stretch"
        style={{ height: 44, background: "#ffffff", borderBottom: `1px solid ${B}` }}
        onMouseLeave={() => setHoveredAgent(null)}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-5 shrink-0"
          style={{ borderRight: `1px solid ${B}` }}
        >
          <span className="text-[15px] font-bold text-text-primary select-none">◈</span>
          <span className="text-[12px] font-semibold tracking-tight text-text-primary">AgentBazaar</span>
        </div>

        {/* Toggle — centred */}
        <div className="flex-1 flex items-stretch justify-center">
          <div className="flex items-stretch" style={{ borderLeft: `1px solid ${B}`, borderRight: `1px solid ${B}` }}>
            {TABS.map(({ slug, label }, idx) => {
              const isActive  = activeAgent === slug;
              const isHovered = hoveredAgent === slug;
              return (
                <button
                  key={slug}
                  onClick={() => setActiveAgent(slug)}
                  onMouseEnter={() => setHoveredAgent(slug)}
                  className="relative flex items-center px-8 h-full bg-transparent border-none outline-none cursor-pointer z-[1] transition-colors duration-150"
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: isActive ? "#111111" : isHovered ? "#6b7280" : "#a1a1aa",
                    borderRight: idx < TABS.length - 1 ? `1px solid ${B}` : "none",
                  }}
                >
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="tab-hover"
                      className="absolute inset-0"
                      style={{ background: "rgba(0,0,0,0.02)", zIndex: -1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0"
                      style={{ height: 1.5, background: "#111111" }}
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right nav */}
        <div
          className="flex items-center gap-5 px-5 shrink-0"
          style={{ borderLeft: `1px solid ${B}` }}
        >
          {["Docs", "About"].map((label) => (
            <a
              key={label}
              href="#"
              className="text-[11px] transition-colors duration-150"
              style={{ color: "#a1a1aa", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#6b7280")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
            >
              {label}
            </a>
          ))}
          <WalletButton />
        </div>
      </nav>

      {/* ── WORKSPACE ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-bg">

        {/* Banners */}
        {(stream.error || !publicKey) && (
          <div className="shrink-0 flex flex-col gap-1.5 px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
            {stream.error && (
              <p className="text-[11px] px-3 py-1.5" style={{ background: "var(--color-negative-dim)", border: "1px solid rgba(220,38,38,0.12)", color: "var(--color-negative)" }}>
                {stream.error}
              </p>
            )}
            {!publicKey && (
              <p className="text-[11px] px-3 py-1.5" style={{ background: "rgba(161,161,170,0.06)", border: `1px solid ${B}`, color: "#6b7280" }}>
                Wallet not connected — running in mock mode.
              </p>
            )}
          </div>
        )}

        {/* Main grid */}
        <div className="flex-1 min-h-0 overflow-hidden grid xl:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col min-h-0 overflow-hidden" style={{ borderRight: `1px solid ${B}` }}>
            <TaskInput
              isRunning={stream.isRunning}
              defaultPrompt={currentAgent.promptPlaceholder}
              onSubmit={handleSubmit}
              shellMode={currentAgent.mode}
            />
            {activeAgent === "swap-agent" ? (
              <>
                <PortfolioView rows={swapStream.portfolio} />
                <AuctionTicker events={swapStream.events} />
              </>
            ) : (
              <AgentOverview agent={remitAgent} />
            )}
          </div>

          <div className="flex flex-col min-h-0 overflow-hidden">
            <StatusPanel taskId={stream.taskId} isRunning={stream.isRunning} events={stream.events} />
            <CompositionChain events={stream.events} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-center" style={{ height: 36, borderTop: `1px solid ${B}` }}>
          <button
            onClick={stream.reset}
            className="text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150"
            style={{ color: "#a1a1aa" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#6b7280")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
          >
            Reset session
          </button>
        </div>
      </div>
    </div>
  );
}

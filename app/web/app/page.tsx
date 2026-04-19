"use client";

import { useMemo } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AuctionTicker } from "@/components/AuctionTicker";
import { CompositionChain } from "@/components/CompositionChain";
import { PortfolioView } from "@/components/PortfolioView";
import { StatusPanel } from "@/components/StatusPanel";
import { TaskInput } from "@/components/TaskInput";
import { useTaskStream } from "@/hooks/useTaskStream";
import { initialPortfolio } from "@/lib/mockData";

export default function Home() {
  const { taskId, isRunning, events, startMockStream, reset } = useTaskStream();

  const portfolioRows = useMemo(() => {
    const latestCompleteSteps = events.filter(
      (event) => event.type === "execution_step" && event.status === "complete"
    ).length;

    if (latestCompleteSteps < 4) {
      return initialPortfolio;
    }

    return [
      { symbol: "AAPL", target: 40, current: 39 },
      { symbol: "TSLA", target: 30, current: 31 },
      { symbol: "NVDA", target: 30, current: 30 },
    ];
  }, [events]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4efe1,transparent_28%),linear-gradient(180deg,#f7f5ef_0%,#ece7dc_100%)] text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:px-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              AgentBazaar V0
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              Solana agent marketplace shell for the SCBC demo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Build the frontend now with mocked flows, then swap in the real
              Router, Coordinator, Oracle, Swap, and on-chain reputation once
              Phase 1 lands.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
            >
              Reset Mock State
            </button>
            <WalletMultiButton className="!h-11 !rounded-full !bg-zinc-900 !px-5 !text-sm !font-medium" />
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <TaskInput
              isRunning={isRunning}
              onSubmit={({ insurance }) => startMockStream(insurance)}
            />
            <PortfolioView rows={portfolioRows} />
            <AuctionTicker events={events} />
          </div>

          <div className="space-y-6">
            <StatusPanel taskId={taskId} isRunning={isRunning} events={events} />
            <CompositionChain events={events} />
          </div>
        </section>
      </main>
    </div>
  );
}

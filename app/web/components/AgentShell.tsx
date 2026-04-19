"use client";

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { AuctionTicker } from "@/components/AuctionTicker";
import { CompositionChain } from "@/components/CompositionChain";
import { AgentOverview } from "@/components/AgentOverview";
import { PortfolioView } from "@/components/PortfolioView";
import { StatusPanel } from "@/components/StatusPanel";
import { TaskInput } from "@/components/TaskInput";
import { useTaskStream } from "@/hooks/useTaskStream";
import { AgentConfig } from "@/lib/agents";

type AgentShellProps = {
  agent: AgentConfig;
};

export function AgentShell({ agent }: AgentShellProps) {
  const { taskId, isRunning, events, portfolio, startMockStream, reset } = useTaskStream();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4efe1,transparent_28%),linear-gradient(180deg,#f7f5ef_0%,#ece7dc_100%)] text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:px-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 transition hover:text-zinc-900"
            >
              Dashboard
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              {agent.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              {agent.headline}
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
            <WalletButton />
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <TaskInput
              isRunning={isRunning}
              defaultPrompt={agent.promptPlaceholder}
              onSubmit={({ insurance }) => startMockStream(agent.slug, insurance)}
              shellMode={agent.mode}
            />
            {agent.mode === "auction" ? (
              <PortfolioView rows={portfolio} />
            ) : (
              <AgentOverview agent={agent} />
            )}
            {agent.mode === "auction" ? <AuctionTicker events={events} /> : null}
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

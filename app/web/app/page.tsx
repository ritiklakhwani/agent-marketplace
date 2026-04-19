import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f4efe1,transparent_28%),linear-gradient(180deg,#f7f5ef_0%,#ece7dc_100%)] text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:px-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              AgentBazaar V0
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              A marketplace for specialized Solana agents
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Start at the landing page, browse the available V0 agents, then
              enter an agent-specific workspace for the actual task flow.
            </p>
          </div>
          <WalletButton />
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              SCBC V0
            </span>
            <h2 className="mt-5 text-5xl font-semibold tracking-tight text-zinc-950">
              Two agents. One marketplace story. One clean demo path.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600">
              The swap agent carries the flagship rebalance demo. The
              remittance agent proves the product is broader than a single DeFi
              trick. Both live behind a marketplace dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Open Dashboard
              </Link>
              <Link
                href="/swap-agent"
                className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950"
              >
                Jump to Swap Agent
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">
                What the user sees
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                <li>Landing page at `/`</li>
                <li>Agent selection on `/dashboard`</li>
                <li>Agent-specific workspace on `/swap-agent` or `/remittance-agent`</li>
              </ul>
            </div>
            <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">
                V0 agents available now
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                  <p className="text-sm font-medium text-zinc-900">Swap Agent</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Rebalance flow, live bidding, composition, insurance.
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                  <p className="text-sm font-medium text-zinc-900">
                    Remittance Agent
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Direct payments flow with a V1 path to Dodo rails.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { agents } from "@/lib/agents";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#efe4cf,transparent_30%),linear-gradient(180deg,#f7f1e5_0%,#e6e0d2_100%)] text-zinc-900">
      <main className="mx-auto max-w-7xl px-6 py-8 md:px-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/"
              className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 transition hover:text-zinc-900"
            >
              Back to Landing
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              Agent Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              For SCBC V0, the marketplace exposes two agents: the flagship swap
              flow and the remittance proof point.
            </p>
          </div>
          <WalletButton />
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {agents.map((agent) => (
            <Link
              key={agent.slug}
              href={`/${agent.slug}`}
              className="group rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-zinc-900 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                  {agent.category}
                </span>
                <span className="text-sm text-zinc-400 transition group-hover:text-zinc-700">
                  Open
                </span>
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-950">
                {agent.name}
              </h2>
              <p className="mt-2 text-sm font-medium text-zinc-600">
                {agent.shortLabel}
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-600">
                {agent.description}
              </p>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

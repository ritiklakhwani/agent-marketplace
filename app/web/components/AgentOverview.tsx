import { AgentConfig } from "@/lib/agents";

type AgentOverviewProps = {
  agent: AgentConfig;
};

export function AgentOverview({ agent }: AgentOverviewProps) {
  const content =
    agent.slug === "swap-agent"
      ? {
          title: "Portfolio Context",
          subtitle:
            "Current vs target allocation for the flagship rebalance demo.",
          rows: [
            ["Target", "40% AAPL • 30% TSLA • 30% NVDA"],
            ["Current", "100% cash before execution"],
            ["Execution", "Oracle quote + 3 swap legs"],
          ],
        }
      : {
          title: "Transfer Context",
          subtitle:
            "Simple remittance shell for V0 with a path to real rails in Frontier.",
          rows: [
            ["Asset", "Devnet USDC"],
            ["Route", "Wallet to wallet on Solana"],
            ["V1 upgrade", "Dodo-backed INR settlement"],
          ],
        };

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {content.title}
          </p>
          <p className="text-sm text-zinc-500">{content.subtitle}</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
          {agent.detailBadge}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {content.rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
          >
            <span className="text-sm font-medium text-zinc-700">{label}</span>
            <span className="text-sm text-zinc-900">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

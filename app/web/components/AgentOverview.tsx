import { AgentConfig } from "@/lib/agents";

type AgentOverviewProps = {
  agent: AgentConfig;
};

const B = "rgba(0,0,0,0.22)";

export function AgentOverview({ agent }: AgentOverviewProps) {
  const content =
    agent.slug === "swap-agent"
      ? {
          title: "Portfolio Context",
          subtitle: "Flagship rebalance demo",
          rows: [
            ["Target",    "40% AAPL · 30% TSLA · 30% NVDA"],
            ["Starting",  "100% cash"],
            ["Execution", "Oracle quote + 3 swap legs"],
          ],
        }
      : {
          title: "Transfer Context",
          subtitle: "Solana devnet → Ethereum Sepolia",
          rows: [
            ["Asset",      "Devnet USDC"],
            ["Route",      "Solana devnet → Ethereum Sepolia"],
            ["Mechanism",  "Circle CCTP V2 · burn, attest, mint"],
            ["Latency",    "~60 – 90 seconds"],
          ],
        };

  return (
    // flex-1 + min-h-0 lets this section absorb the remaining column height,
    // and overflow-y-auto makes it scroll internally when siblings above
    // (e.g. Fund-from-Arc during a bridge) grow vertically.
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="shrink-0 flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{content.title}</p>
          <p className="text-[12px] text-text-tertiary">{content.subtitle}</p>
        </div>
        <span className="text-[12px] font-medium px-3 py-1" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}>
          {agent.detailBadge}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {content.rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center px-6 py-5 transition-colors duration-100"
            style={{ borderBottom: `1px solid ${B}` }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="w-40 shrink-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{label}</span>
            <span className="text-[14px] text-text-primary">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

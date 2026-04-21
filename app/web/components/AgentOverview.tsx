import { AgentConfig } from "@/lib/agents";

type AgentOverviewProps = {
  agent: AgentConfig;
};

const B = "rgba(0,0,0,0.08)";

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
          subtitle: "Circle CCTP V2 cross-chain",
          rows: [
            ["Asset",    "Devnet USDC"],
            ["Route",    "Solana → Ethereum via CCTP V2"],
            ["V1",       "Dodo-backed INR settlement"],
          ],
        };

  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{content.title}</p>
          <p className="text-[10px] text-text-tertiary">{content.subtitle}</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5" style={{ background: "rgba(14,165,233,0.08)", color: "#0284c7" }}>
          {agent.detailBadge}
        </span>
      </div>

      {content.rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center px-4 py-2.5 transition-colors duration-100"
          style={{ borderBottom: `1px solid ${B}` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="w-24 shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</span>
          <span className="text-[11px] text-text-primary">{value}</span>
        </div>
      ))}
    </section>
  );
}

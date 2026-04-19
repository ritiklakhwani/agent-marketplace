export type AgentSlug = "swap-agent" | "remittance-agent";

export type AgentConfig = {
  slug: AgentSlug;
  name: string;
  shortLabel: string;
  routeLabel: string;
  category: string;
  description: string;
  headline: string;
  promptPlaceholder: string;
  mode: "auction" | "direct";
  detailBadge: string;
};

export const agents: AgentConfig[] = [
  {
    slug: "swap-agent",
    name: "Swap Agent",
    shortLabel: "Portfolio Rebalance",
    routeLabel: "/swap-agent",
    category: "DeFi",
    description:
      "Flagship SCBC flow: rebalance a stock-like portfolio, show live bidding, then compose Oracle and Swap sub-agents.",
    headline:
      "Run the flagship rebalance flow with live bidding, composition, and insurance.",
    promptPlaceholder: "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500",
    mode: "auction",
    detailBadge: "xStocks mock path",
  },
  {
    slug: "remittance-agent",
    name: "Remittance Agent",
    shortLabel: "Cross-Border Transfer",
    routeLabel: "/remittance-agent",
    category: "Payments",
    description:
      "Secondary V0 proof point: move USDC to another Solana address and set up the cross-border narrative for Dodo later.",
    headline:
      "Run the payments flow that proves AgentBazaar is more than a portfolio app.",
    promptPlaceholder: "Send $20 USDC to 8xY...abc on Solana devnet",
    mode: "direct",
    detailBadge: "USDC transfer mock path",
  },
];

export function getAgentBySlug(slug: string) {
  return agents.find((agent) => agent.slug === slug);
}

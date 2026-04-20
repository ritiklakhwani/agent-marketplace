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
    detailBadge: "Devnet · xStocks preview",
  },
  {
    slug: "remittance-agent",
    name: "Remittance Agent",
    shortLabel: "Cross-Border Transfer",
    routeLabel: "/remittance-agent",
    category: "Payments",
    description:
      "Cross-chain USDC transfer via Circle CCTP V2: burn on Solana devnet, attest, mint on Ethereum Sepolia.",
    headline:
      "Burn USDC on Solana, get Circle attestation, mint on Ethereum — live CCTP V2 demo.",
    promptPlaceholder: "Send $10 USDC to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 on Ethereum",
    mode: "direct",
    detailBadge: "Circle CCTP V2",
  },
];

export function getAgentBySlug(slug: string) {
  return agents.find((agent) => agent.slug === slug);
}

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fetchAgent, getConnection } from "@agentbazaar/solana";
import { PublicKey } from "@solana/web3.js";

const AGENTS = [
  ["portfolio-a", process.env.AGENT_PORTFOLIO_A_PUBKEY],
  ["portfolio-b", process.env.AGENT_PORTFOLIO_B_PUBKEY],
  ["oracle", process.env.AGENT_ORACLE_PUBKEY],
  ["swap", process.env.AGENT_SWAP_PUBKEY],
  ["remit", process.env.AGENT_REMIT_PUBKEY],
] as const;

async function main() {
  const connection = getConnection();
  for (const [id, pubkey] of AGENTS) {
    if (!pubkey) {
      console.log(`${id}: MISSING env var`);
      continue;
    }
    const agent = await fetchAgent(new PublicKey(pubkey), connection);
    if (!agent) {
      console.log(`${id}: NOT FOUND on-chain`);
      continue;
    }
    console.log(
      `${id.padEnd(12)} score=${String(agent.score).padStart(3)} ` +
        `cat=${agent.category.padEnd(10)} endpoint=${agent.endpoint}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

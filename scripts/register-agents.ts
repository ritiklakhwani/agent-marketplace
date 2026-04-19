/**
 * Registers the 5 V0 marketplace agents on Solana devnet.
 *
 * For each agent:
 *   1. Loads or generates a dedicated keypair at ~/.config/solana/agents/<name>.json
 *   2. Funds it from the agent hot wallet if it has less than MIN_SOL
 *   3. Registers it via `register_agent` (agent pays its own PDA rent)
 *   4. Bumps its reputation to the demo-staged starting score
 *   5. Appends the pubkey to .env.local
 *
 * Idempotent: re-running skips already-registered agents.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  AGENT_HOT_WALLET,
  bumpReputation,
  deriveAgentPda,
  fetchAgent,
  getConnection,
  registerAgent,
} from "@agentbazaar/solana";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface AgentSpec {
  id: string;
  envKey: string;
  name: string;
  endpointPath: string;
  category: string;
  priceHintMicroUsdc: bigint;
  initialScore: number;
}

const AGENT_KEYPAIR_DIR = path.join(os.homedir(), ".config/solana/agents");
const ENV_LOCAL_PATH = path.join(
  process.cwd().replace(/\/scripts$/, ""),
  ".env.local",
);
const MIN_SOL = 0.02;
const FUND_SOL = 0.05;
const BASE_URL =
  process.env.AGENT_BASE_URL || "http://localhost:3000/api/agents";

const AGENT_SPECS: AgentSpec[] = [
  {
    id: "portfolio-a",
    envKey: "AGENT_PORTFOLIO_A_PUBKEY",
    name: "xStocks Portfolio A",
    endpointPath: "/portfolio-a",
    category: "portfolio",
    priceHintMicroUsdc: 600_000n, // 0.60 USDC/task indicative
    initialScore: 50,
  },
  {
    id: "portfolio-b",
    envKey: "AGENT_PORTFOLIO_B_PUBKEY",
    name: "xStocks Portfolio B",
    endpointPath: "/portfolio-b",
    category: "portfolio",
    priceHintMicroUsdc: 400_000n,
    initialScore: 30,
  },
  {
    id: "oracle",
    envKey: "AGENT_ORACLE_PUBKEY",
    name: "Pyth Price Oracle",
    endpointPath: "/oracle",
    category: "oracle",
    priceHintMicroUsdc: 20_000n, // 0.02 USDC
    initialScore: 80,
  },
  {
    id: "swap",
    envKey: "AGENT_SWAP_PUBKEY",
    name: "Jupiter Swap",
    endpointPath: "/swap",
    category: "swap",
    priceHintMicroUsdc: 50_000n, // 0.05 USDC per leg
    initialScore: 80,
  },
  {
    id: "remit",
    envKey: "AGENT_REMIT_PUBKEY",
    name: "USDC Remit",
    endpointPath: "/remit",
    category: "payments",
    priceHintMicroUsdc: 10_000n, // 0.01 USDC
    initialScore: 60,
  },
];

function loadOrCreateKeypair(id: string): Keypair {
  fs.mkdirSync(AGENT_KEYPAIR_DIR, { recursive: true, mode: 0o700 });
  const filePath = path.join(AGENT_KEYPAIR_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    const bytes = JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)), {
    mode: 0o600,
  });
  return kp;
}

async function fundIfNeeded(
  connection: Connection,
  recipient: PublicKey,
): Promise<void> {
  const lamports = await connection.getBalance(recipient);
  if (lamports >= MIN_SOL * LAMPORTS_PER_SOL) return;

  const ix = SystemProgram.transfer({
    fromPubkey: AGENT_HOT_WALLET.publicKey,
    toPubkey: recipient,
    lamports: FUND_SOL * LAMPORTS_PER_SOL,
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [
    AGENT_HOT_WALLET,
  ]);
  console.log(`    funded ${FUND_SOL} SOL -> ${recipient.toBase58()} (${sig})`);
}

function upsertEnvLine(key: string, value: string): void {
  let contents = "";
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    contents = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
  }
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(contents)) {
    contents = contents.replace(re, line);
  } else {
    if (!contents.endsWith("\n") && contents.length > 0) contents += "\n";
    contents += line + "\n";
  }
  fs.writeFileSync(ENV_LOCAL_PATH, contents);
}

async function main() {
  const connection = getConnection();
  console.log(`RPC: ${connection.rpcEndpoint}`);
  console.log(`Hot wallet: ${AGENT_HOT_WALLET.publicKey.toBase58()}\n`);

  for (const spec of AGENT_SPECS) {
    console.log(`-- ${spec.id} --`);
    const agentKp = loadOrCreateKeypair(spec.id);
    console.log(`    pubkey:  ${agentKp.publicKey.toBase58()}`);

    const [pda] = deriveAgentPda(agentKp.publicKey);
    console.log(`    pda:     ${pda.toBase58()}`);

    const existing = await fetchAgent(agentKp.publicKey, connection);
    if (existing) {
      console.log(`    already registered (score=${existing.score})`);
      upsertEnvLine(spec.envKey, agentKp.publicKey.toBase58());
      continue;
    }

    await fundIfNeeded(connection, agentKp.publicKey);

    const endpoint = `${BASE_URL}${spec.endpointPath}`;
    const { txSig, agentPda } = await registerAgent({
      owner: agentKp,
      name: spec.name,
      endpoint,
      category: spec.category,
      priceHint: spec.priceHintMicroUsdc,
      connection,
    });
    console.log(`    registered: ${txSig}`);

    if (spec.initialScore !== 0) {
      const bumpSig = await bumpReputation(
        agentKp.publicKey,
        spec.initialScore,
        0n,
        connection,
      );
      console.log(`    staged score=+${spec.initialScore}: ${bumpSig}`);
    }

    upsertEnvLine(spec.envKey, agentKp.publicKey.toBase58());
    void agentPda;
  }

  console.log("\nAll agents registered. Pubkeys written to .env.local");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

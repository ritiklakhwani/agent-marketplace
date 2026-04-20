/**
 * Creates 3 mock SPL token mints on Solana devnet (tAAPL, tTSLA, tNVDA)
 * and mints 1,000,000 supply of each into the Swap Agent's ATA.
 *
 * These act as the underlying assets the Swap Agent trades against during
 * Path A rebalances (real Pyth prices drive the decision, mock SPL tokens
 * move under the hood — tAAPL/tTSLA/tNVDA are swapped in for USDC from the
 * user's wallet).
 *
 * Idempotent: re-running skips any symbol whose MOCK_<SYMBOL>_MINT env var
 * is already set AND whose mint still exists on-chain.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { AGENT_HOT_WALLET, getConnection } from "@agentbazaar/solana";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const ENV_LOCAL_PATH = path.join(process.cwd(), ".env.local");
const DECIMALS = 6;
const MINT_SUPPLY = 1_000_000n * 10n ** BigInt(DECIMALS); // 1M tokens, 6 decimals

interface MockMintSpec {
  symbol: string;
  envKey: string;
}

const MOCK_MINTS: MockMintSpec[] = [
  { symbol: "tAAPL", envKey: "MOCK_TAAPL_MINT" },
  { symbol: "tTSLA", envKey: "MOCK_TTSLA_MINT" },
  { symbol: "tNVDA", envKey: "MOCK_TNVDA_MINT" },
];

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
  const swapPubkeyStr = process.env.AGENT_SWAP_PUBKEY;
  if (!swapPubkeyStr) {
    throw new Error(
      "AGENT_SWAP_PUBKEY missing in .env.local. Run register-agents.ts first.",
    );
  }
  const swapPubkey = new PublicKey(swapPubkeyStr);

  console.log(`RPC: ${connection.rpcEndpoint}`);
  console.log(`Mint authority: ${AGENT_HOT_WALLET.publicKey.toBase58()}`);
  console.log(`Mint supply target: Swap Agent (${swapPubkey.toBase58()})\n`);

  for (const spec of MOCK_MINTS) {
    console.log(`-- ${spec.symbol} --`);

    const existing = process.env[spec.envKey];
    if (existing) {
      try {
        const mintPubkey = new PublicKey(existing);
        const info = await connection.getAccountInfo(mintPubkey);
        if (info) {
          console.log(`    already exists: ${existing} (skipping)`);
          continue;
        }
      } catch {
        // Fall through to creation.
      }
    }

    const mint = await createMint(
      connection,
      AGENT_HOT_WALLET,
      AGENT_HOT_WALLET.publicKey, // mint authority
      null, // no freeze authority
      DECIMALS,
    );
    console.log(`    mint:    ${mint.toBase58()}`);

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      AGENT_HOT_WALLET, // payer
      mint,
      swapPubkey, // owner of the ATA
    );
    console.log(`    ata:     ${ata.address.toBase58()}`);

    const mintSig = await mintTo(
      connection,
      AGENT_HOT_WALLET, // payer
      mint,
      ata.address,
      AGENT_HOT_WALLET, // mint authority
      MINT_SUPPLY,
    );
    console.log(`    minted ${MINT_SUPPLY / 10n ** BigInt(DECIMALS)} ${spec.symbol}: ${mintSig}`);

    upsertEnvLine(spec.envKey, mint.toBase58());
  }

  console.log("\nAll mock mints created. Addresses written to .env.local");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

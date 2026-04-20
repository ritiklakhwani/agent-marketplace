import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Loads an agent keypair from ~/.config/solana/agents/<id>.json (P1's generated files).
// Returns null if the file doesn't exist — callers fall back to skipping x402.
export function loadAgentKeypair(id: string): Keypair | null {
  const filePath = path.join(os.homedir(), ".config/solana/agents", `${id}.json`);
  try {
    const bytes = JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}
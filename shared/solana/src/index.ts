import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import registryIdl from "../idl/registry.json";
import insuranceIdl from "../idl/insurance.json";

// ---------- Agent hot wallet (trusted signer) ----------
const HOT_WALLET_PATH = path.join(os.homedir(), ".config/solana/agent-hot.json");

function loadKeypair(secretPath: string): Keypair {
  const bytes = JSON.parse(fs.readFileSync(secretPath, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export const AGENT_HOT_WALLET: Keypair = loadKeypair(HOT_WALLET_PATH);

// ---------- Program IDs (read from IDL so they stay in sync) ----------
export const REGISTRY_PROGRAM_ID = new PublicKey(
  (registryIdl as { address: string }).address,
);
export const INSURANCE_PROGRAM_ID = new PublicKey(
  (insuranceIdl as { address: string }).address,
);

// ---------- Seed constants (mirror the Rust constants) ----------
export const AGENT_SEED = Buffer.from("agent");
export const INSURANCE_POOL_SEED = Buffer.from("insurance_pool");
export const INSURANCE_VAULT_SEED = Buffer.from("insurance_vault");

// ---------- RPC / provider ----------
export function defaultRpc(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    process.env.SOLANA_RPC ||
    "https://api.devnet.solana.com"
  );
}

export function getConnection(rpc: string = defaultRpc()): Connection {
  return new Connection(rpc, "confirmed");
}

export function getProvider(
  connection: Connection = getConnection(),
  signer: Keypair = AGENT_HOT_WALLET,
): AnchorProvider {
  return new AnchorProvider(connection, new Wallet(signer), {
    commitment: "confirmed",
  });
}

// ---------- Typed program clients ----------
// V0: we use `any` for IDL typing to avoid the Anchor type-generation ritual.
// Helpers below give back typed behavior at the call site.
export function getRegistryClient(
  connection?: Connection,
  signer?: Keypair,
): Program {
  const provider = getProvider(connection, signer);
  anchor.setProvider(provider);
  return new Program(registryIdl as anchor.Idl, provider);
}

export function getInsuranceClient(
  connection?: Connection,
  signer?: Keypair,
): Program {
  const provider = getProvider(connection, signer);
  anchor.setProvider(provider);
  return new Program(insuranceIdl as anchor.Idl, provider);
}

// ---------- PDA helpers ----------
export function deriveAgentPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AGENT_SEED, owner.toBuffer()],
    REGISTRY_PROGRAM_ID,
  );
}

export function deriveInsurancePoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INSURANCE_POOL_SEED],
    INSURANCE_PROGRAM_ID,
  );
}

export function deriveInsuranceVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INSURANCE_VAULT_SEED],
    INSURANCE_PROGRAM_ID,
  );
}

// ---------- Agent metadata types ----------
export interface AgentAccount {
  owner: PublicKey;
  name: string;
  endpoint: string;
  category: string;
  priceHint: bigint;
  successes: number;
  failures: number;
  score: number;
  totalVolume: bigint;
  bump: number;
}

function toAgentAccount(raw: Record<string, unknown>): AgentAccount {
  return {
    owner: raw.owner as PublicKey,
    name: raw.name as string,
    endpoint: raw.endpoint as string,
    category: raw.category as string,
    priceHint: BigInt((raw.priceHint as BN).toString()),
    successes: Number(raw.successes),
    failures: Number(raw.failures),
    score: Number(raw.score),
    totalVolume: BigInt((raw.totalVolume as BN).toString()),
    bump: Number(raw.bump),
  };
}

// ---------- Registry reads ----------
export async function fetchAgent(
  agentOwner: PublicKey,
  connection: Connection = getConnection(),
): Promise<AgentAccount | null> {
  const registry = getRegistryClient(connection);
  const [pda] = deriveAgentPda(agentOwner);
  try {
    const raw = await (registry.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).agent.fetch(pda);
    return toAgentAccount(raw);
  } catch {
    return null;
  }
}

export async function readReputation(
  agentOwner: PublicKey,
  connection: Connection = getConnection(),
): Promise<number> {
  const agent = await fetchAgent(agentOwner, connection);
  return agent?.score ?? 0;
}

// ---------- Registry writes ----------
export async function registerAgent(params: {
  owner: Keypair;
  name: string;
  endpoint: string;
  category: string;
  priceHint: bigint;
  connection?: Connection;
}): Promise<{ txSig: string; agentPda: PublicKey }> {
  const connection = params.connection ?? getConnection();
  const registry = getRegistryClient(connection, params.owner);
  const [agentPda] = deriveAgentPda(params.owner.publicKey);

  const txSig = await registry.methods
    .registerAgent(
      params.name,
      params.endpoint,
      params.category,
      new BN(params.priceHint.toString()),
    )
    .accounts({
      agent: agentPda,
      owner: params.owner.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([params.owner])
    .rpc();

  return { txSig, agentPda };
}

export async function incrementReputation(
  agentOwner: PublicKey,
  volume: bigint,
  connection: Connection = getConnection(),
): Promise<string> {
  const registry = getRegistryClient(connection, AGENT_HOT_WALLET);
  const [agentPda] = deriveAgentPda(agentOwner);
  return registry.methods
    .updateReputation(1, new BN(volume.toString()))
    .accounts({
      agent: agentPda,
      authority: AGENT_HOT_WALLET.publicKey,
    })
    .signers([AGENT_HOT_WALLET])
    .rpc();
}

export async function decrementReputation(
  agentOwner: PublicKey,
  connection: Connection = getConnection(),
): Promise<string> {
  const registry = getRegistryClient(connection, AGENT_HOT_WALLET);
  const [agentPda] = deriveAgentPda(agentOwner);
  return registry.methods
    .updateReputation(-1, new BN(0))
    .accounts({
      agent: agentPda,
      authority: AGENT_HOT_WALLET.publicKey,
    })
    .signers([AGENT_HOT_WALLET])
    .rpc();
}

// Used for demo staging: bump reputation by an arbitrary delta.
export async function bumpReputation(
  agentOwner: PublicKey,
  delta: number,
  volume: bigint = 0n,
  connection: Connection = getConnection(),
): Promise<string> {
  const registry = getRegistryClient(connection, AGENT_HOT_WALLET);
  const [agentPda] = deriveAgentPda(agentOwner);
  return registry.methods
    .updateReputation(delta, new BN(volume.toString()))
    .accounts({
      agent: agentPda,
      authority: AGENT_HOT_WALLET.publicKey,
    })
    .signers([AGENT_HOT_WALLET])
    .rpc();
}

// ---------- Insurance writes ----------
export async function releaseInsurance(params: {
  taskId: string;
  recipientTokenAccount: PublicKey;
  amount: bigint;
  connection?: Connection;
}): Promise<string> {
  const connection = params.connection ?? getConnection();
  const insurance = getInsuranceClient(connection, AGENT_HOT_WALLET);
  const [poolPda] = deriveInsurancePoolPda();
  const [vaultPda] = deriveInsuranceVaultPda();

  return insurance.methods
    .releaseToUser(params.taskId, new BN(params.amount.toString()))
    .accounts({
      pool: poolPda,
      vault: vaultPda,
      recipientTokenAccount: params.recipientTokenAccount,
      authority: AGENT_HOT_WALLET.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([AGENT_HOT_WALLET])
    .rpc();
}

// ---------- Combined failure handler (called by Portfolio B intentional-fail flow) ----------
export interface HandleAgentFailureParams {
  taskId: string;
  agentOwner: PublicKey;
  userTokenAccount: PublicKey;
  refundAmount: bigint; // micro-USDC
  hasInsurance: boolean;
  connection?: Connection;
}

export interface HandleAgentFailureResult {
  refundTxSig?: string;
  slashTxSig: string;
}

export async function handleAgentFailure(
  params: HandleAgentFailureParams,
): Promise<HandleAgentFailureResult> {
  let refundTxSig: string | undefined;
  if (params.hasInsurance) {
    refundTxSig = await releaseInsurance({
      taskId: params.taskId,
      recipientTokenAccount: params.userTokenAccount,
      amount: params.refundAmount,
      connection: params.connection,
    });
  }
  const slashTxSig = await decrementReputation(
    params.agentOwner,
    params.connection,
  );
  return { refundTxSig, slashTxSig };
}

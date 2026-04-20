"use client";

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createApproveInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

export const USDC_DECIMALS = 6;

// Total USDC the user delegates to the Coordinator for an entire demo session.
// 20 USDC = 20 rebalance tasks at 1 USDC flat fee each.
export const DEFAULT_DELEGATION_MICRO_USDC = 20n * 1_000_000n;

// Minimum delegated amount we consider "already approved". Allows repeated
// partial spend without re-prompting until the session is nearly exhausted.
const MIN_ACTIVE_DELEGATION_MICRO_USDC = 2n * 1_000_000n;

export interface DelegationStatus {
  userAtaExists: boolean;
  balance: bigint;           // micro-USDC currently held by the user
  delegate: PublicKey | null; // delegate on the user's ATA (or null)
  delegatedAmount: bigint;   // remaining delegated amount in micro-USDC
  isActive: boolean;         // true if delegate matches hotWallet and delegatedAmount >= MIN
}

/**
 * Reads the user's USDC ATA and reports delegation state.
 */
export async function getDelegationStatus(
  connection: Connection,
  userPubkey: PublicKey,
  usdcMint: PublicKey,
  expectedDelegate: PublicKey,
): Promise<DelegationStatus> {
  const userAta = await getAssociatedTokenAddress(usdcMint, userPubkey);
  try {
    const acc = await getAccount(connection, userAta);
    const delegatedAmount = acc.delegate
      ? BigInt(acc.delegatedAmount.toString())
      : 0n;
    const isActive =
      acc.delegate?.equals(expectedDelegate) === true &&
      delegatedAmount >= MIN_ACTIVE_DELEGATION_MICRO_USDC;
    return {
      userAtaExists: true,
      balance: BigInt(acc.amount.toString()),
      delegate: acc.delegate ?? null,
      delegatedAmount,
      isActive,
    };
  } catch {
    // ATA doesn't exist yet — user has no USDC on this mint
    return {
      userAtaExists: false,
      balance: 0n,
      delegate: null,
      delegatedAmount: 0n,
      isActive: false,
    };
  }
}

/**
 * Builds (but does not send) an approve transaction. Returns the transaction
 * and the user's ATA — caller wires up Backpack signing and submission.
 *
 * If the user's ATA doesn't exist, we add an idempotent create instruction so
 * a single popup handles both.
 */
export async function buildApproveDelegationTx(
  connection: Connection,
  userPubkey: PublicKey,
  usdcMint: PublicKey,
  delegate: PublicKey,
  amount: bigint = DEFAULT_DELEGATION_MICRO_USDC,
): Promise<{ transaction: Transaction; userAta: PublicKey }> {
  const userAta = await getAssociatedTokenAddress(usdcMint, userPubkey);
  const instructions: TransactionInstruction[] = [];

  // Idempotent: no-op if the ATA already exists.
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      userPubkey,
      userAta,
      userPubkey,
      usdcMint,
    ),
  );

  instructions.push(
    createApproveInstruction(userAta, delegate, userPubkey, amount),
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPubkey;
  tx.add(...instructions);

  return { transaction: tx, userAta };
}

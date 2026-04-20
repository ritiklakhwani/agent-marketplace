/**
 * AgentBazaar x402 middleware — Path A+ (hybrid).
 *
 * Flow:
 *   1. Client submits a real USDC SPL transfer (not waiting for confirmation).
 *      Solana returns a tx signature immediately.
 *   2. Client builds a signed payload {payer, recipient, amount, mint, nonce,
 *      txSig, timestamp} and encodes it into the X-PAYMENT header.
 *   3. Server parses the header, verifies ed25519 signature locally, checks
 *      recipient/amount/mint/freshness/nonce-not-replayed, and runs the handler.
 *   4. Server does NOT wait for on-chain confirmation. The tx will land
 *      asynchronously. Background reconciliation is deferred to V1.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { randomBytes } from "crypto";

// ---------- Types ----------

export interface X402PaymentPayload {
  payer: string;     // base58 pubkey
  recipient: string; // base58 pubkey
  amount: string;    // stringified bigint micro-USDC
  mint: string;      // base58 pubkey (USDC mint)
  nonce: string;     // hex random
  txSig: string;     // base58 tx signature
  timestamp: number; // unix seconds
}

export interface X402Envelope extends X402PaymentPayload {
  signature: string; // base64 ed25519 signature
}

export interface X402VerifyResult {
  valid: boolean;
  payload?: X402PaymentPayload;
  error?: string;
}

// ---------- Canonicalization ----------

function canonicalize(obj: X402PaymentPayload): string {
  const keys = Object.keys(obj).sort() as (keyof X402PaymentPayload)[];
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

// ---------- Client: makeX402Payment ----------

export interface MakeX402PaymentParams {
  signer: Keypair;
  recipient: PublicKey;
  amount: bigint; // micro-USDC
  mint: PublicKey; // USDC mint (devnet `4zMMC9...`)
  connection: Connection;
  waitForConfirmation?: boolean; // default false (Path A+)
}

/**
 * Submits a USDC SPL transfer and returns a base64-encoded X-PAYMENT header.
 * Does NOT wait for on-chain confirmation by default — returns as soon as the
 * transaction is submitted and has a signature.
 */
export async function makeX402Payment(
  params: MakeX402PaymentParams,
): Promise<string> {
  const { signer, recipient, amount, mint, connection } = params;

  const payerAta = await getAssociatedTokenAddress(mint, signer.publicKey);
  const recipientAta = await getAssociatedTokenAddress(mint, recipient);

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      signer.publicKey,
      recipientAta,
      recipient,
      mint,
    ),
    createTransferInstruction(
      payerAta,
      recipientAta,
      signer.publicKey,
      amount,
    ),
  );

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);

  const txSig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "processed",
  });

  if (params.waitForConfirmation) {
    await connection.confirmTransaction(
      {
        signature: txSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed",
    );
  }

  const payload: X402PaymentPayload = {
    payer: signer.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    amount: amount.toString(),
    mint: mint.toBase58(),
    nonce: randomBytes(16).toString("hex"),
    txSig,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const message = new TextEncoder().encode(canonicalize(payload));
  const signature = nacl.sign.detached(message, signer.secretKey);

  const envelope: X402Envelope = {
    ...payload,
    signature: Buffer.from(signature).toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

// ---------- Server: verifyX402Payment ----------

export interface VerifyX402PaymentParams {
  header: string | null | undefined;
  expectedRecipient: PublicKey;
  expectedAmount: bigint; // minimum; caller pays >=
  expectedMint: PublicKey;
  maxAgeSeconds?: number; // default 300
  seenNonces?: Set<string>; // caller provides for replay protection
}

export function verifyX402Payment(
  params: VerifyX402PaymentParams,
): X402VerifyResult {
  if (!params.header) {
    return { valid: false, error: "Missing X-PAYMENT header" };
  }

  let envelope: X402Envelope;
  try {
    const decoded = Buffer.from(params.header, "base64").toString("utf-8");
    envelope = JSON.parse(decoded) as X402Envelope;
  } catch {
    return { valid: false, error: "Invalid X-PAYMENT encoding" };
  }

  const { signature, ...payloadFields } = envelope;
  const payload: X402PaymentPayload = payloadFields;

  // Signature verification
  let verified = false;
  try {
    const message = new TextEncoder().encode(canonicalize(payload));
    const sigBytes = Buffer.from(signature, "base64");
    const payerPubkey = new PublicKey(payload.payer);
    verified = nacl.sign.detached.verify(
      message,
      sigBytes,
      payerPubkey.toBytes(),
    );
  } catch {
    return { valid: false, error: "Signature verification threw" };
  }
  if (!verified) {
    return { valid: false, error: "Invalid signature" };
  }

  if (payload.recipient !== params.expectedRecipient.toBase58()) {
    return { valid: false, error: "Recipient mismatch" };
  }

  if (payload.mint !== params.expectedMint.toBase58()) {
    return { valid: false, error: "Mint mismatch" };
  }

  let amountBig: bigint;
  try {
    amountBig = BigInt(payload.amount);
  } catch {
    return { valid: false, error: "Amount not a valid bigint" };
  }
  if (amountBig < params.expectedAmount) {
    return { valid: false, error: "Insufficient amount" };
  }

  const maxAge = params.maxAgeSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.timestamp) > maxAge) {
    return { valid: false, error: "Timestamp outside allowed window" };
  }

  if (params.seenNonces) {
    if (params.seenNonces.has(payload.nonce)) {
      return { valid: false, error: "Nonce already seen (replay)" };
    }
    params.seenNonces.add(payload.nonce);
  }

  return { valid: true, payload };
}

// ---------- Utility: format an Accept-Payment challenge header ----------

export function acceptPaymentChallenge(
  recipient: PublicKey,
  amount: bigint,
  mint: PublicKey,
): string {
  return `x402-solana; recipient=${recipient.toBase58()}; amount=${amount}; mint=${mint.toBase58()}`;
}

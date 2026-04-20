/**
 * Offline unit test for @agentbazaar/x402 cryptography.
 *
 * Validates:
 *   - Signature round-trip (valid payer/signature accepted)
 *   - Tampering detection (altered amount rejected)
 *   - Wrong-pubkey rejection (different keypair signing)
 *   - Timestamp staleness rejection
 *   - Replay detection (same nonce rejected twice)
 *   - Envelope decode failure handling
 *
 * Does not touch the network or move any USDC. Used to prove the x402 crypto
 * layer is correct when on-chain test dollars aren't available.
 */

import {
  X402PaymentPayload,
  X402Envelope,
  verifyX402Payment,
} from "@agentbazaar/x402";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { randomBytes } from "crypto";

function canonicalize(obj: X402PaymentPayload): string {
  const keys = Object.keys(obj).sort() as (keyof X402PaymentPayload)[];
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

function buildEnvelope(
  signer: Keypair,
  overrides: Partial<X402PaymentPayload> = {},
): string {
  const payload: X402PaymentPayload = {
    payer: signer.publicKey.toBase58(),
    recipient: Keypair.generate().publicKey.toBase58(),
    amount: "20000",
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    nonce: randomBytes(16).toString("hex"),
    txSig: "1".repeat(88), // dummy tx sig for offline tests
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  const message = new TextEncoder().encode(canonicalize(payload));
  const signature = nacl.sign.detached(message, signer.secretKey);
  const envelope: X402Envelope = {
    ...payload,
    signature: Buffer.from(signature).toString("base64"),
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

function expect(label: string, cond: boolean): void {
  if (cond) console.log(`  OK  ${label}`);
  else {
    console.log(`  FAIL ${label}`);
    process.exitCode = 1;
  }
}

function main() {
  console.log("x402 offline verification suite\n");
  const signer = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const expectedAmount = 20_000n;

  // 1. Happy path
  const goodHeader = buildEnvelope(signer, {
    recipient: recipient.toBase58(),
  });
  const seen = new Set<string>();
  let result = verifyX402Payment({
    header: goodHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
    seenNonces: seen,
  });
  expect("happy path accepted", result.valid === true);

  // 2. Replay rejected
  result = verifyX402Payment({
    header: goodHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
    seenNonces: seen,
  });
  expect(
    "replay rejected",
    result.valid === false && !!result.error?.includes("replay"),
  );

  // 3. Tampered amount rejected (we build a fresh envelope, then edit the
  // base64 to change amount but keep signature -> verify must fail)
  const tamperedBase = buildEnvelope(signer, {
    recipient: recipient.toBase58(),
  });
  const decoded = JSON.parse(
    Buffer.from(tamperedBase, "base64").toString("utf-8"),
  );
  decoded.amount = "99999999";
  const tamperedHeader = Buffer.from(JSON.stringify(decoded)).toString("base64");
  result = verifyX402Payment({
    header: tamperedHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect(
    "tampered amount rejected",
    result.valid === false && !!result.error?.includes("signature"),
  );

  // 4. Wrong signer (different keypair signed the payload)
  const attacker = Keypair.generate();
  const fakePayload: X402PaymentPayload = {
    payer: signer.publicKey.toBase58(), // claims to be the real signer
    recipient: recipient.toBase58(),
    amount: "20000",
    mint: mint.toBase58(),
    nonce: randomBytes(16).toString("hex"),
    txSig: "1".repeat(88),
    timestamp: Math.floor(Date.now() / 1000),
  };
  const msg = new TextEncoder().encode(canonicalize(fakePayload));
  const attackerSig = nacl.sign.detached(msg, attacker.secretKey);
  const spoofed: X402Envelope = {
    ...fakePayload,
    signature: Buffer.from(attackerSig).toString("base64"),
  };
  const spoofedHeader = Buffer.from(JSON.stringify(spoofed)).toString("base64");
  result = verifyX402Payment({
    header: spoofedHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect("spoofed signer rejected", result.valid === false);

  // 5. Stale timestamp rejected
  const staleHeader = buildEnvelope(signer, {
    recipient: recipient.toBase58(),
    timestamp: Math.floor(Date.now() / 1000) - 3600, // 1h old
  });
  result = verifyX402Payment({
    header: staleHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
    maxAgeSeconds: 60,
  });
  expect(
    "stale timestamp rejected",
    result.valid === false && !!result.error?.includes("window"),
  );

  // 6. Insufficient amount rejected
  const underpayHeader = buildEnvelope(signer, {
    recipient: recipient.toBase58(),
    amount: "5000",
  });
  result = verifyX402Payment({
    header: underpayHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect(
    "underpayment rejected",
    result.valid === false && !!result.error?.includes("Insufficient"),
  );

  // 7. Wrong recipient rejected
  const wrongRecipHeader = buildEnvelope(signer, {
    recipient: Keypair.generate().publicKey.toBase58(),
  });
  result = verifyX402Payment({
    header: wrongRecipHeader,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect(
    "wrong recipient rejected",
    result.valid === false && !!result.error?.includes("Recipient"),
  );

  // 8. Missing header
  result = verifyX402Payment({
    header: null,
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect(
    "missing header rejected",
    result.valid === false && !!result.error?.includes("Missing"),
  );

  // 9. Garbage header
  result = verifyX402Payment({
    header: "not_valid_base64_json_at_all",
    expectedRecipient: recipient,
    expectedAmount,
    expectedMint: mint,
  });
  expect(
    "garbage header rejected",
    result.valid === false && !!result.error?.includes("encoding"),
  );

  console.log(
    `\nDone. ${process.exitCode === 1 ? "FAILURES above." : "All checks passed."}`,
  );
}

main();

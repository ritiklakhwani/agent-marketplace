import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createPublicClient, createWalletClient, http, parseAbi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createHash } from "crypto";

const MESSAGE_TRANSMITTER_V2 = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
const TOKEN_MESSENGER_MINTER_V2 = new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
const USDC_DEVNET_MINT = new PublicKey(
  process.env.USDC_DEVNET_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

const ETH_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
const CIRCLE_ATTESTATION_BASE = "https://iris-api-sandbox.circle.com/v2/messages";
const SOLANA_DOMAIN = 5;
const ETHEREUM_DOMAIN = 0;
const ARC_DOMAIN = 26;

// Arc testnet chain config for viem
const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.io" },
  },
  testnet: true,
});

const ARC_USDC_CONTRACT = (process.env.ARC_USDC_CONTRACT ??
  "0x3600000000000000000000000000000000000000") as `0x${string}`;
const ARC_TOKEN_MESSENGER_V2 = (process.env.ARC_TOKEN_MESSENGER_V2 ??
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA") as `0x${string}`;

// Discriminator from the on-chain IDL: sha256("global:deposit_for_burn")[0..8]
const DEPOSIT_FOR_BURN_DISC = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);

// Standard finality — no fast-finality fee
const MAX_FEE = 0n;
const MIN_FINALITY_THRESHOLD = 1000;

function ethAddressToBytes32(address: string): Buffer {
  const hex = address.replace("0x", "").toLowerCase().padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function buildInstructionData(amountMicroUsdc: bigint, mintRecipient: Buffer): Buffer {
  const data = Buffer.alloc(96);
  let off = 0;
  DEPOSIT_FOR_BURN_DISC.copy(data, off); off += 8;
  data.writeBigUInt64LE(amountMicroUsdc, off); off += 8;
  data.writeUInt32LE(ETHEREUM_DOMAIN, off); off += 4;
  mintRecipient.copy(data, off); off += 32;
  // destination_caller = zeros (no caller restriction), already zeroed
  off += 32;
  data.writeBigUInt64LE(MAX_FEE, off); off += 8;
  data.writeUInt32LE(MIN_FINALITY_THRESHOLD, off);
  return data;
}

export async function depositForBurn(
  connection: Connection,
  signer: Keypair,
  amountMicroUsdc: bigint,
  recipientEthAddress: string,
): Promise<string> {
  const mintRecipient = ethAddressToBytes32(recipientEthAddress);
  const burnTokenAccount = await getAssociatedTokenAddress(USDC_DEVNET_MINT, signer.publicKey);

  const [senderAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_authority")], TOKEN_MESSENGER_MINTER_V2
  );
  const [denylistAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("denylist_account"), signer.publicKey.toBuffer()], TOKEN_MESSENGER_MINTER_V2
  );
  const [messageTransmitter] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter")], MESSAGE_TRANSMITTER_V2
  );
  const [tokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")], TOKEN_MESSENGER_MINTER_V2
  );
  const [remoteTokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_token_messenger"), Buffer.from(ETHEREUM_DOMAIN.toString())],
    TOKEN_MESSENGER_MINTER_V2
  );
  const [tokenMinter] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")], TOKEN_MESSENGER_MINTER_V2
  );
  const [localToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("local_token"), USDC_DEVNET_MINT.toBuffer()], TOKEN_MESSENGER_MINTER_V2
  );
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")], TOKEN_MESSENGER_MINTER_V2
  );

  const messageSentEventData = Keypair.generate();

  const accounts: AccountMeta[] = [
    { pubkey: signer.publicKey,              isSigner: true,  isWritable: true  }, // owner
    { pubkey: signer.publicKey,              isSigner: true,  isWritable: true  }, // event_rent_payer
    { pubkey: senderAuthorityPda,            isSigner: false, isWritable: false },
    { pubkey: burnTokenAccount,              isSigner: false, isWritable: true  },
    { pubkey: denylistAccount,               isSigner: false, isWritable: false },
    { pubkey: messageTransmitter,            isSigner: false, isWritable: true  },
    { pubkey: tokenMessenger,                isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessenger,          isSigner: false, isWritable: false },
    { pubkey: tokenMinter,                   isSigner: false, isWritable: false },
    { pubkey: localToken,                    isSigner: false, isWritable: true  },
    { pubkey: USDC_DEVNET_MINT,              isSigner: false, isWritable: true  },
    { pubkey: messageSentEventData.publicKey, isSigner: true, isWritable: true  },
    { pubkey: MESSAGE_TRANSMITTER_V2,        isSigner: false, isWritable: false },
    { pubkey: TOKEN_MESSENGER_MINTER_V2,     isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID,              isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,       isSigner: false, isWritable: false },
    { pubkey: eventAuthority,                isSigner: false, isWritable: false },
    { pubkey: TOKEN_MESSENGER_MINTER_V2,     isSigner: false, isWritable: false }, // program
  ];

  const ix = new TransactionInstruction({
    programId: TOKEN_MESSENGER_MINTER_V2,
    keys: accounts,
    data: buildInstructionData(amountMicroUsdc, mintRecipient),
  });

  const tx = new Transaction().add(ix);
  const txSig = await sendAndConfirmTransaction(
    connection, tx, [signer, messageSentEventData], { commitment: "confirmed" }
  );
  return txSig;
}

// Circle sandbox attestation polling
interface AttestationMessage {
  attestation: string;
  message: string;
  status: string;
}

export async function pollAttestation(
  txSig: string,
  maxAttempts = 40,
  intervalMs = 6000,
): Promise<{ message: string; attestation: string }> {
  const url = `${CIRCLE_ATTESTATION_BASE}/${SOLANA_DOMAIN}?transactionHash=${txSig}`;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(url);
    if (res.ok) {
      const data: { messages?: AttestationMessage[] } = await res.json();
      const msg = data.messages?.[0];
      if (msg && msg.attestation !== "PENDING" && msg.status === "complete") {
        return { message: msg.message, attestation: msg.attestation };
      }
    }
  }

  throw new Error(`Circle attestation not ready after ${maxAttempts} attempts`);
}

// ABI for ETH Sepolia MessageTransmitter V2
const RECEIVE_MESSAGE_ABI = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) external returns (bool success)",
]);

export async function receiveMessageOnEthereum(
  message: string,
  attestation: string,
): Promise<string> {
  const rawKey = process.env.ETH_SEPOLIA_PRIVATE_KEY;
  if (!rawKey) throw new Error("ETH_SEPOLIA_PRIVATE_KEY is not set");

  const privateKey = rawKey.startsWith("0x") ? (rawKey as `0x${string}`) : `0x${rawKey}`;
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const rpcUrl = process.env.ETH_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";
  const transport = http(rpcUrl);

  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  const txHash = await walletClient.writeContract({
    address: ETH_MESSAGE_TRANSMITTER,
    abi: RECEIVE_MESSAGE_ABI,
    functionName: "receiveMessage",
    args: [message as `0x${string}`, attestation as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

// =============================================================================
// Arc -> Solana direction (Fund from Arc)
// =============================================================================

// ABIs for Arc-side CCTP calls
const APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// CCTP V2 depositForBurn on EVM: (amount, destinationDomain, mintRecipient, burnToken, destinationCaller, maxFee, minFinalityThreshold)
const DEPOSIT_FOR_BURN_V2_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)",
]);

const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as `0x${string}`;

/**
 * Convert a Solana PublicKey (32 bytes) to a bytes32 hex string that CCTP
 * expects as the `mintRecipient`. Solana pubkeys are already 32 bytes, so
 * no padding is needed — we just hex-encode them.
 */
function solanaPubkeyToBytes32(recipientAta: PublicKey): `0x${string}` {
  return `0x${Buffer.from(recipientAta.toBytes()).toString("hex")}` as `0x${string}`;
}

/**
 * Burns USDC on Arc testnet and sends a CCTP V2 cross-chain message targeting
 * the user's USDC ATA on Solana devnet. Returns the Arc tx hash — pass it to
 * `pollAttestationFromArc` to fetch the attestation, then to
 * `receiveMessageOnSolana` to mint the USDC on Solana.
 *
 * `recipientAta` must be the user's SPL token account for USDC on Solana,
 * NOT the user's wallet address. Derive with:
 *   getAssociatedTokenAddress(USDC_DEVNET_MINT, userWalletPubkey)
 */
export async function burnOnArc(
  amountMicroUsdc: bigint,
  recipientAta: PublicKey,
): Promise<string> {
  const rawKey = process.env.ARC_PRIVATE_KEY;
  if (!rawKey) throw new Error("ARC_PRIVATE_KEY is not set in .env.local");
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const rpcUrl = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
  const transport = http(rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  });
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport,
  });

  // Step 1: approve TokenMessengerV2 to spend our USDC
  const approveHash = await walletClient.writeContract({
    address: ARC_USDC_CONTRACT,
    abi: APPROVE_ABI,
    functionName: "approve",
    args: [ARC_TOKEN_MESSENGER_V2, amountMicroUsdc],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  // Step 2: depositForBurn targeting Solana domain with the user's USDC ATA as recipient
  const mintRecipient = solanaPubkeyToBytes32(recipientAta);
  const burnHash = await walletClient.writeContract({
    address: ARC_TOKEN_MESSENGER_V2,
    abi: DEPOSIT_FOR_BURN_V2_ABI,
    functionName: "depositForBurn",
    args: [
      amountMicroUsdc,
      SOLANA_DOMAIN, // destinationDomain = 5 (Solana)
      mintRecipient,
      ARC_USDC_CONTRACT,
      ZERO_BYTES32, // destinationCaller (zero = any caller can trigger mint)
      0n, // maxFee = 0 (standard finality, no fast-finality surcharge)
      1000, // minFinalityThreshold
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: burnHash });

  return burnHash;
}

/**
 * Polls Circle's iris attestation API for a burn tx that originated on Arc.
 * Same endpoint as pollAttestation, but uses ARC_DOMAIN (26) in the URL.
 * Arc attestations typically take 2-5 min (vs ~30-60s for Sepolia).
 */
export async function pollAttestationFromArc(
  txHash: string,
  maxAttempts = 60,
  intervalMs = 8000,
): Promise<{ message: string; attestation: string }> {
  const url = `${CIRCLE_ATTESTATION_BASE}/${ARC_DOMAIN}?transactionHash=${txHash}`;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(url);
    if (res.ok) {
      const data: { messages?: AttestationMessage[] } = await res.json();
      const msg = data.messages?.[0];
      if (msg && msg.attestation !== "PENDING" && msg.status === "complete") {
        return { message: msg.message, attestation: msg.attestation };
      }
    }
  }

  throw new Error(`Arc -> Solana attestation not ready after ${maxAttempts} attempts`);
}

// Anchor instruction discriminator for `receive_message` on MessageTransmitterV2
const RECEIVE_MESSAGE_DISC = createHash("sha256")
  .update("global:receive_message")
  .digest()
  .subarray(0, 8);

/**
 * Encode (message, attestation) per Anchor's Borsh-ish convention:
 *   u32 LE length + bytes, repeated.
 */
function buildReceiveMessageData(messageHex: string, attestationHex: string): Buffer {
  const message = Buffer.from(messageHex.replace(/^0x/, ""), "hex");
  const attestation = Buffer.from(attestationHex.replace(/^0x/, ""), "hex");

  const buf = Buffer.alloc(8 + 4 + message.length + 4 + attestation.length);
  let off = 0;
  RECEIVE_MESSAGE_DISC.copy(buf, off); off += 8;
  buf.writeUInt32LE(message.length, off); off += 4;
  message.copy(buf, off); off += message.length;
  buf.writeUInt32LE(attestation.length, off); off += 4;
  attestation.copy(buf, off);
  return buf;
}

/**
 * Parse source_domain and message body hash from a CCTP V2 message. We need
 * these to derive the `used_message` PDA that prevents replay.
 *
 * CCTP V2 message layout (from the spec):
 *   version         u32  (offset 0)
 *   sourceDomain    u32  (offset 4)
 *   destDomain      u32  (offset 8)
 *   nonce           bytes32 (offset 12)
 *   sender          bytes32 (offset 44)
 *   recipient       bytes32 (offset 76)
 *   destCaller      bytes32 (offset 108)
 *   minFinality     u32  (offset 140)
 *   finalityUsed    u32  (offset 144)
 *   messageBody     bytes (offset 148+)
 */
function parseCctpMessage(messageHex: string): { sourceDomain: number; nonce: Buffer } {
  const buf = Buffer.from(messageHex.replace(/^0x/, ""), "hex");
  const sourceDomain = buf.readUInt32BE(4);
  const nonce = buf.subarray(12, 44); // 32 bytes
  return { sourceDomain, nonce };
}

/**
 * Receives the CCTP message on Solana devnet, which triggers the
 * MessageTransmitterV2 program to CPI into TokenMessengerMinterV2 and
 * mint USDC to `recipientAta`. `payerSigner` pays rent + tx fees.
 *
 * The recipient MUST have a USDC ATA already initialized. We handle this by
 * pre-creating it in the same transaction (idempotent).
 */
export async function receiveMessageOnSolana(
  connection: Connection,
  payerSigner: Keypair,
  recipientAta: PublicKey,
  recipientOwner: PublicKey,
  messageHex: string,
  attestationHex: string,
): Promise<string> {
  const { sourceDomain, nonce } = parseCctpMessage(messageHex);

  // 4-byte big-endian encoding of source domain, matching how CCTP V2
  // programs serialize u32 seeds (Rust `source_domain.to_be_bytes()`)
  const sourceDomainBE = Buffer.alloc(4);
  sourceDomainBE.writeUInt32BE(sourceDomain, 0);

  // Derive MessageTransmitter PDAs (from Circle's solana-cctp-contracts v2)
  const [messageTransmitter] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter")],
    MESSAGE_TRANSMITTER_V2,
  );
  // seeds: [b"used_nonce", message[NONCE_INDEX..SENDER_INDEX]]
  // NOT "used_message" and NOT keyed on source_domain — just the 32-byte nonce
  const [usedNonce] = PublicKey.findProgramAddressSync(
    [Buffer.from("used_nonce"), nonce],
    MESSAGE_TRANSMITTER_V2,
  );
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter_authority"), TOKEN_MESSENGER_MINTER_V2.toBuffer()],
    MESSAGE_TRANSMITTER_V2,
  );
  const [mtEventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    MESSAGE_TRANSMITTER_V2,
  );

  // Derive TokenMessengerMinter PDAs. IMPORTANT: Circle's TokenMessengerMinter
  // program uses ASCII-string domain encoding for seeds (e.g. domain 26 →
  // bytes [0x32, 0x36] for "26"), NOT 4-byte BE integers. Verified against
  // on-chain data: all known source chains have remote_token_messenger PDAs
  // initialized with this exact seed format.
  const sourceDomainAscii = Buffer.from(String(sourceDomain));

  const [tokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [remoteTokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_token_messenger"), sourceDomainAscii],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [tokenMinter] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [localToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("local_token"), USDC_DEVNET_MINT.toBuffer()],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [tokenPair] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_pair"),
      sourceDomainAscii,
      Buffer.from(ARC_USDC_CONTRACT.replace("0x", "").padStart(64, "0"), "hex"),
    ],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [custodyTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("custody"), USDC_DEVNET_MINT.toBuffer()],
    TOKEN_MESSENGER_MINTER_V2,
  );
  const [tmEventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    TOKEN_MESSENGER_MINTER_V2,
  );

  // fee_recipient lives inside the token_messenger account (offset 109,
  // after owner/pending_owner/paused-by/message_body_version/authority_bump).
  // Reading it at call time keeps us correct if Circle rotates the recipient.
  const tmInfo = await connection.getAccountInfo(tokenMessenger);
  if (!tmInfo) throw new Error("token_messenger account not found");
  const feeRecipient = new PublicKey(tmInfo.data.subarray(109, 141));
  const feeRecipientTokenAccount = getAssociatedTokenAddressSync(
    USDC_DEVNET_MINT,
    feeRecipient,
    true,
  );

  // MessageTransmitter primary accounts
  const accounts: AccountMeta[] = [
    { pubkey: payerSigner.publicKey, isSigner: true, isWritable: true }, // payer
    { pubkey: payerSigner.publicKey, isSigner: true, isWritable: false }, // caller (same as payer)
    { pubkey: authorityPda, isSigner: false, isWritable: false },
    { pubkey: messageTransmitter, isSigner: false, isWritable: true },
    { pubkey: usedNonce, isSigner: false, isWritable: true },
    { pubkey: TOKEN_MESSENGER_MINTER_V2, isSigner: false, isWritable: false }, // receiver program
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: mtEventAuthority, isSigner: false, isWritable: false },
    { pubkey: MESSAGE_TRANSMITTER_V2, isSigner: false, isWritable: false }, // self program id

    // remaining_accounts forwarded to TokenMessengerMinter.handle_receive_message.
    // Order matches CCTP V2 HandleReceiveMessageContext struct layout.
    { pubkey: tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: true },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: tokenPair, isSigner: false, isWritable: false },
    { pubkey: feeRecipientTokenAccount, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: custodyTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: tmEventAuthority, isSigner: false, isWritable: false },
    { pubkey: TOKEN_MESSENGER_MINTER_V2, isSigner: false, isWritable: false },
  ];

  const receiveIx = new TransactionInstruction({
    programId: MESSAGE_TRANSMITTER_V2,
    keys: accounts,
    data: buildReceiveMessageData(messageHex, attestationHex),
  });

  // The combined (ATA create + receive_message) tx exceeds Solana's 1232-byte
  // limit. Split into two txs: ensure ATA first (in its own tx, only if needed),
  // then send receive_message alone.
  const ataInfo = await connection.getAccountInfo(recipientAta);
  if (!ataInfo) {
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      payerSigner.publicKey,
      recipientAta,
      recipientOwner,
      USDC_DEVNET_MINT,
    );
    const ataTx = new Transaction().add(ataIx);
    await sendAndConfirmTransaction(connection, ataTx, [payerSigner], {
      commitment: "confirmed",
    });
  }

  const tx = new Transaction().add(receiveIx);
  const txSig = await sendAndConfirmTransaction(connection, tx, [payerSigner], {
    commitment: "confirmed",
  });
  return txSig;
}
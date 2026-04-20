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
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const MESSAGE_TRANSMITTER_V2 = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
const TOKEN_MESSENGER_MINTER_V2 = new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
const USDC_DEVNET_MINT = new PublicKey(
  process.env.USDC_DEVNET_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

const ETH_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;
const CIRCLE_ATTESTATION_BASE = "https://iris-api-sandbox.circle.com/v2/messages";
const SOLANA_DOMAIN = 5;
const ETHEREUM_DOMAIN = 0;

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
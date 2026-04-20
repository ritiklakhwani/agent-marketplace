/**
 * Initializes the Insurance Pool on Solana devnet (if not already) and stakes
 * 100 USDC from the agent hot wallet into the vault.
 *
 * Prereq: agent hot wallet must have >= 100 USDC on devnet
 *         (obtain via https://faucet.circle.com → Solana Devnet).
 *
 * Idempotent:
 *   - Skips init_pool if the pool PDA already exists.
 *   - Stakes only if the vault balance is below the target (default 100 USDC).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  AGENT_HOT_WALLET,
  deriveInsurancePoolPda,
  deriveInsuranceVaultPda,
  getConnection,
  getInsuranceClient,
} from "@agentbazaar/solana";
import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_DECIMALS = 6;
const TARGET_STAKE_MICRO_USDC = 100n * 10n ** BigInt(USDC_DECIMALS); // 100 USDC

async function main() {
  const connection = getConnection();
  const usdcMintStr = process.env.USDC_DEVNET_MINT;
  if (!usdcMintStr) {
    throw new Error("USDC_DEVNET_MINT missing from .env.local");
  }
  const usdcMint = new PublicKey(usdcMintStr);

  console.log(`RPC: ${connection.rpcEndpoint}`);
  console.log(`Hot wallet: ${AGENT_HOT_WALLET.publicKey.toBase58()}`);
  console.log(`USDC mint:  ${usdcMint.toBase58()}\n`);

  // 1. Resolve hot wallet USDC ATA + verify balance
  const hotAta = await getAssociatedTokenAddress(
    usdcMint,
    AGENT_HOT_WALLET.publicKey,
  );
  const atainfo = await connection.getAccountInfo(hotAta);
  if (!atainfo) {
    throw new Error(
      `Hot wallet USDC ATA ${hotAta.toBase58()} does not exist. ` +
        `Did the Circle faucet send USDC to a different address?`,
    );
  }
  const balanceRes = await connection.getTokenAccountBalance(hotAta);
  const balance = BigInt(balanceRes.value.amount);
  const balanceHuman = Number(balance) / 10 ** USDC_DECIMALS;
  console.log(`Hot wallet USDC ATA: ${hotAta.toBase58()}`);
  console.log(`Hot wallet USDC balance: ${balanceHuman}\n`);

  if (balance < TARGET_STAKE_MICRO_USDC) {
    throw new Error(
      `Hot wallet has only ${balanceHuman} USDC, need at least 100. ` +
        `Visit https://faucet.circle.com (Solana Devnet) and top up.`,
    );
  }

  // 2. Derive pool + vault PDAs
  const [poolPda] = deriveInsurancePoolPda();
  const [vaultPda] = deriveInsuranceVaultPda();
  console.log(`Pool PDA:  ${poolPda.toBase58()}`);
  console.log(`Vault PDA: ${vaultPda.toBase58()}\n`);

  const insurance = getInsuranceClient(connection, AGENT_HOT_WALLET);

  // 3. Init pool if needed
  const poolInfo = await connection.getAccountInfo(poolPda);
  if (poolInfo) {
    console.log("Pool already initialized -> skipping init_pool");
  } else {
    console.log("Calling init_pool...");
    const sig = await insurance.methods
      .initPool()
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        usdcMint,
        payer: AGENT_HOT_WALLET.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([AGENT_HOT_WALLET])
      .rpc();
    console.log(`    init_pool tx: ${sig}\n`);
  }

  // 4. Check existing vault balance before staking
  let vaultBalance = 0n;
  try {
    const vb = await connection.getTokenAccountBalance(vaultPda);
    vaultBalance = BigInt(vb.value.amount);
  } catch {
    // vault just initialized; balance is 0
  }
  const vaultHuman = Number(vaultBalance) / 10 ** USDC_DECIMALS;
  console.log(`Vault balance before stake: ${vaultHuman} USDC`);

  if (vaultBalance >= TARGET_STAKE_MICRO_USDC) {
    console.log(
      `Vault already has >= 100 USDC. Skipping stake_funds.`,
    );
  } else {
    const stakeAmount = TARGET_STAKE_MICRO_USDC - vaultBalance;
    console.log(
      `Staking ${Number(stakeAmount) / 10 ** USDC_DECIMALS} USDC to reach target 100...`,
    );
    const sig = await insurance.methods
      .stakeFunds(new BN(stakeAmount.toString()))
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        funderTokenAccount: hotAta,
        funder: AGENT_HOT_WALLET.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([AGENT_HOT_WALLET])
      .rpc();
    console.log(`    stake_funds tx: ${sig}\n`);
  }

  // 5. Final state
  const poolAccount = await (insurance.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).insurancePool.fetch(poolPda);
  const finalVault = await connection.getTokenAccountBalance(vaultPda);

  console.log("--- Final state ---");
  console.log(`Pool PDA:        ${poolPda.toBase58()}`);
  console.log(`Vault PDA:       ${vaultPda.toBase58()}`);
  console.log(
    `Vault balance:   ${Number(finalVault.value.amount) / 10 ** USDC_DECIMALS} USDC`,
  );
  console.log(
    `total_staked:    ${(poolAccount.totalStaked as BN).toString()} micro-USDC`,
  );
  console.log(
    `total_released:  ${(poolAccount.totalReleased as BN).toString()} micro-USDC`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

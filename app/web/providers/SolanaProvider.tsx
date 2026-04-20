"use client";

import { PropsWithChildren, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

const DEFAULT_RPC = "https://api.devnet.solana.com";

export function SolanaProvider({ children }: PropsWithChildren) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || DEFAULT_RPC;

  // Backpack is a Wallet Standard compliant wallet and is auto-detected by
  // @solana/wallet-adapter-react at runtime — no explicit adapter needed.
  // Phantom predates Wallet Standard so still needs its legacy adapter here.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

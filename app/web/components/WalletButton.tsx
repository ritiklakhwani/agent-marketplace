"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <WalletMultiButton
      style={{
        background: "transparent",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: "2px",
        fontSize: "11px",
        fontWeight: "500",
        height: "26px",
        padding: "0 10px",
        color: "#111111",
        lineHeight: "1",
      }}
    />
  );
}

/**
 * Next.js App Router wrapper for x402-gated API routes.
 *
 * Usage:
 *   import { withX402 } from "@agentbazaar/x402/next";
 *
 *   export const POST = withX402(
 *     {
 *       expectedRecipient: ORACLE_AGENT_PUBKEY,
 *       expectedAmount: 20_000n, // 0.02 USDC in micro-units
 *       expectedMint: USDC_DEVNET_MINT,
 *     },
 *     async (req, _ctx, payment) => {
 *       const { symbols } = await req.json();
 *       const prices = await fetchPythPrices(symbols);
 *       return Response.json({ prices, paidBy: payment.payer });
 *     },
 *   );
 */

import { PublicKey } from "@solana/web3.js";
import {
  X402PaymentPayload,
  acceptPaymentChallenge,
  verifyX402Payment,
} from "./index";

// In-memory nonce cache for replay protection. Cleared on process restart,
// which is acceptable for V0 — nonces are timestamp-bounded anyway.
const seenNonces = new Set<string>();

export interface X402RouteOptions {
  expectedRecipient: PublicKey;
  expectedAmount: bigint;
  expectedMint: PublicKey;
  maxAgeSeconds?: number;
}

export type X402Handler<TCtx = unknown> = (
  req: Request,
  ctx: TCtx,
  payment: X402PaymentPayload,
) => Promise<Response>;

export function withX402<TCtx = unknown>(
  options: X402RouteOptions,
  handler: X402Handler<TCtx>,
): (req: Request, ctx: TCtx) => Promise<Response> {
  return async (req: Request, ctx: TCtx) => {
    const header = req.headers.get("X-PAYMENT");
    const result = verifyX402Payment({
      header,
      expectedRecipient: options.expectedRecipient,
      expectedAmount: options.expectedAmount,
      expectedMint: options.expectedMint,
      maxAgeSeconds: options.maxAgeSeconds,
      seenNonces,
    });

    if (!result.valid || !result.payload) {
      return new Response(
        JSON.stringify({
          error: "Payment Required",
          reason: result.error ?? "Missing or invalid X-PAYMENT header",
        }),
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "Accept-Payment": acceptPaymentChallenge(
              options.expectedRecipient,
              options.expectedAmount,
              options.expectedMint,
            ),
          },
        },
      );
    }

    return handler(req, ctx, result.payload);
  };
}

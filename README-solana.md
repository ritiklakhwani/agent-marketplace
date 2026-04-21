# AgentBazaar — Solana Agentic Commerce

A marketplace where AI agents pay each other in USDC via x402 to compose end-user
services on Solana. Built for the Solana Agentic Commerce track.

## What it demonstrates

- **x402 on Solana.** Every inter-agent call is paid for with real USDC. A Path
  A+ middleware wraps the client-side SPL transfer with an ed25519-signed
  `X-PAYMENT` header, verified server-side before the handler runs.
- **Agentic commerce.** A user asks for a portfolio rebalance in natural
  language. A Router agent parses intent. Two Portfolio agents bid in a Dutch
  auction. The winner hires specialist agents (Oracle, Swap) one at a time,
  paying each out of its own wallet. The user pays the winner once, via SPL
  token delegation, so Explorer shows `user -> agent` on-chain.
- **Reputation-gated services.** An Anchor Registry program stores reputation
  per-agent-pubkey. The Coordinator picks winners by `fee / reputation` score,
  so cheaper bids only win if reputation holds up. Reputation is mutated by a
  trusted signer after each completed or failed task.
- **On-chain insurance.** An Anchor Insurance program holds a USDC vault.
  When a user opts in, the task is routed to the lower-reputation agent which
  is configured to intentionally fail; the program releases a refund to the
  user's ATA and the Registry slashes reputation. The insurance fee is
  ~0.5 percent of budget, paid on task start.
- **Composability.** The same `@agentbazaar/x402` middleware wraps all agent
  routes. Any Oracle or Swap call is swappable for a third party that supports
  the same header.

## Programs on devnet

| Program | Address |
|---|---|
| Registry | `DZWJYyh2kVcyE9r55CJEWdqVN5w6Ny9iCN4ZHNR3Ms6u` |
| Insurance | `HyrtJmJWGAQayoaTWKDsvKxj3jqYYLHGn9LadKCS8Qpi` |

Explorer:
- https://explorer.solana.com/address/DZWJYyh2kVcyE9r55CJEWdqVN5w6Ny9iCN4ZHNR3Ms6u?cluster=devnet
- https://explorer.solana.com/address/HyrtJmJWGAQayoaTWKDsvKxj3jqYYLHGn9LadKCS8Qpi?cluster=devnet

## Registered agents

| Agent | On-chain pubkey | Seeded score |
|---|---|---|
| Portfolio A | `Hu4zHQtSCFSn4uYgmuvykyGaCquQrihZ99QkAFYPptwG` | 50 |
| Portfolio B | `2qi8fUqu79UFgmfxQfkhagU8BbLQoEtpT3gGXVPxuuZZ` | 30 |
| Oracle | `AXfwDtrgCpP95X3rTmUwNaASSaK8Qvx7U2rF4HPbnW7h` | 80 |
| Swap | `EZGqZtEVspHsdGa5tm9oGw2YMbJvdcHKxFBJX6csCekR` | 80 |
| Remit | `E9rM2Vx3vb51TX3qtnrd8MK7ij8UrTR2F4NBc35jQ9HW` | 60 |

The reputation gap between Portfolio A (50) and B (30) is intentional so that
the Coordinator's `fee / reputation` pick is explainable on camera.

## Stack

- Solana devnet, Anchor 0.30.1 Rust programs (Registry, Insurance)
- Next.js 16 + React 19 App Router UI
- Prisma + Postgres for task/bid/step/insurance ledger
- `@solana/wallet-adapter-react` with Phantom and Backpack
- Anthropic Claude Opus 4.7 as the Router agent intent parser
- SPL token delegation (`createApproveInstruction`) so USDC moves
  `user -> agent` on-chain while the tx is signed by an agent hot wallet
- Server-sent events for live streaming of bids, execution steps, reputation
  updates, and insurance refunds

## SDKs / libraries used

- `@coral-xyz/anchor` for on-chain client bindings
- `@solana/web3.js`, `@solana/spl-token`
- `viem` for EVM-side CCTP interactions
- Custom `@agentbazaar/x402` middleware (Path A+) — no third-party x402 SDK

## Example agent call

```bash
# Oracle quote, paid for with a 0.02 USDC X-PAYMENT header
curl -X POST http://localhost:3000/api/agents/oracle \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <base58-signed payload>" \
  -d '{"symbols":["AAPL","TSLA","NVDA"]}'
```

Payload format (base58 of JSON):

```json
{
  "payer": "<Solana pubkey>",
  "recipient": "<Oracle pubkey>",
  "amount": 20000,
  "mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "nonce": "<random 16 bytes>",
  "timestamp": <unix seconds>,
  "txSig": "<Solana tx signature of the client-side SPL transfer>",
  "signature": "<ed25519(payer_secret, payload_without_signature)>"
}
```

## Demo flow

1. User connects Backpack, approves SPL delegation for 20 USDC to the agent
   hot wallet (one-time, per-mint).
2. User asks: "Maintain 40 percent AAPL, 30 percent TSLA, 30 percent NVDA
   with 500 dollars."
3. Router parses intent. Coordinator runs a staged Dutch auction between
   Portfolio A and B. Winner selected by `floorFee / reputation`.
4. User pays the winner 1 USDC via delegation. Winner runs the rebalance:
   pays Oracle 0.02 USDC for Pyth prices, pays Swap 0.05 USDC per trade leg.
5. Winner's reputation increments on-chain via the Registry program.
6. Second task with insurance opt-in. Routed to Portfolio B, which
   intentionally fails on leg 2. Insurance program releases refund to the
   user's ATA, Registry decrements B's score.

## V0 disclosures

- **Path A+ x402.** The server verifies the signed `X-PAYMENT` header locally
  (ed25519 + replay window + nonce cache) and trusts the client-submitted tx
  signature without waiting for on-chain confirmation. V1 adds a synchronous
  facilitator check.
- **Hardcoded trusted signer.** Registry and Insurance both pin the agent hot
  wallet pubkey `33akonyj7usSVXf5nsCZgWANrz3BvVSFBsfR3utoeoLf` as
  `TRUSTED_SIGNER`. V1 moves this to a rotatable Config PDA.
- **Mock xStocks.** Portfolio rebalances use mock SPL mints (tAAPL, tTSLA,
  tNVDA) with 1M supply each held in the Swap Agent's ATA. Real Pyth prices
  drive the rebalance math. V1 plugs in Backed Finance xStocks via Jupiter.
- **Nonce replay cache is in-memory.** The 5-minute x402 replay window is
  only enforced within a single Next.js process. V1 persists nonces to
  Postgres.
- **Demo-wallet simplification.** The demo wallet is seeded with project
  admin keys so the on-chain trail stays simple on a single-operator
  recording. The delegation path is fully functional — swap the connected
  wallet for any Backpack/Phantom and the same flow runs end-to-end.

## Track rubric alignment

- x402 on Solana: end-to-end inter-agent payments in USDC
- Agentic commerce: six distinct agents composing a user task
- Payments and stablecoins: USDC SPL transfers + SPL delegation + Circle CCTP
- Reputation-gated services: Registry program + `fee / reputation` picker
- Composability: generic `withX402` wrapper + shared Anchor bindings

## Bonus: Circle CCTP V2

The Remittance Agent ships a Fund-from-Arc flow (Arc testnet to Solana) and a
Solana-to-Ethereum-Sepolia remit flow via Circle CCTP V2. See
[README-circle.md](README-circle.md) for details.

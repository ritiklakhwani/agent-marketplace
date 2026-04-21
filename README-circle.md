# AgentBazaar — Circle CCTP V2 Integration

AgentBazaar uses Circle Cross-Chain Transfer Protocol V2 for two flows, with
**Circle Arc testnet as a first-class source chain** to qualify for the Circle
track.

## Flow 1 — Fund from Arc (Arc testnet to Solana devnet)

Lets a user bridge USDC from Arc into their Solana wallet in one click, without
leaving the app. Visible on the Remittance Agent page.

1. The agent admin calls `depositForBurn` on Arc's `TokenMessengerV2` with
   `destinationDomain = 5` (Solana) and `mintRecipient` set to the user's
   Solana pubkey padded to 32 bytes.
2. The app polls Circle's Iris sandbox API
   (`https://iris-api-sandbox.circle.com/v2/messages/26/{burnTxHash}`) until
   the attestation is signed.
3. The app calls `MessageTransmitterV2.receive_message` on Solana devnet,
   forwarding the message and attestation to
   `TokenMessengerMinterV2.handle_receive_finalized_message`, which mints
   USDC into the user's ATA.

Live Explorer trace from one run:

- Arc burn (domain 26)
- Circle attestation (signed, minFinalityThreshold = 1000)
- Solana mint: tx `b1eK1QU1nXXvvxGXV8hAG9Q7y6Wj9hTw4DGGV5zWG5AqtMxK3P4LwHghJDnDqPPvRk5CBq9UsZqhitdD3vFaK97`
  credited 1 USDC to ATA `AG524GSoKXg6kZi4xq4wkk7RxVjgNUTQQFcUTUZPYrkQ`

## Flow 2 — Remit (Solana devnet to Ethereum Sepolia)

The Remit Agent closes a cross-chain loop by paying USDC from Solana to an
Ethereum Sepolia recipient address. Same CCTP V2 primitives in the opposite
direction: Solana `deposit_for_burn` -> Iris attestation -> Sepolia
`MessageTransmitterV2.receiveMessage`.

## Keys, programs, contracts

### Arc testnet

- RPC: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`
- CCTP domain: `26`
- USDC (also used as native gas): `0x3600000000000000000000000000000000000000`
- TokenMessengerV2: `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
- MessageTransmitterV2: `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
- Explorer: `https://testnet.arcscan.io`

### Solana devnet

- CCTP domain: `5`
- USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- MessageTransmitterV2 program: `CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC`
- TokenMessengerMinterV2 program: `CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe`
- Iris attestation API: `https://iris-api-sandbox.circle.com/v2/messages`

### Ethereum Sepolia

- CCTP domain: `0`
- USDC: standard Circle Sepolia deployment
- MessageTransmitterV2 and TokenMessengerV2 per Circle's CCTP V2 docs

## Implementation

All CCTP code lives in [app/web/lib/cctp.ts](app/web/lib/cctp.ts):

- `burnOnArc(amount, recipientSolanaPubkey)` — viem wallet client calls
  approve + `depositForBurn` on Arc
- `pollAttestationFromArc(burnTxHash)` — polls the domain-26 Iris endpoint
  until `status === "complete"`
- `receiveMessageOnSolana(connection, payer, ata, owner, message, attestation)`
  — builds the receive_message instruction with the full CCTP V2 account
  order (including `fee_recipient_token_account`, which is new in V2)

The orchestrator API route is
[app/web/app/api/cctp/fund-from-arc/route.ts](app/web/app/api/cctp/fund-from-arc/route.ts).
It emits three `execution_step` SSE events so the UI can animate:
`Burn on Arc -> Awaiting attestation -> Mint on Solana`.

## PDA seeds we verified on-chain

CCTP V2 on Solana uses some non-obvious PDA seed formats. Confirmed by
inspecting live on-chain account data under the TokenMessengerMinterV2 program:

| PDA | Seeds |
|---|---|
| `token_messenger` | `[b"token_messenger"]` |
| `remote_token_messenger` | `[b"remote_token_messenger", ascii(source_domain)]` |
| `token_pair` | `[b"token_pair", ascii(source_domain), remote_token_bytes32]` |
| `local_token` | `[b"local_token", mint]` |
| `custody_token_account` | `[b"custody", mint]` |
| `__event_authority` | `[b"__event_authority"]` |

`source_domain` is ASCII-encoded (e.g. domain 26 -> bytes `[0x32, 0x36]`),
not the u32 big-endian encoding used elsewhere in CCTP.

Under the MessageTransmitterV2 program:

| PDA | Seeds |
|---|---|
| `message_transmitter` | `[b"message_transmitter"]` |
| `used_nonce` | `[b"used_nonce", nonce_32_bytes]` |
| `message_transmitter_authority` | `[b"message_transmitter_authority", TOKEN_MESSENGER_MINTER_V2]` |

## Why Arc qualification

The Circle track qualification rule requires Arc to appear as either the
source or destination in a CCTP flow. The Fund-from-Arc flow has Arc as the
source (`sourceDomain = 26`) with Solana as the destination. This satisfies
the rule and runs end-to-end in the shipped demo.

## V0 disclosures

- The admin wallet burns on Arc on behalf of the user. V1 switches to a
  user-signed burn where the user's MetaMask triggers `depositForBurn`
  directly.
- Attestation polling is synchronous (one request every 6 seconds, up to
  ~4 minutes). In practice Arc -> Solana attestations finalize in 60–90s
  on the sandbox.
- The receive_message transaction is sent by the agent hot wallet, which
  also pays rent to create the user's USDC ATA if it doesn't exist.

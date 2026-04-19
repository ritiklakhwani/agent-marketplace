# AgentBazaar V0 — Step-by-Step Build Plan

## Context

Execution-grade build guide derived from v0-final-plan.md. Each step has a concrete action, file path, verification, and owner (P1 / P2 / both). Steps are numbered sequentially so either person can check off progress.

Team: 2 people. Timeline: Apr 19 - Apr 21 noon. Base path: `/Users/ritik/Documents/agent-marketplace/`.

---

## Phase 0 — Pre-Flight (both, before Day 1 starts, ~1h together)

### 0.1 Accounts and keys
- [ ] (P2) Create Phantom wallet on devnet. Save seed phrase.
- [ ] (P2) Install Phantom browser extension. Switch network to Devnet.
- [ ] (P1) Create a second Phantom wallet for the "agent hot wallet" (signs agent payouts/mints).
- [ ] (P1) Sign up for Helius free tier, grab devnet RPC URL.
- [ ] (P1) Sign up for Neon or Supabase free tier, grab Postgres connection string.
- [ ] (Both) Set up Anthropic API key (P2 needs it for Router Agent).
- [ ] (Both) Decide on Vercel deploy account.
- [ ] (Both) **Apply for Dodo Payments sandbox keys today** (takes days; needed for V1).

### 0.2 Tool installs
```bash
# P1
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
avm install 0.30.1 && avm use 0.30.1  # Anchor
rustup install stable
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Both
brew install pnpm  # or corepack enable
node --version  # need >= 20
```

### 0.3 Repo scaffold (P1, 10 min)
```bash
cd /Users/ritik/Documents/agent-marketplace
pnpm init
mkdir -p programs app shared prisma scripts
echo "node_modules/\n.next/\ntarget/\n.env\n.env.local\n" > .gitignore
git add -A && git commit -m "Scaffold"
```

### 0.4 Shared root config
Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "app"
  - "shared/*"
```

Create `.env.local` template (never commit):
```
NEXT_PUBLIC_SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=XXX
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
AGENT_HOT_WALLET_SECRET=[...]  # base58 from solana-keygen
REGISTRY_PROGRAM_ID=
INSURANCE_PROGRAM_ID=
USDC_DEVNET_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

---

## Phase 1 — Solana Programs (P1, Day 1 hours 0-14)

### 1.1 Anchor workspace init (hour 0-1)
```bash
cd programs
anchor init agentbazaar --no-git
cd agentbazaar
```

### 1.2 Configure for devnet
Edit `Anchor.toml`:
```toml
[programs.devnet]
registry = "REPLACE_AFTER_DEPLOY"
insurance = "REPLACE_AFTER_DEPLOY"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
```

### 1.3 Generate agent hot wallet + fund
```bash
solana-keygen new -o ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 2
solana balance  # verify
```

### 1.4 Registry program (hour 1-4)
Path: `programs/agentbazaar/programs/registry/src/lib.rs`

Implement:
- `register_agent(ctx, name, endpoint, category, price_hint)` — inits `Agent` PDA seeded by owner
- `update_reputation(ctx, delta, volume)` — trusted signer (match against agent hot wallet pubkey constant)
- `Agent` account struct with `owner, name, endpoint, category, price_hint, successes, failures, score, total_volume`

Build: `anchor build`
Test locally: `anchor test --skip-deploy` (write 1 happy-path test for register_agent)

### 1.5 Insurance program (hour 4-7)
Path: `programs/agentbazaar/programs/insurance/src/lib.rs`

Implement:
- `init_pool(ctx)` — creates pool PDA + USDC token account owned by PDA
- `stake_funds(ctx, amount)` — SPL transfer from user -> pool USDC ATA
- `release_to_user(ctx, task_id, amount)` — trusted signer transfers USDC from pool to user
- `slash_agent(ctx, agent)` — CPI into Registry to decrement score (V0 shortcut: off-chain call instead; can do CPI in V1)

Build: `anchor build`

### 1.6 Deploy to devnet (hour 7-8)
```bash
anchor deploy --provider.cluster devnet
# Copy program IDs; paste into Anchor.toml + .env.local
anchor build  # rebuild with real IDs
anchor deploy --provider.cluster devnet  # redeploy
```

Verify on Solana Explorer: https://explorer.solana.com/?cluster=devnet
Paste program IDs into team Slack/doc.

### 1.7 Mock SPL mints (hour 8-10)
Path: `scripts/mint-mock-tokens.ts`

```ts
// Create tAAPL, tTSLA, tNVDA mints owned by agent hot wallet.
// Mint 1000 of each to the agent hot wallet ATA.
// Save mint addresses to .env.local as MOCK_TAAPL_MINT, etc.
```

Run: `pnpm ts-node scripts/mint-mock-tokens.ts`

### 1.8 Pre-fund insurance pool (hour 10-10.5)
Path: `scripts/fund-insurance.ts`

```ts
// Airdrop devnet USDC (use Circle's devnet faucet or swap via Jupiter devnet)
// Call init_pool + stake_funds(100 USDC)
```

### 1.9 Generate IDL + TS client (hour 10.5-12)
```bash
anchor build  # outputs target/idl/registry.json, insurance.json
anchor run generate-idl  # custom script
```

Path: `shared/solana/`
- Copy `target/idl/*.json` to `shared/solana/idl/`
- Export typed clients:
  - `getRegistryClient(wallet, connection)` returns `Program<Registry>`
  - `getInsuranceClient(wallet, connection)` returns `Program<Insurance>`
  - Helper: `readReputation(agent: PublicKey): Promise<number>`
  - Helper: `incrementReputation(agent, volume)` wraps `update_reputation(+1, volume)`
  - Helper: `decrementReputation(agent)` wraps `update_reputation(-1, 0)`

### 1.10 Register seed agents (hour 12-13)
Path: `scripts/register-agents.ts`

Register all 5 marketplace agents (Portfolio A, Portfolio B, Oracle, Swap, Remit) with starting reputation:
- Portfolio A: score 50
- Portfolio B: score 30 (lower, makes Router pick interesting)
- Oracle: 80
- Swap: 80
- Remit: 60

Run: `pnpm ts-node scripts/register-agents.ts`

### 1.11 Handoff gate: publish IDL + bindings (hour 13-14)
- [ ] `shared/solana/index.ts` exports all clients and helpers
- [ ] `pnpm build` from workspace root succeeds
- [ ] Notify P2: "Solana bindings ready"

---

## Phase 2 — Next.js Shell + Wallet (P2, Day 1 hours 0-5)

### 2.1 Scaffold Next.js (hour 0-1)
```bash
cd app
pnpm create next-app@latest web --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
cd web
pnpm add @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/web3.js @solana/spl-token @coral-xyz/anchor
pnpm add framer-motion zod
pnpm add -D @types/node
npx shadcn@latest init
npx shadcn@latest add button card input badge table toast
```

### 2.2 Wallet provider (hour 1-2)
Path: `app/web/src/providers/SolanaProvider.tsx`

Wrap ConnectionProvider + WalletProvider + WalletModalProvider. Phantom + Backpack adapters. Use `NEXT_PUBLIC_SOLANA_RPC` env var. Mount in `app/web/src/app/layout.tsx`.

### 2.3 Connect button + layout (hour 2-3)
Path: `app/web/src/app/page.tsx`

Layout: top nav with `<WalletMultiButton />`, centered content area. Dark theme.

### 2.4 Portfolio view stub (hour 3-4)
Path: `app/web/src/components/PortfolioView.tsx`

Three rows: AAPL / TSLA / NVDA. Columns: target %, current %, drift %. Placeholder values. Re-read current after each rebalance.

### 2.5 Chat input + SSE client scaffold (hour 4-5)
Path: `app/web/src/components/TaskInput.tsx` + `hooks/useTaskStream.ts`

- Input field with placeholder "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500"
- Submit POSTs to `/api/tasks`, gets `{ taskId }`, opens `EventSource(/api/sse/task/${taskId})`
- Hook handles event types: `bid`, `winner_selected`, `execution_step`, `reputation_update`, `insurance_refund`, `task_complete`

### 2.6 Handoff gate
- [ ] Phantom connects, balance shown
- [ ] Task input renders (dead-ends at API for now)

---

## Phase 3 — x402 Middleware (P1, Day 1 hours 5-8)

### 3.1 Evaluate Sendai lib (hour 5-5.5)
```bash
cd shared/x402
pnpm init
pnpm add @sendaifun/x402-solana 2>/dev/null || echo "not on npm, clone source"
```

Test Sendai lib with minimal example (send dummy payment). If broken or docs missing, **fall back to custom middleware** (step 3.2).

### 3.2 Custom x402 middleware (hour 5.5-8)
Path: `shared/x402/src/index.ts`

Export 2 functions:

```ts
// Server-side: verify payment on incoming request
export async function verifyX402Payment(req: Request, expectedAmount: number, recipient: PublicKey): Promise<{ valid: boolean; signer?: PublicKey; txSig?: string }>
// Checks X-PAYMENT header. Expects base58 signed payload:
//   { payer: Pubkey, recipient: Pubkey, amount: u64, nonce: string, signature: base58 }
// Verifies signature against payer's pubkey + checks amount/recipient match.
// V0 shortcut: does NOT verify the USDC transfer landed on-chain (just trusts the signed intent).
// V1: add on-chain verification via RPC.
```

```ts
// Client-side: create X-PAYMENT header for a call
export async function makeX402Payment(signer: Keypair, recipient: PublicKey, amount: number): Promise<{ header: string; txSig?: string }>
// V0: signs intent only (returns header).
// V1: first sends USDC transfer, then signs reference to tx sig.
```

### 3.3 Middleware wrapper for Next.js routes (hour 7.5-8)
Path: `shared/x402/src/next.ts`

```ts
export function withX402(amount: number, recipient: PublicKey, handler: NextHandler): NextHandler
// Wraps a Next.js route handler. Rejects with 402 if no valid X-PAYMENT, otherwise calls handler.
```

### 3.4 Handoff gate: publish middleware
- [ ] `shared/x402` builds
- [ ] Manual test: curl with dummy signed payload succeeds on a test endpoint
- [ ] Notify P2

---

## Phase 4 — Prisma + Database (P1, Day 1 hours 2-5 parallel with 1.4-1.5)

### 4.1 Prisma init (hour 2-2.5)
```bash
cd /Users/ritik/Documents/agent-marketplace
pnpm add prisma @prisma/client
npx prisma init
```

Set `DATABASE_URL` in root `.env`.

### 4.2 Schema (hour 2.5-4)
Path: `prisma/schema.prisma`

```prisma
model Task {
  id         String   @id @default(cuid())
  userWallet String
  type       String   // "rebalance" | "remit"
  payload    Json     // parsed request details
  status     String   @default("pending") // pending, bidding, executing, completed, failed, refunded
  winnerId   String?
  insurance  Boolean  @default(false)
  createdAt  DateTime @default(now())
  bids       Bid[]
  steps      ExecutionStep[]
  events     InsuranceEvent[]
}

model Bid {
  id         String   @id @default(cuid())
  taskId     String
  agentId    String   // "portfolio-a" | "portfolio-b"
  feePct     Float
  reputation Int
  createdAt  DateTime @default(now())
  task       Task     @relation(fields: [taskId], references: [id])
}

model ExecutionStep {
  id         String   @id @default(cuid())
  taskId     String
  stepIndex  Int
  agentId    String
  action     String   // "oracle_query" | "swap_leg"
  input      Json
  output     Json?
  status     String   // "pending" | "complete" | "failed"
  txSig      String?
  createdAt  DateTime @default(now())
  task       Task     @relation(fields: [taskId], references: [id])
}

model InsuranceEvent {
  id        String   @id @default(cuid())
  taskId    String
  type      String   // "opted_in" | "triggered" | "refunded" | "slashed"
  amount    Float?
  txSig     String?
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id])
}

model RemitEvent {
  id          String   @id @default(cuid())
  taskId      String
  amount      Float
  recipient   String
  txSig       String?
  status      String
  createdAt   DateTime @default(now())
}

model AgentMetadata {
  id          String   @id // "portfolio-a", etc.
  name        String
  category    String
  endpoint    String
  pubkey      String   // on-chain identity
  description String?
}
```

### 4.3 Migrate + seed (hour 4-5)
```bash
npx prisma migrate dev --name init
npx prisma generate
```

Path: `prisma/seed.ts` — inserts 5 `AgentMetadata` rows.

---

## Phase 5 — Backend Agents (Oracle, Swap, Coordinator) (P1, Day 1 hours 8-14)

### 5.1 Oracle Agent (hour 8-10)
Path: `app/web/src/app/api/agents/oracle/route.ts`

```ts
export const POST = withX402(0.02, ORACLE_PUBKEY, async (req) => {
  const { symbols } = await req.json(); // ["AAPL", "TSLA", "NVDA"]
  const prices = await fetchPythPrices(symbols);
  return Response.json({ prices });
});
```

Pyth feed IDs (devnet):
- AAPL: `GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU` (check Pyth docs)
- TSLA, NVDA: same lookup

Use `@pythnetwork/client` to pull latest prices from the on-chain price accounts on Solana devnet.

Fallback: if Pyth devnet doesn't have stock feeds, use Pyth Hermes HTTP API as a hack.

### 5.2 Swap Agent (hour 10-12)
Path: `app/web/src/app/api/agents/swap/route.ts`

```ts
export const POST = withX402(0.05, SWAP_PUBKEY, async (req) => {
  const { fromMint, toMint, amount, userWallet } = await req.json();
  // V0 Path A/B: do a mock SPL transfer between user wallet and agent hot wallet vault
  //   (bypasses Jupiter entirely for mock tokens — Jupiter won't route tAAPL)
  // For Path C (SOL/USDC/JUP/BONK): call Jupiter quote + swap endpoints
  const txSig = await executeMockSwap(fromMint, toMint, amount, userWallet);
  return Response.json({ txSig, filledAmount: amount });
});
```

### 5.3 Bidding Coordinator (hour 12-14)
Path: `app/web/src/app/api/coordinator/route.ts`

```ts
export async function POST(req: Request) {
  const { taskId } = await req.json();
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  // Parallel fetch bids from A and B
  const [bidA, bidB] = await Promise.all([
    fetchBid("portfolio-a", task),
    fetchBid("portfolio-b", task),
  ]);

  // Simulate Dutch auction: drop fees over 5s with 3 bid events
  for (const bid of stageBidDrops(bidA, bidB)) {
    await prisma.bid.create({ data: bid });
    await emitSSE(taskId, { type: "bid", ...bid });
    await sleep(1500);
  }

  // Read reputation for each
  const repA = await readReputation(AGENT_A_PUBKEY);
  const repB = await readReputation(AGENT_B_PUBKEY);

  const scoreA = finalBidA.feePct / repA;
  const scoreB = finalBidB.feePct / repB;
  const winner = scoreA < scoreB ? "portfolio-a" : "portfolio-b";

  await prisma.task.update({ where: { id: taskId }, data: { winnerId: winner, status: "executing" }});
  await emitSSE(taskId, { type: "winner_selected", winner, reason: `Lowest fee × reputation: ${winner === "portfolio-a" ? scoreA : scoreB}` });

  // Trigger winner to execute
  await fetch(`/api/agents/${winner}/execute`, { method: "POST", body: JSON.stringify({ taskId }) });

  return Response.json({ winner });
}
```

### 5.4 SSE infrastructure (hour 13-14)
Path: `app/web/src/app/api/sse/task/[id]/route.ts`

Use Server-Sent Events via `ReadableStream`. In-memory pub/sub keyed by taskId. Emit events from coordinator/agents via `emitSSE(taskId, event)`.

---

## Phase 6 — User-Facing Agents (P2, Day 1 hours 5-14)

### 6.1 Router Agent (hour 5-8)
Path: `app/web/src/app/api/agents/router/route.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";

const schema = z.union([
  z.object({
    type: z.literal("rebalance"),
    budget: z.number(),
    targets: z.record(z.string(), z.number()),
  }),
  z.object({
    type: z.literal("remit"),
    amount: z.number(),
    recipient: z.string(),
  }),
]);

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 500,
    system: "Parse user intent into JSON matching this schema: ... Output ONLY JSON.",
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = schema.parse(JSON.parse(extractJson(msg.content[0].text)));
  return Response.json(parsed);
}
```

### 6.2 Task endpoint (hour 7-8)
Path: `app/web/src/app/api/tasks/route.ts`

```ts
export async function POST(req: Request) {
  const { prompt, userWallet, insurance } = await req.json();
  const parsed = await callRouter(prompt);
  const task = await prisma.task.create({ data: { userWallet, type: parsed.type, payload: parsed, insurance }});
  // Kick off coordinator async
  fetch(`/api/coordinator`, { method: "POST", body: JSON.stringify({ taskId: task.id })});
  return Response.json({ taskId: task.id });
}
```

### 6.3 Portfolio Agent A (hour 8-11)
Path: `app/web/src/app/api/agents/portfolio-a/bid/route.ts` + `/execute/route.ts`

**Bid endpoint**: returns `{ feePct: 0.6 }` (config-driven).

**Execute endpoint**:
```ts
export const POST = withX402(feePct * budget, AGENT_A_PUBKEY, async (req) => {
  const { taskId } = await req.json();
  const task = await prisma.task.findUnique({ where: { id: taskId }});

  // Step 1: hire Oracle
  const priceRes = await fetch("/api/agents/oracle", {
    method: "POST",
    headers: { "X-PAYMENT": await makeX402Payment(AGENT_A_KEYPAIR, ORACLE_PUBKEY, 0.02) },
    body: JSON.stringify({ symbols: Object.keys(task.payload.targets) }),
  });
  await logStep(taskId, 0, "portfolio-a", "oracle_query", priceRes);

  const { prices } = await priceRes.json();
  const trades = computeRebalanceTrades(task.payload, prices);

  // Step 2-4: hire Swap for each leg
  for (const [i, trade] of trades.entries()) {
    const swapRes = await fetch("/api/agents/swap", {
      method: "POST",
      headers: { "X-PAYMENT": await makeX402Payment(AGENT_A_KEYPAIR, SWAP_PUBKEY, 0.05) },
      body: JSON.stringify(trade),
    });
    await logStep(taskId, i + 1, "portfolio-a", "swap_leg", swapRes);
  }

  // Success: bump reputation
  await incrementReputation(AGENT_A_PUBKEY, task.payload.budget);
  await prisma.task.update({ where: { id: taskId }, data: { status: "completed" }});
  await emitSSE(taskId, { type: "task_complete" });
});
```

### 6.4 Portfolio Agent B (hour 11-12)
Path: `app/web/src/app/api/agents/portfolio-b/bid/route.ts` + `/execute/route.ts`

Same code as A, different config: `feePct: 0.4`, and when `task.insurance === true`, deliberately fail on the 2nd swap leg (throw "slippage exceeded").

Factor shared logic into `app/web/src/lib/portfolio-core.ts`.

### 6.5 Remit Agent (hour 12-13)
Path: `app/web/src/app/api/agents/remit/route.ts`

```ts
export const POST = withX402(0.01, REMIT_PUBKEY, async (req) => {
  const { amount, recipient, taskId } = await req.json();
  const txSig = await transferUsdc(USER_WALLET, recipient, amount); // SPL transfer
  await prisma.remitEvent.create({ data: { taskId, amount, recipient, txSig, status: "completed" }});
  await emitSSE(taskId, { type: "remit_complete", txSig });
});
```

### 6.6 Handoff gate end of Day 1
- [ ] Router parses rebalance prompt correctly
- [ ] Oracle returns Pyth prices when hit with valid x402
- [ ] Portfolio A runs end-to-end on localhost (calls Oracle, calls Swap 3x)
- [ ] DB shows Task + Bid + ExecutionStep rows
- [ ] Frontend wallet connects

---

## Phase 7 — Frontend Integration (P2, Day 2 hours 0-9)

### 7.1 Live auction UI (hour 0-3)
Path: `app/web/src/components/AuctionTicker.tsx`

- Two agent cards (A, B) side by side
- Each has a price display that animates (Framer Motion `layout` + number tween)
- SSE events of type `bid` push new prices
- When `winner_selected` fires: winner card grows, others dim with reason overlay

### 7.2 Agent-composition view (hour 3-5)
Path: `app/web/src/components/CompositionChain.tsx`

Horizontal chain: `[Portfolio A]` -> `[Oracle]` -> `[Swap]` -> `[Swap]` -> `[Swap]`

Each node has a state: `pending | active | complete | failed`. Colors shift as SSE `execution_step` events arrive. Shows `X-PAYMENT` tag + amount per edge.

### 7.3 Insurance opt-in + reputation badges (hour 5-7)
- Checkbox on task input: "Insure this task (+0.5%)"
- Agent cards show reputation as a badge with `successes / failures`
- After a task completes/fails, badge updates on `reputation_update` SSE event

### 7.4 Full demo flow wired in UI (hour 7-9)
- User types prompt -> POST /api/tasks -> open SSE -> auction UI lights up -> composition chain animates -> portfolio values update -> on fail, refund toast appears with tx link

### 7.5 Gate: solo run-through
- [ ] P2 runs the full demo flow in the browser without P1 present
- [ ] All 6 demo moments visible

---

## Phase 8 — Circle CCTP (P1, Day 2 hours 3-6)

### 8.1 Arc testnet setup
- [ ] Get Arc testnet RPC + chain ID from Circle docs
- [ ] Get Arc testnet USDC faucet
- [ ] Fund user wallet with Arc USDC

### 8.2 CCTP burn on Arc
Path: `app/web/src/lib/cctp.ts`

```ts
export async function burnOnArc(amount: bigint, solanaRecipient: PublicKey): Promise<string>
// Calls TokenMessengerV2.depositForBurn on Arc testnet
// Returns Arc tx hash
```

### 8.3 Attestation + mint on Solana
```ts
export async function mintOnSolana(arcTxHash: string, recipient: PublicKey): Promise<string>
// Polls Circle's iris-api-sandbox.circle.com/v2/messages/{arcTxHash} for attestation
// Calls MessageTransmitter.receive_message on Solana devnet
// Returns Solana tx sig
```

### 8.4 Frontend "Fund from Arc" button
Path: `app/web/src/components/FundFromArc.tsx`

Two-phase UX: clicking shows "Burning on Arc…" then "Waiting for attestation…" then "Minting on Solana…" then "Funded!". Takes ~60-90s typically.

### 8.5 **Hard gate at Day 2 18:00**
If end-to-end Arc -> Solana isn't working by 18:00, cut Circle track. P1 joins bug bash instead.

---

## Phase 9 — Insurance Flow (P1, Day 2 hours 6-9)

### 9.1 Failure detection
In Portfolio B `execute` handler, when intentional fail flag is on, throw specific error. Catch in coordinator wrapper.

### 9.2 Refund trigger
```ts
async function handleAgentFailure(taskId: string, agentPubkey: PublicKey) {
  const task = await prisma.task.findUnique({ where: { id: taskId }});
  if (task.insurance) {
    const refundAmount = task.payload.budget * 1.005; // includes insurance fee
    const txSig = await releaseToUser(taskId, new PublicKey(task.userWallet), refundAmount);
    await prisma.insuranceEvent.create({ data: { taskId, type: "refunded", amount: refundAmount, txSig }});
    await emitSSE(taskId, { type: "insurance_refund", amount: refundAmount, txSig });
  }
  await decrementReputation(agentPubkey);
  await prisma.insuranceEvent.create({ data: { taskId, type: "slashed" }});
  await emitSSE(taskId, { type: "reputation_update", agent: agentPubkey.toBase58(), delta: -1 });
}
```

### 9.3 End-to-end test
- [ ] Second demo task with insurance opt-in
- [ ] Portfolio B intentionally fails on leg 2
- [ ] Refund USDC lands in user wallet (verify on Explorer)
- [ ] B's on-chain reputation decreases (verify with Anchor read)

---

## Phase 10 — Integration + Bug Bash (both, Day 2 hours 9-14)

### 10.1 Demo rehearsal (hour 9-11)
- [ ] Run full demo script end-to-end 3x without any manual intervention
- [ ] Stage reputation so Router's pick is obvious (set A=70, B=30 before demo)
- [ ] Pre-fund insurance pool to exactly 120 USDC (clean numbers on screen)

### 10.2 Fix flakiness (hour 11-14)
Watch for:
- [ ] SSE reconnection on browser tab change
- [ ] Race condition between coordinator finishing and execute endpoint starting
- [ ] Anchor tx confirmations (wait for `confirmed`, not `processed`)
- [ ] Claude parse errors on unusual phrasings — tighten system prompt
- [ ] Pyth stale price fallback (if Pyth hangs, use cached prices)

### 10.3 Fallback dry-run
- [ ] Kill Pyth endpoint, verify Path B mock prices kick in
- [ ] Disconnect Arc wallet, verify app still works (Circle dropped gracefully)

---

## Phase 11 — Day 3 Morning: Ship (both, Apr 21 0-6h)

### 11.1 Final on-devnet test (hour 0-1)
- [ ] Full demo flow on real devnet, not localhost
- [ ] All tx sigs land on Solana Explorer

### 11.2 Record demo video (hour 1-3)
Script (2-3 min):
1. "This is AgentBazaar — a marketplace of AI agents on Solana, paid via x402." (wallet connect, show empty)
2. "First, fund with USDC from Arc via Circle CCTP." (Fund from Arc, 30s wait, USDC lands)
3. "I want to maintain a 40/30/30 portfolio of AAPL, TSLA, NVDA with $500." (type, submit)
4. "Two xStocks agents are bidding live. A drops to 0.3%, wins." (auction visible)
5. "The winner hires specialist agents — a Price Oracle, then a Swap Agent for each leg. All via x402." (chain animates)
6. "Portfolio is rebalanced. Agent A's reputation goes up on-chain." (portfolio + rep update)
7. "Now a second task with insurance. Agent B fails — insurance pool auto-refunds from Solana, B's reputation gets slashed." (failure + refund)
8. "Remit flip: $20 to an address." (remit demo)
9. "At Frontier this becomes real xStocks via Backed, real INR via Dodo, privacy via Umbra, MEV-protected routing via DFlow."

### 11.3 READMEs (hour 3-5)
Path: `README-solana.md`
- Lead: "x402 on Solana, agentic commerce, reputation-gated services"
- Architecture diagram
- Program addresses + Explorer links
- Agent endpoints + example curl with X-PAYMENT header
- Disclose SDK reuse (Sendai x402-solana or custom middleware, Wallet Adapter, Anchor)

Path: `README-circle.md`
- Lead: "programmable money for humans and agents"
- Arc -> Solana funding flow
- CCTP tx hashes on Arc + Solana

### 11.4 Submit (hour 5-6)
- [ ] Devfolio Solana track submission
- [ ] Devfolio Circle track submission (if CCTP alive)
- [ ] Team lead confirmed (India-based for Frontier Dodo later)

---

## File Creation Checklist

### Solana (P1)
- [ ] `programs/agentbazaar/Anchor.toml`
- [ ] `programs/agentbazaar/programs/registry/src/lib.rs`
- [ ] `programs/agentbazaar/programs/insurance/src/lib.rs`
- [ ] `shared/solana/idl/registry.json`
- [ ] `shared/solana/idl/insurance.json`
- [ ] `shared/solana/src/index.ts` (typed clients + helpers)
- [ ] `scripts/mint-mock-tokens.ts`
- [ ] `scripts/fund-insurance.ts`
- [ ] `scripts/register-agents.ts`

### Middleware (P1)
- [ ] `shared/x402/src/index.ts`
- [ ] `shared/x402/src/next.ts`

### DB (P1)
- [ ] `prisma/schema.prisma`
- [ ] `prisma/seed.ts`

### API routes
- [ ] (P2) `app/web/src/app/api/tasks/route.ts`
- [ ] (P1) `app/web/src/app/api/coordinator/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/router/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/portfolio-a/bid/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/portfolio-a/execute/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/portfolio-b/bid/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/portfolio-b/execute/route.ts`
- [ ] (P1) `app/web/src/app/api/agents/oracle/route.ts`
- [ ] (P1) `app/web/src/app/api/agents/swap/route.ts`
- [ ] (P2) `app/web/src/app/api/agents/remit/route.ts`
- [ ] (P1) `app/web/src/app/api/sse/task/[id]/route.ts`

### Frontend (P2)
- [ ] `app/web/src/app/layout.tsx`
- [ ] `app/web/src/app/page.tsx`
- [ ] `app/web/src/providers/SolanaProvider.tsx`
- [ ] `app/web/src/components/PortfolioView.tsx`
- [ ] `app/web/src/components/TaskInput.tsx`
- [ ] `app/web/src/components/AuctionTicker.tsx`
- [ ] `app/web/src/components/CompositionChain.tsx`
- [ ] `app/web/src/components/ReputationBadge.tsx`
- [ ] `app/web/src/components/FundFromArc.tsx`
- [ ] `app/web/src/hooks/useTaskStream.ts`
- [ ] `app/web/src/lib/portfolio-core.ts`
- [ ] `app/web/src/lib/cctp.ts`

### Docs
- [ ] `README.md` (main)
- [ ] `README-solana.md`
- [ ] `README-circle.md`

---

## Verification Gates Summary

| When | Gate |
|---|---|
| End Day 1 hour 5 | x402 middleware published |
| End Day 1 hour 8 | Oracle + Swap live on localhost |
| End Day 1 hour 11 | Anchor IDL + TS client + Prisma ready |
| End Day 1 | Router pays Oracle via x402, receives real Pyth prices |
| End Day 2 hour 3 | Bidding UI working with SSE |
| **Day 2 18:00** | **CCTP decision: cut or keep** |
| End Day 2 | Full 6-moment demo runs unattended |
| Day 3 noon | Submitted on Devfolio |

---

## If We Fall Behind — Scope Cut Order

Cut in this order until back on schedule:

1. Activity Feed cross-user mock events (~3h)
2. Framer Motion bid animations (replace with plain number updates) (~2h)
3. Agent-composition visual chain (replace with execution log list) (~2h)
4. Circle CCTP / Fund from Arc (cut Circle submission) (~4h)
5. Remit Agent (keep insurance demo via Portfolio B failure, narrate remit as V1) (~2h)
6. Portfolio Agent B (single-agent "auction" with staged fee drops) — **kills demo moment #3, avoid if possible**

Never cut: Registry program, Insurance program, Router, Portfolio A, Oracle, Swap, SSE. Those are the spine.

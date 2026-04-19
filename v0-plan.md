# AgentBazaar V0 — Final Merged Build Plan

## Context

This plan merges two prior drafts:
1. The structured-for-execution plan (smart contract specs, team split, hour-level schedule, escape hatches, verification checklist, demo-moment mapping).
2. The architecture-first doc (6-layer mental model, Postgres+Prisma choice, SSE, "Router is the only LLM" rule, explicit on-chain vs off-chain split, step-by-step user flow).

Both were strong in different dimensions. This merged plan keeps everything load-bearing from each and resolves two architectural tensions:

- **Deploy topology**: single Next.js codebase (frontend + API routes) instead of separate Hono services. Faster to ship, fewer deploy targets. Agents still live at distinct `/api/agents/[name]` routes and call each other over real HTTP with `X-PAYMENT` headers, preserving the "x402-on-Solana" narrative.
- **Off-chain state**: Postgres + Prisma (not Redis/in-memory). Tasks, bids, execution traces, and remit events are durable — critical for demo reliability and for replaying state if the browser refreshes mid-demo.

Target: ship a credible V0 by Apr 21 noon that qualifies for SCBC Solana + Circle tracks and doesn't box in V1 (Frontier). Team of 2.

---

## The Simplest Mental Model (6 Layers)

1. **User Interface** — what the user sees and clicks
2. **App Backend** — receives the task, runs logic, coordinates agents (Next.js API routes)
3. **Agents** — specialized workers (modules within the backend, reached over HTTP)
4. **Database** — Postgres via Prisma; stores tasks, bids, execution logs, demo state
5. **Solana Programs** — trust-critical state only (reputation, insurance)
6. **External Integrations** — Pyth, Jupiter, Circle CCTP

**One-line model:** UI asks for a task -> backend coordinates agents -> Solana stores trust -> UI shows everything happening live via SSE.

---

## Full V0 Feature Set

### User-facing
- Connect Solana wallet
- "Fund from Arc" button (Circle CCTP) — optional, Circle track only
- Enter a rebalance request in natural language
- Watch two Portfolio Agents bid live (fees dropping on screen)
- See the winner selected
- See the winner hire Oracle + Swap agents (composition chain visible)
- See reputation updates tick up/down on-chain
- Opt into insurance on a second task; watch refund fire when agent fails
- Run a simple remit flow

### System-facing
- Router Agent (LLM, Claude)
- Bidding Coordinator
- Portfolio Agent A (aggressive fee, fast)
- Portfolio Agent B (conservative fee, TWAP-ish)
- Oracle Agent (Pyth)
- Swap Agent (Jupiter, on mock SPL tokens)
- Remit Agent (USDC transfer + intentional-fail flag)
- Reputation Registry (Anchor program)
- Insurance Pool (Anchor program)
- Postgres for tasks/bids/logs/events

---

## Tech Stack

**Frontend + backend (single Next.js app)**
- Next.js 14 (App Router, TypeScript)
- React Server Components for static, client components for interactive UI
- API routes under `/api/*` for backend and agent endpoints
- Tailwind CSS + shadcn/ui for styling
- Framer Motion for bid-war animation
- Solana Wallet Adapter (`@solana/wallet-adapter-react`) + Phantom/Backpack
- SSE (EventSource API) for live bid ticker, execution trace, insurance refund status
- Shared TypeScript types in `/shared` so UI and backend agree on Task, Bid, ExecutionStep, InsuranceEvent shapes
- Deploy: Vercel

**Data**
- Postgres (Railway, Supabase, or Neon — pick free tier)
- Prisma ORM
- Schema covers: `Task`, `Bid`, `ExecutionStep`, `InsuranceEvent`, `RemitEvent`, `AgentMetadata`

**Solana**
- Devnet (V0), mainnet-beta (V1)
- Anchor 0.30+ (Rust)
- `@solana/web3.js` + `@solana/spl-token` (TS)
- `@coral-xyz/anchor` TS client for program calls
- SPL Token program (devnet USDC + mock tAAPL/tTSLA/tNVDA mints)
- Pyth price feeds (`@pythnetwork/client`) for AAPL, TSLA, NVDA
- Jupiter Swap API v6 (HTTP, no SDK)

**Payments**
- Custom x402 middleware in `/shared/x402/` (evaluate Sendai `x402-solana` Day 1 morning; fall back to custom HTTP 402 + signed payment message)
- Circle CCTP testnet (Arc testnet origin -> Solana devnet destination) — Circle track only

**LLM**
- Anthropic SDK (Claude) — used **only** by Router Agent for intent parsing
- Portfolio/Oracle/Swap/Remit are deterministic logic (reliability over flashiness)

**Dev**
- pnpm (single workspace, no monorepo complexity)
- Solana CLI, Anchor CLI
- Phantom wallet for testing
- Helius or QuickNode devnet RPC

---

## Smart Contracts — 2 Anchor Programs

x402 is HTTP-layer pay-on-delivery, so no on-chain escrow is needed. Only trust-critical primitives go on-chain.

### 1. AgentBazaar Registry
Combined agent + reputation. One PDA per agent, keyed by owner pubkey.

**Instructions:**
- `register_agent(name: String, endpoint: String, category: String, price_hint: u64)`
- `update_reputation(agent: Pubkey, delta: i32, volume: u64)` — trusted signer authority (V0 shortcut; V1 migrates to CPI from a settlement program)
- `read_reputation(agent: Pubkey)` — view

**Account layout:**
```rust
Agent {
  owner: Pubkey,
  name: String,
  endpoint: String,
  category: String,
  price_hint: u64,
  successes: u32,
  failures: u32,
  score: i32,
  total_volume: u64,
}
```

### 2. Insurance Pool
Single global pool for V0. Pre-funded on deploy (~100 devnet USDC).

**Instructions:**
- `stake_funds(amount: u64)` — anyone can top up
- `release_to_user(task_id: String, user: Pubkey, amount: u64)` — trusted signer triggers refund on agent failure
- `slash_agent(agent: Pubkey)` — decrements agent score in Registry (trusted signer; V1: CPI)

**No Task Commitment / Escrow program.** Payment verification lives in x402 middleware. On agent failure, Insurance Pool pays the user from its own balance; the agent's funds are not clawed back in V0.

---

## Agents — 5 Marketplace + 2 Orchestrators

All live as Next.js API routes at `/api/agents/[name]`. Agent-to-agent calls go over real HTTP with `X-PAYMENT` headers (even though same origin) to preserve the x402 story.

### Marketplace (charged via x402)
1. **Portfolio Agent A** (`/api/agents/portfolio-a`) — aggressive: 0.3-0.6% fee, fast. Deterministic rebalance logic.
2. **Portfolio Agent B** (`/api/agents/portfolio-b`) — conservative: 0.4% fee, TWAP-ish. Same codebase as A with a different config.
3. **Price Oracle Agent** (`/api/agents/oracle`) — Pyth lookup for AAPL/TSLA/NVDA. $0.02/query.
4. **Swap Agent** (`/api/agents/swap`) — Jupiter swap on mock SPL tokens. $0.05/leg.
5. **Remit Agent** (`/api/agents/remit`) — USDC SPL transfer on Solana. Has an intentional-fail flag for the insurance wow moment.

### Orchestrators (not in marketplace, not charged)
6. **Router Agent** (`/api/agents/router`) — LLM-powered (Claude). Parses natural language into a structured `Task` object. **Only LLM agent in V0.**
7. **Bidding Coordinator** (`/api/coordinator`) — broadcasts task to Portfolio A + B, collects bids over 5-10s window, picks winner by `price / reputation_score`.

---

## On-Chain vs Off-Chain Split

### On-chain (Solana)
- Agent reputation state
- Insurance pool balance and refund authority
- USDC + mock SPL token movement

**Why:** trust- and value-sensitive. These must be verifiable.

### Off-chain (Postgres + backend)
- Task records (user request, status, result)
- Bid history (agent, price, timestamp)
- Execution steps (each Oracle/Swap call with timing and result)
- Insurance events (opted-in, triggered, refunded)
- Remit event log
- Agent metadata cache

**Why:** orchestration + application state. Putting this on-chain would massively slow the build without strengthening the demo.

---

## Full Rebalance Flow (10 Steps)

Each step lists what the user sees and what happens technically.

**Step 1 — User opens app**
- Sees: connect wallet button, empty portfolio
- Tech: Next.js renders page, Wallet Adapter init

**Step 2 — User funds (optional, Circle track)**
- Sees: "Fund from Arc" -> devnet USDC appears
- Tech: Circle CCTP Arc testnet -> Solana devnet

**Step 3 — User enters rebalance request**
- Sees: input "Maintain 40% AAPL, 30% TSLA, 30% NVDA with $500"
- Tech: POST `/api/tasks`, Prisma creates `Task` row

**Step 4 — Router parses intent**
- Sees: "got it, routing task…"
- Tech: Router Agent (Claude) returns structured `{ type: rebalance, budget: 500, targets: {...} }`, validated against Zod schema

**Step 5 — Bidding Coordinator auctions the task**
- Sees: live bid ticker; A bids 0.6%, B bids 0.4%, A bids 0.3%
- Tech: Coordinator POSTs to `/api/agents/portfolio-a/bid` + `/portfolio-b/bid`; bids stored in `Bid` table; each insert triggers SSE event to UI

**Step 6 — Winner selected**
- Sees: one agent highlighted with reason ("lowest fee, reputation above floor")
- Tech: Coordinator picks by `price / reputation_score`; reads reputation via `@coral-xyz/anchor` client against Registry program

**Step 7 — Winner calls Oracle Agent**
- Sees: execution trace step 1 complete
- Tech: winning Portfolio agent HTTP POSTs to `/api/agents/oracle` with `X-PAYMENT` header (USDC transfer sig); Oracle verifies + returns Pyth prices; `ExecutionStep` row stored; SSE event fires

**Step 8 — Winner calls Swap Agent (3 legs)**
- Sees: execution trace steps 2-4 complete; portfolio moves toward target
- Tech: winning Portfolio agent HTTP POSTs to `/api/agents/swap` 3x with x402; Swap executes Jupiter quote -> mock SPL transfer; each result stored + streamed

**Step 9 — Reputation updates on-chain**
- Sees: agent's reputation score ticks up
- Tech: backend calls `update_reputation(winner, +1, volume)` on Registry program via Anchor TS client

**Step 10 — Final result**
- Sees: updated portfolio + full execution trace + updated reputation
- Tech: Next.js UI shows final state; `Task.status = completed` in Prisma

### Insurance refund path (second task on demo)
- User opts in, agent (Portfolio B) deliberately fails slippage check
- Backend detects failure, calls `release_to_user(task_id, user, amount)` on Insurance Pool
- Backend calls `slash_agent(B)` -> decrements B's reputation
- `InsuranceEvent` row stored, SSE fires refund status to UI

---

## Full Remit Flow (5 Steps)

1. User enters amount + recipient Solana address
2. Frontend POSTs task to `/api/tasks`; Prisma creates `Task`
3. Router Agent classifies as `remit`
4. Remit Agent executes (or mocks) USDC SPL transfer; `RemitEvent` stored
5. UI shows result + tx signature

---

## Team Split — 2 People

Split is by language/toolchain boundaries so nobody context-switches Rust<->React mid-day.

### P1 — Solana + Backend Infra
- Both Anchor programs (Registry, Insurance Pool)
- Circle CCTP integration
- Mock tAAPL/tTSLA/tNVDA SPL mints
- IDL + TS client bindings
- x402 middleware package (`/shared/x402/`)
- Prisma schema + migrations
- `/api/agents/oracle`, `/api/agents/swap`, `/api/coordinator` (backend-heavy agents)
- On-chain reputation update helpers (`update_reputation`, `slash_agent` callers)

### P2 — Frontend + LLM/User-Facing Agents
- Next.js app shell (all pages, routing, layout)
- Wallet connect + Solana context provider
- Portfolio view (current / target / drift)
- Chat / task input UI
- Live auction ticker with Framer Motion bid-war animation
- Agent-composition view (Portfolio -> Oracle -> Swap chain)
- Insurance opt-in toggle + reputation badges
- SSE client wiring across all views
- `/api/agents/router` (LLM intent parser)
- `/api/agents/portfolio-a`, `/api/agents/portfolio-b`, `/api/agents/remit`
- Demo script rehearsal lead

### Handoff Gates (P1 blocks P2 here)
- **Day 1 hour 5**: x402 middleware published -> P2's agents can require payment
- **Day 1 hour 8**: Oracle + Swap endpoints live on localhost -> P2's Portfolio agents can compose against them
- **Day 1 hour 11**: Anchor IDL + TS client in `/shared/solana/` + Prisma schema generated -> P2's Router and frontend can read reputation + write task/bid rows

---

## Day-by-Day, Hour-Level

### Day 1 — Apr 19 (~14h each)

| Hr | P1 — Solana + Backend Infra | P2 — Frontend + LLM Agents |
|---|---|---|
| 0-2 | Next.js workspace init, Anchor init, devnet faucet, SDK installs, Prisma init | Next.js app shell, Tailwind + shadcn, Wallet Adapter, Phantom connect |
| 2-5 | **Registry program**: `register_agent`, `update_reputation`. Prisma schema (Task, Bid, ExecutionStep, InsuranceEvent, RemitEvent) | Portfolio view stub (current / target / drift table). Chat input UI. SSE client scaffold |
| 5-8 | **x402 middleware** (evaluate Sendai; implement HTTP 402 + payment-sig verify). Publish to `/shared/x402/`. | Router Agent: Claude intent parser with Zod schema output. Handles rebalance + remit intents |
| 8-11 | **Oracle Agent** (Pyth behind x402) + **Swap Agent** (Jupiter quote + mock SPL transfer behind x402) | Once middleware drops: wire Router -> Oracle x402 call end-to-end on localhost |
| 11-14 | **Insurance Pool program** (`stake_funds`, `release_to_user`, `slash_agent`). Mint mock tAAPL/tTSLA/tNVDA | Portfolio Agent A: deterministic bid logic + compose Oracle + Swap calls |
| 14-18 (eve) | IDL + TS client bindings in `/shared/solana/`. Deploy both programs to devnet. Pre-fund insurance pool | Portfolio Agent B (config variant of A). Remit Agent skeleton with intentional-fail flag |

**Day 1 gate (23:59):** Router pays Oracle via x402 with devnet USDC; real Pyth prices returned. Portfolio A runs end-to-end on localhost. Frontend shows wallet + empty portfolio.

### Day 2 — Apr 20 (~14h each)

| Hr | P1 | P2 |
|---|---|---|
| 0-3 | **Bidding Coordinator** (broadcast to A + B, 5-10s window, pick winner by `price / reputation`). SSE emission per bid | Live auction UI with Framer Motion bid-war animation. SSE subscription to coordinator |
| 3-6 | **Circle CCTP** Arc -> Solana integration (server side + client hook) | "Fund from Arc" button. Agent-composition view (visual chain of Portfolio -> Oracle -> Swap) |
| 6-9 | Wire **Insurance Pool slashing**: detect slippage failure -> `release_to_user` + `slash_agent` | Remit Agent finalize + fail flag. Insurance opt-in toggle. Reputation badge rendering |
| 9-12 | On-chain reputation update on success + failure. Stake/slash integration test | Router -> Coordinator wiring in frontend. Full demo flow runnable in UI |
| 12-14 | E2E integration + bug bash with P2 | E2E test of full demo script with P1. Bug fixes |

**Day 2 hard gate (18:00):** If Arc -> Solana CCTP isn't end-to-end by 18:00, **drop Circle track**. Ship Solana-only. P1 rejoins bug bash. Frontier plan unaffected.

**Day 2 end gate:** Full 6-moment demo script runs without human intervention.

### Day 3 — Apr 21 until noon (~6h each)

| Hr | P1 | P2 |
|---|---|---|
| 0-1 | Final integration test on real devnet (not localhost). Stage reputation scores so Router's pick is obvious | Rehearse demo script 3x; lock wallet state for clean takes |
| 1-3 | Bug bash on demo flakiness. Pre-fund insurance pool. Verify all tx sigs land | Record 2-3 min demo video, multiple takes. Light edit |
| 3-4 | `README-solana.md` — lead with "x402 on Solana", "agentic commerce", "reputation-gated services", "payments & stablecoins". Include program addresses, architecture diagram | Upload video. Draft Devfolio submission |
| 4-5 | `README-circle.md` — lead with "programmable money for humans & agents", "Arc as funding source". Skip if Circle dropped | Devfolio submission detail: team, links, V1 roadmap teaser |
| 5-6 | Submit on Devfolio (Solana + Circle if alive). Buffer | Buffer |

---

## 6-Moment Demo Script -> Component Map

| # | Moment | Components |
|---|---|---|
| 1 | Fund from Arc: CCTP top-up -> USDC appears | Frontend CCTP button -> Circle CCTP -> Solana devnet USDC |
| 2 | Portfolio setup: 40/30/30, $500 | Frontend portfolio view + `/api/tasks` + Prisma `Task` row |
| 3 | Live bidding: A vs B, 0.6% -> 0.3% visible | Bidding Coordinator -> SSE -> frontend ticker w/ Framer Motion |
| 4 | Agent composition: winner hires Oracle ($0.02) + Swap ($0.05 x3) | Winning Portfolio -> Oracle + Swap over HTTP with X-PAYMENT headers |
| 5 | Reputation + insurance slash: second task fails slippage, pool refunds, reputation decrements | Insurance Pool `release_to_user` + Registry `update_reputation` |
| 6 | Remit flip: "send $20 USDC to address" + V1 roadmap teaser | Remit Agent + narration covering Umbra/Dodo/DFlow/real xStocks |

---

## xStocks Execution Path — Path A Default

- **Path A (default)**: Real Pyth price feeds for AAPL/TSLA/NVDA. Portfolio agent plans real rebalance. Swap executes on mock SPL tokens (tAAPL/tTSLA/tNVDA) minted Day 1 evening. Narrator: "In V1 this fires the real Backed swap."
- **Path B (fallback)**: Full mock — scripted price feeds + mock tokens. Use if Pyth on Solana devnet fails by Day 1 end.
- **Path C (last resort)**: Retarget to SOL/USDC/JUP/BONK. Same mechanics, different underlying. Use only if Day 2 morning mock-token path is also broken.

Default to Path A unless Day 1 end Pyth test fails.

---

## Escape Hatches — Timed Decision Gates

| When | Trigger | Action |
|---|---|---|
| Day 1 end (Apr 19 23:59) | Sendai `x402-solana` lib unstable | Switch to custom HTTP 402 + signed-payment-message middleware. Disclose in README. |
| Day 1 end (Apr 19 23:59) | Pyth on Solana devnet failing | Drop to Path B (mock feeds) |
| Day 2 morning (Apr 20 12:00) | Mock xStocks tokens failing | Drop to Path C (SOL/USDC/JUP/BONK). Narrate xStocks in V1 |
| Day 2 18:00 | Arc -> Solana CCTP not working end-to-end | Drop Circle track. Ship Solana-only. P1 rejoins bug bash |
| Day 2 late | P2 slipping on frontend | Drop Activity Feed's cross-user mock events (only show current user's task). Saves ~3h UI. |
| Day 2 late | Still slipping | Drop agent-composition visual chain — replace with a simple execution log list. Saves ~2h |

---

## New Tech to Learn (Priority-Ordered)

| # | Topic | Owner | Budget |
|---|---|---|---|
| 1 | x402 protocol + Sendai `x402-solana` reference | P1 | 3-4h |
| 2 | Anchor framework (if not fluent) | P1 | 4-6h |
| 3 | Prisma + Postgres schema + migrations | P1 | 1-2h |
| 4 | Pyth on Solana (`@pythnetwork/client`) | P1 | 1-2h |
| 5 | Jupiter Swap API v6 | P1 | 2h |
| 6 | Circle CCTP Arc -> Solana | P1 | 2-3h |
| 7 | Solana Wallet Adapter | P2 | 1h |
| 8 | SSE with Next.js App Router | P2 | 1-2h |
| 9 | Framer Motion for bid animation | P2 | 1h |
| 10 | Anthropic SDK (Claude) for Router | P2 | 1h |

---

## Critical Success Factors

1. **Use sponsor phrases verbatim in READMEs.** Solana: "x402 on Solana", "agentic commerce", "payments & stablecoins". Circle: "programmable money for humans & agents".
2. **Router Agent must pick autonomously** — not take a user click. Selection reason must be visible ("lowest fee, reputation above floor").
3. **Insurance slashing on camera** — the single most memorable demo moment. Pre-stage the failing agent so it triggers reliably.
4. **Apply for Dodo Payments sandbox keys NOW** (Apr 19) — don't wait until Apr 22, or V1 Week 1 is blocked.
5. **Confirm India-based team lead** for Colosseum Dodo track submission.
6. **Disclose all SDK reuse** (x402 libs, Umbra SDK, etc.) — undisclosed reuse = auto-DQ at both hackathons.
7. **Router is the only LLM agent.** Portfolio/Oracle/Swap/Remit must be deterministic — LLM unpredictability kills live demos.

---

## Critical Files to Create

Starting from blank repo at `/Users/ritik/Documents/agent-marketplace/`:

```
/programs/
  /registry/           # Anchor program 1
  /insurance/          # Anchor program 2

/app/
  /web/                # Next.js app (pages, components, layouts)
  /api/
    /tasks/            # POST task, GET task status
    /coordinator/      # Bidding Coordinator
    /agents/
      /router/
      /portfolio-a/
      /portfolio-b/
      /oracle/
      /swap/
      /remit/
    /sse/              # SSE stream endpoints

/shared/
  /types/              # Task, Bid, ExecutionStep, InsuranceEvent shapes
  /x402/               # x402 middleware package
  /solana/             # Anchor IDL + TS client bindings

/prisma/
  schema.prisma        # Task, Bid, ExecutionStep, InsuranceEvent, RemitEvent, AgentMetadata

/scripts/
  mint-mock-tokens.ts  # tAAPL, tTSLA, tNVDA
  fund-insurance.ts    # Pre-fund pool
  register-agents.ts   # Seed Registry

README-solana.md
README-circle.md
```

---

## Verification — V0 Ready to Submit

All must run end-to-end on camera, no cuts:

1. Wallet connects; devnet USDC balance starts at 0
2. (Circle track only) Arc -> Solana CCTP top-up; USDC appears
3. User types "rebalance my portfolio 40/30/30 with $500" in natural language
4. Router parses intent correctly; `Task` row visible in DB
5. Bidding Coordinator streams bids from Portfolio A and B; fees drop visibly (SSE works)
6. Winner selected by `price / reputation`; selection reason visible in UI
7. Winning agent calls Oracle (x402 visible) -> receives real Pyth prices
8. Winning agent calls Swap 3x (x402 visible) -> mock SPL tokens move; portfolio reaches target
9. Winner's reputation increments on-chain (Anchor tx sig visible)
10. Second task: user opts into insurance; Remit Agent fires intentional-fail
11. Insurance Pool refunds user; failing agent's reputation decrements on-chain
12. README teases V1 (Umbra + Dodo + DFlow + real xStocks via Backed)

All 12 pass -> submit Solana track. If step 2 passes -> also submit Circle.

---

## V0 -> V1 Roadmap (for demo narration + README)

- **Umbra SDK** — private payments to agents, private aggregate reputation queries
- **Dodo Payments** — real INR settlement for Remit Agent (apply for sandbox keys this week)
- **DFlow** — MEV-protected cross-border routing in Remit Agent
- **Real xStocks via Backed Finance** — swap mock tokens for real Backed tokens on mainnet
- **Prediction Agent** — new agent type with privacy-preserving bets via Umbra
- **Real staking + slashing** — open insurance pool to public stakers
- **Creator economy** — CLI template + no-code form for any developer to register an agent
- **Generalist Fallback + Bounty Board** — self-healing "no agent matches" path
- **Eitherway platform migration** — final polished deploy target

The V0 architecture is not disposable. It is the minimal kernel of the V1/V2 product.

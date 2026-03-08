# X-Agent: Sippy Twitter Marketing Agent — Implementation Plan

## Overview

Automated content agent for [@sippylat](https://x.com/sippylat) on X/Twitter. Generates and posts 1-2 tweets/day in a build-in-public, bilingual (Spanish-first) voice. Write-only MVP — no reading, no engagement automation. Manual replies from phone.

## Architecture

```
apps/x-agent/
├── src/
│   ├── brands/
│   │   ├── types.ts              # BrandVoice interface
│   │   └── sippy.ts              # Sippy voice config + example tweets
│   ├── content/
│   │   ├── archetypes.ts         # Tweet format definitions (take, update, showcase, question, thread-hook)
│   │   ├── generate.ts           # LLM content pipeline (context assembly → generation → critique)
│   │   └── critique.ts           # Self-review pass (anti-bot filter, quality gate)
│   ├── x-client.ts               # twitter-api-v2 wrapper (post tweet only)
│   ├── scheduler.ts              # node-cron + jitter (1-30min random offset)
│   ├── db/
│   │   └── schema.ts             # Drizzle schema (content_queue table)
│   ├── lib/
│   │   ├── context.ts            # Recent tweets loader (anti-repetition window)
│   │   └── jitter.ts             # Random delay utility
│   ├── index.ts                  # Hono server (health endpoint + manual trigger)
│   └── main.ts                   # Bootstrap: cron + server
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── Dockerfile
├── railway.toml
├── .env.example
└── PLAN.md                       # This file
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | Health endpoint + manual trigger route |
| `twitter-api-v2` | X API v2 client (free tier, write-only) |
| `node-cron` | Scheduling |
| `drizzle-orm` + `postgres` | DB access (reuse monorepo patterns) |
| `@openrouter/ai-sdk-provider` + `ai` | LLM via Vercel AI SDK + OpenRouter (same provider as `packages/ai`) |
| `zod` | Validation |
| `tsup` | Bundle for deployment |

## Design Decisions

### Why a standalone LLM setup?

The x-agent needs a simple content generation pipeline — just prompt assembly + generateText + critique. We reuse the same LLM provider (`@openrouter/ai-sdk-provider`) and env pattern (`OPENROUTER_API_KEY`) as the rest of the monorepo, but with x-agent-specific prompts. No new provider stack — just new prompts.

### Why its own DB connection?

The x-agent manages its own content queue. It doesn't need tenant isolation or RLS — it's a single-tenant service posting for Sippy. Tables live in a dedicated `x_agent` schema with a dedicated `x_agent` Postgres role that has grants ONLY on that schema. This follows the monorepo's pattern of intentional isolation for non-tenant services (like `apps/jobs` with `DATABASE_URL_SERVICE_ROLE`). No shared access to other app tables, no unrestricted public schema pollution.

### Why not a shared `packages/agents` package?

Premature. Build the first agent, learn what's reusable, extract later. Each agent in `apps/agents/` is self-contained for now.

## DB Schema

Single table for MVP. Lives in same Supabase instance but in a dedicated `x_agent` schema with a dedicated role.

```sql
-- Migration: NNNN_x_agent_schema.sql

-- Dedicated schema for x-agent (isolated from other app tables)
-- NOTE: Role creation + grants are INFRASTRUCTURE concerns, not migration concerns.
-- The x_agent_user role + password + GRANT statements are provisioned manually
-- in Supabase dashboard (or via infra script), NOT in this migration file.
-- This migration assumes the role already exists and has USAGE on x_agent schema.
CREATE SCHEMA IF NOT EXISTS x_agent;

CREATE TABLE IF NOT EXISTS x_agent.content_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           text NOT NULL DEFAULT 'sippy',
  archetype       text NOT NULL,              -- 'take', 'update', 'showcase', 'question', 'thread_hook'
  content         text NOT NULL,              -- The tweet text
  critique_score  integer,                    -- 1-10 self-critique score
  critique_note   text,                       -- Why it scored that way
  status          text NOT NULL DEFAULT 'queued',
    -- 'queued'     → generated, waiting to post
    -- 'claimed'    → picked up by posting cron (in-flight)
    -- 'posted'     → successfully posted to X
    -- 'rejected'   → failed self-critique
    -- 'failed'     → terminal failure after max retries
    -- 'dry_run'    → generated in dry-run mode, awaiting review (terminal until DRY_RUN=false)
  retry_count     integer NOT NULL DEFAULT 0, -- Incremented on each posting attempt
  claimed_at      timestamptz,                -- When posting cron picked it up (stale claim recovery)
  scheduled_for   timestamptz,                -- When to post (with jitter applied)
  posted_at       timestamptz,                -- When actually posted
  x_tweet_id      text,                       -- X tweet ID after posting
  last_error      text,                       -- Most recent error message
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Partial index for the posting cron picker
CREATE INDEX idx_xcq_queued_scheduled ON x_agent.content_queue (scheduled_for)
  WHERE status = 'queued';

-- Partial index for stale claim recovery
CREATE INDEX idx_xcq_claimed ON x_agent.content_queue (claimed_at)
  WHERE status = 'claimed';
```

### Queue Claim Pattern (atomic, race-safe)

Follows `apps/jobs` SKIP LOCKED pattern:

```sql
-- Posting cron: claim one row atomically
UPDATE x_agent.content_queue
SET status = 'claimed', claimed_at = now(), updated_at = now()
WHERE id = (
  SELECT id FROM x_agent.content_queue
  WHERE status = 'queued' AND scheduled_for <= now()
  ORDER BY scheduled_for
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- Stale claim recovery (claimed > 5min ago → back to queued)
UPDATE x_agent.content_queue
SET status = 'queued', claimed_at = NULL, updated_at = now()
WHERE status = 'claimed' AND claimed_at < now() - interval '5 minutes';
```

### Retry + Terminal Failure

- On posting error: increment `retry_count`, set `last_error`, set status back to `'queued'`
- If `retry_count >= 3`: set status to `'failed'` (terminal — no more retries)
- Terminal rows stay in DB for debugging, never re-queued automatically

## Brand Voice Config

```ts
interface BrandVoice {
  name: string
  handle: string
  oneLiner: string
  oneLinerEs: string
  targetAudience: string
  tone: string[]
  personality: string           // 2-3 sentence character description
  avoidPatterns: string[]       // Phrases/words to never use
  exampleTweets: string[]       // 10-15 reference tweets (the gold)
  topics: string[]              // What this brand talks about
  neverTopics: string[]         // What it never talks about
  contentPillars: {             // Weighted content mix
    domainInsights: number      // 0.40 — peso devaluation, LatAm money frustrations
    buildInPublic: number       // 0.30 — beta numbers, user stories, shipping updates
    uxShowcase: number          // 0.20 — WhatsApp flow screenshots description
    productMilestone: number    // 0.10 — launches, features, milestones
  }
  languages: ('en' | 'es')[]   // Post in both, Spanish-primary (~70/30)
  casualnessLevel: number       // 0-1, controls imperfection budget
  timezone: string              // IANA timezone (e.g. 'America/Bogota')
  activeHours: {                // Local time window (in brand's timezone)
    start: number               // e.g. 8  (8am local)
    end: number                 // e.g. 22 (10pm local)
  }
  // Note: start < end always (no midnight wraparound in local time).
  // Conversion to UTC happens at runtime using the timezone field.
  // This avoids the overnight-window bug of raw UTC integers.
}
```

### Sippy Voice

**Model:** Levels' radical transparency + Freddier's Colombian bilingual energy + Rauch's observation-as-promotion technique.

| Element | Source | Implementation |
|---|---|---|
| Language mix | @freddier (Freddy Vega) | Spanish-primary (~70%), English for tech/investor reach (~30%) |
| Transparency/numbers | @levelsio (Pieter Levels) | Share real metrics: users, volume, exchange rates beaten |
| Observation-as-promotion | @rauchg (Guillermo Rauch) | "Noticed that X% of remittances lose $Y" not "We save you money!" |
| Compression/punch | @naval (Naval Ravikant) | One-sentence truths about money in Colombia |
| Mission framing | @pbarbieri (Pierpaolo Barbieri) | "The system isn't built for us" — casual, not from a podium |
| Anti-corporate | @levelsio | No press releases. Talk like a person. |
| Colombian identity | @freddier | Lean into it. Bogota, Medellin, Cali references. |

**Voice characteristics:**
- Direct, casual, bilingual (Spanish ~70%, English ~30%)
- Real numbers always, even when small
- Frustrated-with-the-status-quo energy ("why is this still so hard in 2026?")
- Never sounds like a fintech press release
- Never uses crypto jargon (no blockchain, web3, USDC, Arbitrum, on-chain)
- Shows the WhatsApp UX, doesn't just describe it
- Lowercase ok, incomplete sentences ok, occasional "lol" or "tbh"
- Anti-ChatterPay: no inflated TAM numbers, no self-published press, no chain name-dropping
- Colombian identity as a strength, not an afterthought

**Full research:** See `X_MARKETING_RESEARCH.md` for competitor analysis, voice model deep-dives, and strategy data.

## Tweet Archetypes

Each archetype has a template prompt structure and maps to a content pillar:

| Archetype | Pillar | Example direction |
|-----------|--------|-------------------|
| `take` | domainInsights | Hot take on remittance fees, peso devaluation, banking UX |
| `update` | buildInPublic | Beta metrics, user count, volume, shipping progress |
| `showcase` | uxShowcase | Describe the WhatsApp flow as if showing a screenshot |
| `question` | domainInsights | Genuine question to audience about money habits, pain points |
| `thread_hook` | any | Single-tweet hook that could become a thread later (not a thread itself in v1) |
| `story` | buildInPublic | Short user story or anecdote ("a user in Cali sent $5 to her mom...") |
| `contrast` | domainInsights | Compare old way vs Sippy way ("you need: an app, an ID, 3 days... or you need: WhatsApp") |

Selection: weighted random based on `contentPillars` config. Anti-repetition: don't pick the same archetype twice in a row (check last 3 tweets in DB).

## Content Generation Pipeline

### Step 1 — Context Assembly
```
1. Load brand voice config
2. Fetch last 10 posted tweets from DB (anti-repetition)
3. Select archetype (weighted random, no recent repeats)
4. Select language (70% Spanish, 30% English, weighted random)
5. Assemble prompt with: voice config + archetype template + recent tweets + language
```

### Step 2 — Generation
```
1. Call LLM (generateText via Vercel AI SDK + OpenRouter)
   - Model: a fast, cheap model (e.g., llama-3.3-70b or gpt-4o-mini via OpenRouter)
   - Temperature: 0.9 (creative, varied)
   - Max tokens: 280 (tweet-length constraint)
2. Post-process: trim, validate length ≤ 280 chars
```

### Step 3 — Self-Critique
```
1. Second LLM call with critique prompt:
   "Score this tweet 1-10 on: authenticity (would a real person post this?),
   engagement potential, brand alignment, bot-detection risk.
   Explain your score in 1 sentence."
2. If score < 7: reject, log to DB with status 'rejected', retry generation (max 3 attempts)
3. If score >= 7: queue for posting
```

### Step 4 — Queue & Post
```
1. Insert into content_queue with status 'queued', scheduled_for = next slot + jitter
2. Posting cron atomically claims one row (UPDATE ... FOR UPDATE SKIP LOCKED → status = 'claimed')
3. Check DRY_RUN gate in x-client.ts — if true, log "dry-run: would post" and set status to 'dry_run' (terminal — not re-queued)
4. If not dry-run: post via twitter-api-v2
5. On success: status = 'posted', posted_at, x_tweet_id
6. On error: increment retry_count, set last_error
   - If retry_count >= MAX_POSTING_RETRIES: status = 'failed' (terminal)
   - Otherwise: status = 'queued' (will be retried on next cron tick)
7. Stale claim recovery: claimed > 5min ago → status back to 'queued'
```

## Scheduler Design

Two cron jobs:

### 1. Content Generation Cron
- Runs 2x/day at base times (e.g., 14:00 UTC / 21:00 UTC = 9am / 4pm COT)
- Each run: generate 1 tweet, add jitter (1-30min), insert to queue
- If queue already has a non-terminal row (`queued`, `claimed`, or `dry_run`) for today, skip (prevents double-generation on restart)

### 2. Posting Cron
- Runs every 5 minutes
- Atomically claims one row: `status = 'queued' AND scheduled_for <= now()` → `status = 'claimed'` (SKIP LOCKED)
- Posts via x-client.ts (which checks DRY_RUN gate before calling X API)
- Updates status to `'posted'` or handles retry/failure
- Also runs stale claim recovery: `status = 'claimed' AND claimed_at < now() - 5min` → back to `'queued'`

### Jitter Implementation
```ts
function addJitter(baseTime: Date, minMinutes = 1, maxMinutes = 30): Date {
  const jitter = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes
  return new Date(baseTime.getTime() + jitter * 60_000)
}
```

### Active Hours Guard
Convert current time to brand's timezone (`Intl.DateTimeFormat` with `timeZone` option), extract local hour, check if within `[start, end)`. Since start < end always in local time (no wraparound), this is a simple range check. If outside window, defer `scheduled_for` to next window start (in local time, converted back to UTC) + jitter.

## Hono Server

Minimal — exists for Railway health checks and manual triggers.

```
GET  /health          → 200 { status: 'ok', dryRun: bool, queued: N, posted_today: N }
POST /generate        → Manually trigger content generation (auth: API key)
GET  /queue           → View queued + recent tweets (auth: API key)
POST /queue/:id/post  → Force-post a specific tweet (auth: API key, RESPECTS DRY_RUN gate)
POST /queue/:id/reject → Reject a queued tweet (auth: API key)
```

**DRY_RUN enforcement:** The gate lives in `x-client.ts` — the single chokepoint for all X API calls. Both the posting cron and `POST /queue/:id/post` go through the same client. When `DRY_RUN=true`, the client logs the tweet content, sets status to `'dry_run'` (terminal — posting cron ignores these rows), and returns a mock response. No code path bypasses this gate. When switching to `DRY_RUN=false`, existing `'dry_run'` rows can be promoted to `'queued'` via `POST /queue/:id/post` to review and post them.

Auth: single `X_AGENT_API_KEY` env var, checked via middleware. Not Clerk — this is a standalone service.

## Environment Variables

```env
# X/Twitter API (Free Tier)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=

# LLM
OPENROUTER_API_KEY=          # Shared with Sippy backend

# Database
DATABASE_URL=                 # x_agent_user connection to Supabase (x_agent schema only)

# Server
PORT=3002
X_AGENT_API_KEY=              # Simple auth for manual endpoints

# Safety
DRY_RUN=true                  # HARD GATE: when true, NO tweets are posted anywhere.
                              # Generation + critique still run, rows enter 'queued' status,
                              # but the posting cron and POST /queue/:id/post both refuse
                              # to call the X API. Enforced in x-client.ts (single chokepoint).
                              # Set to false ONLY after voice calibration is complete.

# Config
TWEETS_PER_DAY=2              # Default 2, configurable
CRITIQUE_THRESHOLD=7          # Minimum score to post
MAX_POSTING_RETRIES=3         # Terminal failure after this many attempts
```

## Deployment

### Railway
- Separate service in existing Railway project
- `Dockerfile` follows `apps/jobs` pattern (two-stage, tsup bundle)
- `railway.toml`: port 3002, replicas 1
- Health check: `GET /health`

### tsup Config
- Same pattern as `apps/api` and `apps/jobs`: `noExternal: [/.*/]`, ESM output, CJS banner for `createRequire`

## Build Order

### Phase 1 — Scaffold (tasks 1-4)
1. Project scaffold: `package.json`, `tsconfig.json`, `tsup.config.ts`, `.env.example`
2. DB schema: `x_content_queue` table, Drizzle schema, migration SQL
3. Brand voice config: `BrandVoice` type + Sippy config with placeholder example tweets
4. Tweet archetypes: definitions + selection logic

### Phase 2 — Content Engine (tasks 5-7)
5. Content generation pipeline: context assembly + LLM generation
6. Self-critique pass: second LLM call, scoring, rejection logic
7. Anti-repetition: recent tweets loader, archetype dedup

### Phase 3 — Posting & Scheduling (tasks 8-10)
8. X client: `twitter-api-v2` wrapper, post-only
9. Scheduler: node-cron jobs (generation + posting) with jitter
10. Active hours guard + queue management

### Phase 4 — Server & Deploy (tasks 11-13)
11. Hono server: health + manual trigger + queue viewer endpoints
12. Bootstrap: `main.ts` wiring (cron + server)
13. Deployment: `Dockerfile`, `railway.toml`, tsup config

### Phase 5 — Polish (task 14)
14. Logging: structured logs for generation, critique scores, posting results

Note: Dry-run is NOT a polish item — it's a hard gate built into x-client.ts from Phase 3 (task 8). `DRY_RUN=true` is the default. It must be explicitly set to `false` to enable real posting.

## Testing Strategy

- **Unit tests (Vitest):** critique scoring, archetype selection, jitter bounds, active hours guard
- **Integration test:** full pipeline in dry-run mode (generate → critique → queue, no actual post)
- **Manual validation:** run dry-run for 3 days, review generated tweets, tune voice config

## Open Questions

1. ~~Voice calibration~~ **RESOLVED:** Levels + Freddier + Rauch blend. See voice config above.
2. **Image tweets:** v1 is text-only. v2 could generate images (WhatsApp screenshots, charts). Deferred.
3. **Thread support:** v1 is single tweets only. Thread generation is a natural v2 feature.
4. **Analytics loop:** Free tier can't read metrics. v2 with Basic tier ($100/mo) adds a learning loop that adjusts content based on performance.
5. ~~Separate Supabase schema?~~ **RESOLVED:** Dedicated `x_agent` schema + `x_agent_user` role. No public schema pollution.
6. ~~Should the agent share `packages/ai`?~~ **RESOLVED:** No. Reuses `@openrouter/ai-sdk-provider` (same provider), but prompts are self-contained.
7. ~~LLM provider mismatch~~ **RESOLVED:** Uses `@openrouter/ai-sdk-provider`, same as rest of monorepo. No `@ai-sdk/openai`.

## Success Criteria (Week 1)

- [ ] Agent generates 2 tweets/day that pass self-critique (score ≥ 7)
- [ ] Tweets post to @sippylat via free tier API without errors
- [ ] No two consecutive tweets use the same archetype
- [ ] ~70% Spanish, ~30% English distribution
- [ ] Dry-run mode works for review before going live
- [ ] Deployed on Railway with health check passing

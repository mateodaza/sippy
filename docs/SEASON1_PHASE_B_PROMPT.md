# Season 1 — Phase B (proof dashboard) — implementation task

You are implementing **Phase B** of Season 1 in the Sippy monorepo: the public proof dashboard. This is the asset every founder thread links to, so it must be **honest and believable** — usage, not blended movement.

Phase A (measurement core) is merged. Branch off `main`.

## Read first (do not skip)

1. `docs/SEASON1_IMPLEMENTATION_PLAN.md` — §8 (dashboard), §9 (APIs), §5 (the believable metric set). The audit decisions in §6/§13 are settled; honor them.
2. `apps/backend/app/season/definitions.ts` — **the single source for `isActive` / `maw` / `isRetained` / `distinctVerifiedCounterparties` and the verified-wallet floor.** The dashboard imports these; it does NOT re-derive them in SQL in the controller. Read the `verifiedWalletCte()` doc-comment — it spells out the verified floor (strict, `phone_registry`-only) vs the broad "is it ours" set.
3. `apps/backend/app/controllers/public_stats_controller.ts` — the current `/api/stats` aggregates (and the "onboarded" CTE that uses the broad `phone_registry ∪ wallet_aliases` set).
4. `apps/web/app/stats/page.tsx` — the current dashboard. Today the hero is `USDC MOVED` / sublabel `DEPOSITS + SENDS` — that blend is exactly what Phase B fixes.
5. `apps/web/components/ui/live-stats.tsx` + `apps/web/app/page.tsx` — the landing-page `LiveStats` strip also shows a blended `VOLUME` from `/api/stats` (see "back-compat" below).

## The core idea — the un-blend

Stop making blended movement the headline.

- **Hero = Transacted Volume** — real **value-out**: verified sends (+ off-ramp once Phase C emits it) by Sippy users. This is the number the grant measures and the number CT can't dunk on.
- **On-ramped = a separate, clearly-labeled tile** — funds entering Sippy (the broad `phone_registry ∪ wallet_aliases` inflow, same as today's `usdcOnboarded`). **Never added into the hero.**
- Then the believable usage tiles: **MAW**, **active-this-week**, **retained + retention rate**, **distinct counterparties**, **activated %**.

## Per-metric definition rule (load-bearing — from the audit)

There are two legitimate wallet universes, and each metric uses exactly one:

- **Strict personhood floor** (`#season/definitions`, `phone_registry` minus operators): `isActive`, `maw`, `isRetained`, `distinctVerifiedCounterparties`, transacted-volume hero, most-active senders.
- **Broad "is it ours" set** (`phone_registry ∪ wallet_aliases`, the existing `public_stats` style): onboarded / inflow tiles only.

**The failure mode to prevent: a metric computed one way on the dashboard and another way in the grant report.** MAW must come from `maw()` in both places — never re-implemented in the controller. If you need a metric `#season/definitions` doesn't expose yet, **add it there** and import it; do not inline a second SQL definition.

## Scope — build exactly this

### 1. `GET /api/season/stats` (public, throttled)

A new controller (mirror `public_stats_controller` patterns, reuse its throttle/cache approach) returning the dashboard aggregates. **All usage metrics come from `#season/definitions`:**

- `transactedVolume` (verified value-out, hero) · `onboarded` (broad set, separate) · `maw` · `activeThisWeek` · `retained` + `retentionRate` · `distinctCounterparties` (network-wide) · `activatedPct` · `countries` (reuse existing CTE) · `transferCount`.
- **Score-derived, render only if present:** `scoreDistribution` (buckets over `season.score`) and `topSenders` (sybil-filtered, masked) — these need `season.score` populated (backfill / flag-on). Return them as `null`/empty when the table is empty so the page degrades gracefully.

### 2. `GET /api/season/transactions` (public, paginated, IP-throttled)

Recent `onchain.transfer` rows for the live feed. Each row: `amount` (formatted USD), `timestamp` (for relative time), **masked/truncated `from` & `to`** (on-chain addresses only — public; **phones are never involved here**), and `txHash` → an **Arbiscan link** (`https://arbiscan.io/tx/<hash>`). Cursor pagination on `(timestamp DESC, id DESC)`. Default page ~25. Throttle like the leaderboard.

### 3. Rebuild `apps/web/app/stats/page.tsx`

- Point it at `GET /api/season/stats` (keep `force-dynamic`).
- **Hero = Transacted Volume.** Remove the `DEPOSITS + SENDS` blended sublabel. **On-ramped** stays its own tile, clearly labeled.
- Add tiles: MAW, retained + retention rate, distinct counterparties, active-this-week, activated %.
- **Live recent-transactions feed**: scrolling list (amount · relative time · masked counterparties · Arbiscan link), with a today / this-week **count ticker** above it, fed by `GET /api/season/transactions`.
- **Score distribution + top senders**: render **only when the API returns them** (post-enable); otherwise hide cleanly — no empty boxes, no errors.
- Keep the daily-volume chart, but make sure its series is **transacted/value-out**, not blended (or label it precisely).
- Match the existing visual system (`panel-frame`, `spec-label`, mono type). Mobile-first (the current page is responsive — keep it).

### 4. Back-compat for the existing `/api/stats` + landing strip

`live-stats.tsx` (landing page) reads `/api/stats` `totalVolume` — which is **blended**. Do **not** break it. Two options, pick the cleaner and note it in the PR:

- (a) Leave `/api/stats` untouched for back-compat; the new page uses `/api/season/stats`. Then **also** update the landing `LiveStats` "VOLUME" to read `transactedVolume` from the new endpoint so the homepage isn't still showing the blended number.
- (b) Add `transactedVolume` + `onboarded` to `/api/stats` (additive, non-breaking) and have both surfaces show the un-blended hero.
  Either way, **no surface should display the blended "deposits+sends" number as a headline after this phase.**

## Flag / staging

- The believable metrics derive from `onchain.transfer` + `#season/definitions` **live** — they work in shadow mode (no `SEASON1_ENABLED`, no projector). Ship them unguarded; they're just honest stats.
- Only `scoreDistribution` / `topSenders` need `season.score` — gate those on data presence, not on a new env flag.
- `SEASON1_ENABLED` remains the gate for the **write path** (projector) only. Phase B adds no new flag.

## Pre-flight check (document it, run before trusting MAW)

Before relying on the strict-floor numbers, confirm no recently-active users are visible **only** via `wallet_aliases` (absent from `phone_registry`):

```sql
SELECT count(*) FROM wallet_aliases wa
WHERE LOWER(wa.address) NOT IN (SELECT LOWER(wallet_address) FROM phone_registry WHERE wallet_address IS NOT NULL)
  AND EXISTS (SELECT 1 FROM onchain.transfer t
              WHERE (LOWER(t."from")=LOWER(wa.address) OR LOWER(t."to")=LOWER(wa.address))
                AND t.timestamp > EXTRACT(EPOCH FROM now())::int - 60*86400);
```

≈0 → the strict floor is safe (the audit decision stands). Nonzero → those rows are either real users to migrate into `phone_registry` or internal addresses correctly excluded; investigate before launch. Put this query + result in the PR description.

## Tests

- Endpoint shape tests for `/api/season/stats` and `/api/season/transactions`.
- **Assert the dashboard imports `#season/definitions`** (MAW/active/retained/distinct are the same functions the grant report calls) — a test that `maw()` is the single code path, not a re-derived SQL query in the controller.
- The un-blend invariant: `transactedVolume` ≠ `onboarded`, and the hero value excludes inflow.
- Tx feed: pagination cursor works; addresses masked; Arbiscan URL well-formed; no phone fields in the payload.
- Graceful empty state: `scoreDistribution`/`topSenders` null → page renders without them.

## Verification (definition of done)

- `npm run typecheck` + lint/prettier pass (backend + web); web build passes.
- **Screenshot the page at desktop and mobile widths** and confirm by eye: hero reads Transacted Volume (not blended), On-ramped is a separate tile, the tx feed renders with working Arbiscan links, and the score tiles are absent (shadow mode) without leaving empty boxes.
- The `wallet_aliases` query is run and its result recorded in the PR.
- Branch `feat/season1-phase-b` off `main`. **Do not commit and do not deploy** — leave that to Mateo (standing rule).

## Out of scope (later phases)

WhatsApp `score` command, the per-user "your score" web page, the public season leaderboard, tiers/perks copy (Phase D); referrals, on-ramp realize, off-ramp emission, the season job, graph/vendor sybil rules (Phase C).

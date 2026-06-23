# Season 1 — Implementation Plan (A→D)

**Status:** Plan for audit · **Date:** 2026-06-23 · Implements `docs/SEASON1_SCORE_SPEC.md`.
**Workflow:** you audit this, then I implement phase by phase.

**Guiding constraint:** _generalize what already exists, don't rebuild._ Sippy already has the on-chain projector pattern, an event-scoped quest + masked leaderboard, and an invite system. Season 1 is the season-long evolution of those.

---

## 0. What we're building

The full season (A→D): a recomputable **usage score** + the **active/MAW/retained** definitions, a **public dashboard**, the **referral + anti-sybil** loop, and the **user-facing** score/tiers/leaderboard — all per the spec. Reputation-only at launch (no redeemable perk until Lina clears the language).

---

## 1. Architecture & reuse map

Backend = AdonisJS (Lucid + raw SQL `query` helper, services, controllers, commands, provider-managed timers). Web = Next 16. On-chain data already flows: indexer/Alchemy webhook → `webhook_controller` → `onchain_writer.service` projects `onchain.transfer` (source of truth) into idempotent aggregates.

| Need                                   | Reuse                                                                                                                                                | Add                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sends / receives / on-ramp inflows     | `onchain.transfer` (raw, source of truth)                                                                                                            | a **score projector** parallel to `onchain_writer`           |
| Public referral links (`/r/<code>`)    | **Quest referral service** — `referral_codes` / `pending_referrals` / `referral_attributions` (self-ref block, pending drain, 1 attribution/referee) | feed attributions into `season.referral`                     |
| Direct WhatsApp invites                | `pending_invites` (+ `invite.service`): invite-by-phone, daily limit, signup completion, retry-safe notify                                           | feed completions into `season.referral`                      |
| Public leaderboard (masked, throttled) | `quest_controller` + `/api/quest/:slug/leaderboard` → `/quest/[slug]`                                                                                | generalize to a **season** leaderboard                       |
| Derived-aggregate discipline           | `onchain_writer` idempotent pattern (insert-then-aggregate, flagged-not-deleted, rebuild fn)                                                         | apply identically to score                                   |
| Periodic jobs                          | `invite.service` retry-timer pattern (provider-managed, `.unref()`)                                                                                  | a **season job** (decay/active-week/retained/pending-expiry) |
| Identity / sybil floor                 | `phone_registry` (phone+WhatsApp+first-send)                                                                                                         | graph rules + flags                                          |
| On-ramp signal                         | `fund` `/api/notify-fund`                                                                                                                            | emit on-ramp score event                                     |
| Off-ramp signal                        | `offramp_controller`                                                                                                                                 | emit off-ramp score event                                    |

Everything lives behind an env guard **`SEASON1_ENABLED`** (mirrors `isPrivyEnabled()` / quest event-slug pattern) so it can't brick the bot if unconfigured.

---

## 2. Data model — new `season` schema

Same raw-SQL migration style as `0012_onchain_tables.ts`. Amounts in raw USDC units `NUMERIC(78,0)` like `onchain.transfer`.

```
season.config            -- one row per season
  id TEXT PK              -- 's1'
  starts_at, ends_at INTEGER
  params JSONB            -- snapshot of §8 tunables at launch (K, V_CAP, caps, windows…)
  status TEXT             -- 'active' | 'closed'

season.score_event       -- APPEND-ONLY, source of truth (idempotent like onchain.transfer)
  id TEXT PK              -- deterministic: e.g. "{txHash}-{logIndex}" or "{verb}:{ref}"
  season_id TEXT
  wallet TEXT            -- lowercase 0x
  verb TEXT              -- send|receive|onramp|onramp_used|offramp|referral_unlock|referral_retained|active_week|first_send
  counterparty TEXT NULL
  usd NUMERIC NULL        -- USD at event time (for volumeBonus)
  tx_hash TEXT NULL
  realized BOOLEAN        -- false for pending on-ramp until used
  pending_until INTEGER NULL
  flagged BOOLEAN DEFAULT false   -- sybil/void: kept, not deleted
  flag_reason TEXT NULL
  meta JSONB
  timestamp INTEGER

season.score             -- DERIVED aggregate (recomputable from score_event)
  wallet TEXT PK
  season_id TEXT
  score INTEGER
  tier TEXT              -- newcomer|activated|active|regular|power
  active_weeks INTEGER
  distinct_counterparties INTEGER
  last_active INTEGER
  dormant BOOLEAN
  updated_at TIMESTAMPTZ

season.referral          -- ONE ledger fed by BOTH referral sources (§6)
  id SERIAL PK
  season_id TEXT
  referrer_wallet TEXT, referee_wallet TEXT
  source TEXT            -- 'quest_code' (referral_attributions) | 'direct_invite' (pending_invites)
  ref_id TEXT NULL       -- referral_attributions.referee_phone OR pending_invites.id, per source
  stage TEXT             -- pending|unlocked|retained|void
  unlocked_at, retained_at INTEGER NULL
  UNIQUE(season_id, referee_wallet)   -- one referrer per referee (mirrors PK on referral_attributions.referee_phone)

season.flag              -- sybil/fraud (flagged not deleted; feeds review queue)
  id SERIAL PK
  subject TEXT           -- wallet | "pairA:pairB" | cluster id
  kind TEXT              -- circular|roundtrip|star|cluster|velocity|vendor
  status TEXT            -- open|confirmed|cleared
  detail JSONB, created_at
```

`season.score`, `season.referral.stage`, tiers, and flags are **all derived** and can be rebuilt from `score_event` + `onchain.transfer` + `referral_attributions` (canonical for public `/r/<code>` links) + `pending_invites` (direct invites) — same guarantee as the existing aggregates.

---

## 3. Compute + definitions (pure, recomputable)

- **`#season/params`** — the §8 tunables (loaded from `season.config.params`, fallback to defaults). Single source of truth.
- **`#season/score`** — pure functions: `base(verb)`, `volumeBonus(usd)= round(min(V_CAP, K*sqrt(usd)))`, `recencyWeight(age)`, caps (per-tx/day/pair/referral), penalties; `computeScore(events, params) → {score, tier, activeWeeks, distinctCounterparties}`. No I/O.
- **`#season/definitions`** — `isActive(wallet, period)` (≥1 _value-out_ — send or off-ramp — of ≥$1 to a **verified counterparty**), `maw(period)`, `isRetained(wallet)`, `distinctVerifiedCounterparties(wallet)`. **The dashboard and the grant report import these — one definition, never two.**
- **`#season/recompute`** — `recompute(wallet?)`: replays `score_event` (+ derives sends/receives from `onchain.transfer`) → rewrites `season.score`. Mirrors `onchain_writer`'s rebuild. Makes the score auditable and explainable ("here's why your score is X").

---

## 4. Instrumentation — where each verb is emitted

| Verb                                    | Emitted from                                                               | Notes                                                             |
| --------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `send`, `receive`, `first_send`         | **score projector** off `onchain.transfer` (same hook as `onchain_writer`) | derived from the source of truth; idempotent on the same `id`     |
| `onramp` (pending)                      | `fund` `/api/notify-fund`                                                  | emits `realized=false`, `pending_until = now+14d`                 |
| `onramp_used` (realize)                 | score projector when those funds are later **sent/off-ramped**             | flips the pending on-ramp to realized; else expires (§season job) |
| `offramp`                               | `offramp_controller`                                                       | high weight; KYC-gated, low sybil risk                            |
| `referral_unlock` / `referral_retained` | `#season/referral` (driven by projector + season job)                      | see §6                                                            |
| `active_week`                           | **season job** (weekly)                                                    | ≥1 qualifying value-out that week                                 |

The projector and `onchain_writer` share the transfer feed; we add the score projection in the same idempotent transaction boundary (or a second consumer of the same event id) so it can't double-count.

---

## 5. Anti-sybil engine (`#season/sybil`)

- **Verified counterparty** resolution (the load-bearing definition): phone-verified + wallet-linked via `phone_registry`, not same phone/device/IP/funding-cluster, not an internal/vendor/operator address (`SIPPY_SPENDER_ADDRESS`, operator wallets). Fail → event written but `flagged=true`, earns 0.
- **Graph rules** over `onchain.transfer`: circular (A→B→A), immediate round-trip, star/funnel (one funder → many), tight reciprocal clusters → `season.flag` + zero out.
- **Velocity/device**: reuse the existing `VELOCITY_WHITELIST` + invite daily-limit infra; per-device/IP earning caps.
- **Delayed realization** is the primary control: on-ramp realizes only on use; referral only on activation/retention; nothing pays on intent.
- **KYC tiering** (existing) gates higher caps; **personhood (Human Passport/Coinbase) only at Power tier**, never base.
- Flags feed an **admin review queue** (extend `moderation_controller`); confirmed flags hold redeemable perks (when those exist) but never block normal sends.

---

## 6. Referral — one `season.referral` ledger, two existing sources (`#season/referral`)

Season 1 does **not** invent referral plumbing. It adds a `season.referral` ledger that records the spec's activation/retention milestones, fed by the two referral paths Sippy already runs:

**Source A — Quest referral codes (canonical for public links `sippy.lat/r/<code>`).** `quest/referral.service` already owns `referral_codes` (one lifetime code per user), `pending_referrals` (survives the onboarding window), and `referral_attributions` (PK on `referee_phone` → exactly **one attribution per referee for life**), plus **self-referral blocking** and the `drainPendingReferral` cascade on onboarding completion. This is the closer match for shareable links and is **canonical**: `referral_attributions` is the system of record for "who referred whom."

**Source B — Direct WhatsApp invites.** `pending_invites` / `invite.service` handles invite-by-phone, the 10/24h daily limit, completion on signup, and retry-safe notifications.

Both already write the _signup_ edge. Season 1 reads whichever attributed the referee and layers the milestones the spec needs (neither system has these today):

```
pending   → referee onboarded (referral_attributions row, OR pending_invites completed)   create season.referral(pending)
unlocked  → referee's first send ≥ $5 to a verified counterparty within 14d               referrer +40, referee +25
retained  → referee still active 30d after unlock                                          referrer +30
void      → sybil / cluster / circular / self-ref                                          no award
```

- **Attribution stays in the existing tables; Season 1 only adds milestones.** `referral_attributions.referee_phone` (or `pending_invites`) is joined to the referee's wallet via `phone_registry`, so the score projector can see "this referee's first qualifying send" and the season job can check 30-day retention.
- **Inherit the existing guards verbatim** — self-referral block, one-attribution-per-referee (PK on `referee_phone`), vendor/exchange exclusion (already filtered in the Quest scoring query). Season 1 does not re-implement them.
- Caps/diminishing per §3 (cap/season, decay after N). Two-sided, paid on stage transition, **never on signup**.
- **Resolved (was open decision #1):** the event Quest's "1 entry per referral" raffle mechanic stays as the **event overlay**; `season.referral` is the **season-long usage ledger**. They share `referral_attributions` as the source of truth but score it differently (Quest = raffle entries at an event; Season = milestone points over the season).
- **Precedence rule (Phase C):** a referee can be reachable through both `referral_attributions` and `pending_invites`. Resolve attribution **`referral_attributions` first, then `pending_invites`** — `/r/<code>` is the canonical public referral path. One `season.referral` row per referee (UNIQUE on `season_id, referee_wallet`); the second source is ignored if the first already attributed.

---

## 7. User-facing surfaces (Phase D)

**The pitch (never show the formula).** Internally the score is an engine; to the user it's "level up by using Sippy." The one-liner, Spanish-first:

> **"Usa Sippy cada semana y subes de nivel. Subes por mandar dólares de verdad, sacar a pesos, y traer amigos que también la usen. No por dejar la plata quieta."**
> _(EN: Use Sippy every week and you level up — by sending real dollars, cashing out to pesos, and bringing friends who actually use it. Not by parking money.)_

The score is the engine; **perks are the carrot.** Tiers must map to concrete utility, not a number on a screen:

| Tier         | Unlock (usage gate, from spec §8)              | Perk — utility only, **no token**                                           |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------------------- |
| **Nuevo**    | signup                                         | base send/off-ramp limits                                                   |
| **Activado** | first real send ≥$1 to a verified counterparty | full limits unlocked · referral link goes live                              |
| **Activo**   | ≥150 + 1 week active                           | higher daily send/off-ramp cap · opt-in to public leaderboard               |
| **Regular**  | ≥600 + 4 weeks + ≥3 counterparties             | **priority off-ramp** (faster COP payout) · lower friction · early features |
| **Power**    | ≥1500 + 8 weeks + personhood/KYC               | highest caps · **priority support** · community status/badge · beta access  |

Every perk is utility/status; anything cash-like or redeemable is **Lina-gated** (§11) and ships _after_ reputation-only launch.

- **WhatsApp (primary):** a `score` / `puntos` / `mi nivel` command in the bot command router → reply with tier, progress to next tier, and the 2–3 actions that get there — **never the raw formula**. Bot-native, Spanish-first.
- **Web "your score":** authenticated page (reuse the JWT/CDP auth middleware) showing breakdown + tier progress.
- **Public season leaderboard:** generalize `quest_controller.publicLeaderboard` + `/quest/[slug]` → `/temporada` (masked phones, IP-throttled, **usage-ranked**, opt-in handles). Never a deposit board.
- **Tiers:** cosmetic/community perks + higher caps; **no token**. Any redeemable perk gated on Lina.

---

## 8. Dashboard (Phase B — the proof asset)

**The un-blend (the core change).** Today the hero KPI is `USDC MOVED` / sublabel `DEPOSITS + SENDS` (`stats/page.tsx` line 125), and its value is `SUM(onchain.daily_volume.total_usdc_volume)` from `public_stats_controller` — a broad sum of **all** indexed transfer volume, deposits and sends mixed together. Change: **stop making blended movement the headline.** Hero becomes **Transacted Volume** — real value-out (sends + off-ramps) by Sippy users. **On-ramped** stays as its own clearly-labeled tile, **never added into the hero.** This is the honesty fix and the believability fix in one.

Extend `apps/web/app/stats/page.tsx` + add `GET /api/season/stats` (public, reuses analytics/quest controller patterns) with the §5 fields, all from `#season/definitions`:

- onboarded · **MAW** · repeat/retained + retention rate · **transacted volume** · **on-ramped (shown separately, never blended into the headline)** · off-ramp completions · distinct counterparties · countries · activated % · active-this-week · score distribution · most-active-senders (sybil-filtered) · active referrals.
- **Live recent-transactions feed** — pull the latest N rows from `onchain.transfer` (the indexer already has them: `amount`, `timestamp`, `tx_hash`, masked `from`/`to`) and render a scrolling list: amount · relative time · masked counterparties · **Arbiscan link per `tx_hash`**. This is the single most credible proof element — real, verifiable, on-chain txs anyone can click through. New `GET /api/season/transactions` (public, paginated, IP-throttled like the leaderboard; phones never exposed — only on-chain addresses, which are already public). A live count ticker (txs today / this week) sits above it.
- Internal: **subsidy efficiency** (gas+reward cost per legitimate $ moved) — the shared metric with the gas plan.

---

## 9. APIs

- `GET /api/season/score` (auth) — user score/tier/breakdown.
- `GET /api/season/leaderboard` (public, throttled, masked).
- `GET /api/season/stats` (public) — dashboard aggregates.
- `GET /api/season/transactions` (public, paginated, throttled) — recent `onchain.transfer` rows for the live feed (masked addresses + Arbiscan links).
- `POST /admin/season/recompute` + `/admin/season/flags` (admin, behind existing admin gates).

---

## 10. Phasing (each small, independently shippable, behind `SEASON1_ENABLED`)

**Phase A — measurement core.** `season` schema migration; score projector off `onchain.transfer`; `#season/{params,score,definitions,recompute}`; backfill from existing transfers; unit tests + a recompute sanity-check vs known totals. _Output: the numbers + grant figures. No user surface._

**Phase B — dashboard.** `GET /api/season/stats` + extend `sippy.lat/stats`. _Output: the public proof asset._ (This is the "stats dashboard" task, merged.)

**Phase C — referrals + anti-sybil.** `season.referral` state machine fed by **both** referral sources (`referral_attributions` + `pending_invites`) joined via `phone_registry`; `#season/sybil` (graph + flags + verified-counterparty); on-ramp pending/realize + off-ramp emission; the **season job** (weekly active-week, decay, dormancy, retained checks, on-ramp 14d expiry). _Output: the live, farm-resistant loop._

**Phase D — user-facing.** WhatsApp `score` command; web "your score"; the public season leaderboard + tiers. **Legal gate (Lina) before any reward/redeemable language — ship reputation-only first.** _Output: the full season._

Dependencies: B needs A; C needs A; D needs A+B+C. C and B can overlap after A.

---

## 11. Rollout, flags, legal

- **`SEASON1_ENABLED`** env guard; score computes silently first (shadow mode) before any surface goes live — verify numbers against the dashboard before exposing scores.
- **Legal (Lina):** reputation-only at launch; no "token/airdrop/points→reward"; confirm any redeemable-perk language against the March-2026 SEC airdrop interpretation **before Phase D copy ships**.
- **Privacy:** leaderboard never exposes phone numbers (reuse masked-phone pattern); opt-in handles only.

---

## 12. Testing

- Unit: `#season/score` (caps, decay, volumeBonus, tiers), `#season/definitions` (active/MAW/retained), referral state transitions, sybil graph rules (circular/star/cluster → 0).
- Integration: replay a fixture transfer set → assert scores; on-ramp pending→realized→expired; referral pending→unlock→retained→void.
- Recompute idempotency: `recompute()` twice = same result; flagged events stay flagged.
- Backfill: run A against current `onchain.transfer`, sanity-check MAW/volume vs `/stats` + the M2 numbers.

---

## 13. Open decisions (resolve before/at Phase C)

1. ~~**Quest ↔ season referral**~~ — **RESOLVED:** Quest stays the event overlay; `season.referral` is the season-long ledger; both share `referral_attributions`. Precedence when both sources point to a referee: `referral_attributions` first, then `pending_invites` (canonical public `/r/<code>` path wins). See §6.
2. **Score projector coupling:** second consumer of the transfer feed vs extend `onchain_writer` in the same txn (idempotency + blast radius).
3. **Counterparty "verified" cluster detection:** how aggressive at launch (false-positive risk on real families sharing a device/IP) — start lenient + review queue, tighten on data.
4. **Personhood provider** at Power tier: Human Passport vs Coinbase verification (or both).
5. **Redeemable perk:** stays out until Lina clears it — confirm Phase D ships reputation-only.

---

## 14. Reuse map (existing code → role in Season 1)

`onchain.transfer` / `onchain_writer.service` → score source + projector pattern · `quest/referral.service` (`referral_codes`/`pending_referrals`/`referral_attributions`) → **canonical referral attribution** (public `/r/<code>` links) · `pending_invites` / `invite.service` → **direct WhatsApp invite** path · both → `season.referral` ledger · `quest_controller` + `/quest/[slug]` → season leaderboard · `phone_registry` → identity/sybil floor + phone→wallet bridge · `offramp_controller` → off-ramp event · `fund /api/notify-fund` → on-ramp event · `moderation_controller` → flag review · `apps/web/app/stats/page.tsx` + `public_stats_controller` → dashboard · provider timer pattern (`invite.service`) → season job · `SIPPY_CURRENT_EVENT_SLUG` guard pattern → `SEASON1_ENABLED`.

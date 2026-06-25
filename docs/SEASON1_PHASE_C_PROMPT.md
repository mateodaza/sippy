# Season 1 — Phase C (the live loop: referrals + anti-sybil + emissions + season job)

You are implementing **Phase C** of Season 1 in the Sippy monorepo. Phases A (measurement core) and B (dashboard) are merged. Branch off `main`.

This is the largest phase and it touches money-adjacent paths (deposits, off-ramps, the webhook). **Implement and PR it as four ordered, independently-green workstreams — C1 → C4 — so each can be audited on its own.** One branch (`feat/season1-phase-c`) is fine, but keep the commits separable. If at any point a workstream gets too large to review, stop and say so.

**One cross-dependency to sequence correctly:** C1's referral _unlock_ enforces a source-of-funds rule that relies on C3's realized-on-ramp (FIFO) accounting. So land **C3's on-ramp balance accounting before — or together with — C1's unlock detection**, even though C1 is listed first. (The rest of C1, the state machine + schema, has no such dependency.)

**The non-negotiable that overrides everything below:** every new write is behind `SEASON1_ENABLED` (default off) and every hook into a money/bot path (notify-fund, off-ramp completion, the webhook) is **best-effort and non-blocking** — it must NEVER throw into, delay materially, or alter the deposit / off-ramp / send path. A failure in season code can lose a score event; it can never lose a user's money or break the bot. Still **reputation-only** — referral "payouts" are score points, not money or token; no redeemable language ships (Lina gate, Phase D).

## Read first (do not skip)

- `docs/SEASON1_IMPLEMENTATION_PLAN.md` §2 (the `season.referral` + `season.flag` schema), §4 (emission points), §5 (sybil), §6 (referral — both sources + the precedence rule), §10 Phase C, §11 (legal).
- `docs/SEASON1_SCORE_SPEC.md` — referral milestones/caps, the verb weights, on-ramp realize window, new-counterparty cap.
- `apps/backend/app/season/*` — everything from Phase A: `params.ts` (the verb enum + caps already include the Phase C verbs and `referral`/`onrampRealizeWindowDays`/`newCounterpartySeasonCap` tunables), `score.ts` (verb-generic `computeScore`), `projector.ts` (idempotent transfer consumer; this is where on-ramp/realize hook in), `definitions.ts` (`verifiedWalletCte()` — the sybil seam, with the Phase C TODO already named in its doc-comment), `recompute.ts`, `guard.ts`.
- `apps/backend/app/services/quest/referral.service.ts` — `referral_attributions` (canonical; PK `referee_phone`, one per referee for life) + `pending_referrals` + `drainPendingReferral`.
- `apps/backend/app/services/invite.service.ts` — `pending_invites` (direct invites; completes on signup) + the **provider-managed retry-timer pattern**.
- `apps/backend/providers/invite_provider.ts` — the exact `boot()` + lazy-import + `.unref()` pattern the season job must mirror.
- `apps/backend/app/controllers/notify_controller.ts` — `POST /notify-fund` (deposit notification; `{phone,type,amount,txHash}`, resolves phone→wallet) — a candidate on-ramp signal.
- `apps/backend/app/controllers/offramp_controller.ts`, `apps/backend/app/models/offramp_order.ts`, `apps/backend/app/jobs/poll_colurs_movements.ts` — find where an off-ramp order transitions to **completed**; that's the `offramp` emission point.
- `apps/backend/app/controllers/admin/moderation_controller.ts` — extend for the flag review queue.
- `apps/backend/app/utils/special_accounts.ts` (`getQuestExcludedPhones()`) and `event_operator_wallets` (migration 0020) — the two exclusion sources.

## Schema (do this first — next available migration number)

Raw-SQL, idempotent, `down()` no-op, same discipline as `0027`. **Use the next FREE migration number — the repo already has `0028_season_score_event_composite_pk.ts`, so this is `0029` (verify the highest existing number before writing; never reuse `0028`).** Create the two tables Phase A deliberately deferred (plan §2):

- `season.referral` — `id SERIAL PK`, `season_id`, `referrer_wallet`, `referee_wallet`, `source TEXT` (`'quest_code'` | `'direct_invite'`), `ref_id TEXT` (the `referral_attributions.referee_phone` or `pending_invites.id`), `stage TEXT` (`pending|unlocked|retained|void`), `unlocked_at`, `retained_at`, `created_at`, `updated_at`, **`UNIQUE(season_id, referee_wallet)`** (one referrer per referee).
- `season.flag` — `id SERIAL PK`, **`season_id TEXT`**, `subject TEXT` (wallet | `"a:b"` pair | cluster id), `kind TEXT` (`circular|roundtrip|star|cluster|velocity|vendor`), `status TEXT` (`open|confirmed|cleared`), `detail JSONB` (**no raw PII — hashed/masked references only**), `created_at`, **`updated_at`, `reviewed_at`, `reviewed_by`**, and **`UNIQUE(season_id, subject, kind)`** so the season job can't create duplicate flags and an admin's confirm/clear is auditable (who + when). Flagged-not-deleted; feeds the review queue.

---

## C1 — Referral state machine (`#season/referral`)

One `season.referral` ledger fed by **both** existing sources, with the **precedence rule settled in the plan**:

- **Attribution precedence: `referral_attributions` FIRST, then `pending_invites`.** A referee reachable through both gets exactly one `season.referral` row (the UNIQUE constraint enforces it); the Quest code path wins because `/r/<code>` is the canonical public link. Resolve referee/referrer **phone → wallet via `phone_registry`** (the join Phase A flagged).
- **Stages** (per spec; pay on transition, never on signup; two-sided):
  - `pending` — referee onboarded (a `referral_attributions` row exists, or a `pending_invites` completed). Create the `season.referral` row.
  - `unlocked` — referee's **first qualifying send ≥ `referral.unlockMinSend` ($5) to a verified counterparty within `referral.unlockWindowDays` (14d)** — **AND that send must be backed by the referee's OWN funds, not the referrer's.** This source-of-funds rule is mandatory (it's in the spec, and without it the program is trivially farmable: a referrer funds the referee $5, the referee bounces $5 back, both sides unlock). Concretely, the qualifying send must satisfy **both**:
    1. its recipient is a verified counterparty that is **NOT the referrer**, and
    2. it draws on the referee's **eligible balance** as defined by C3's eligible-balance ledger (realized on-ramp + non-referrer inbound), **not** on balance the referrer transferred in. If the referee's only inflow traces to the referrer, the unlock does **not** fire.

    Emit `referral_unlock_referrer` (+40) to the referrer and `referral_unlock_referee` (+25) to the referee. **Detected by the projector** (it already sees the referee's first verified send — extend it to check for a pending referral **and** the source-of-funds condition).

  - `retained` — referee still active 30d after unlock (`isRetained`-style). Emit `referral_retained` (+30) to the referrer. **Detected by the season job** (C4).
  - `void` — sybil / circular / self-ref / cluster (from C2). No award; existing referral score events for that pair get `flagged=true`.

- **Caps/decay** (extend `#season/score`, see "score.ts extensions"): `referral.seasonCap` (500/season) and diminishing after `referral.decayAfter` (10) referrals.
- Score events use deterministic ids (e.g. `referral_unlock:{season}:{referee_wallet}`) so a replay/recompute never double-pays.

## C2 — Anti-sybil engine (`#season/sybil`)

- **Extend the verified-counterparty floor at the one seam** (`verifiedWalletCte()` in `definitions.ts` — its doc-comment already names this): add (a) **vendor/exchange exclusion** — resolve `special_accounts.getQuestExcludedPhones()` → wallets via `phone_registry` and exclude them, and (b) keep operator (`event_operator_wallets`) + spender exclusion. Do this **in the CTE** so every metric and the projector inherit it at once — do not fork a second definition.
- **Graph rules over `onchain.transfer`** → write `season.flag` + zero out the offending `score_event`s (set `flagged=true`, `flag_reason`): circular (A→B→A), immediate round-trip, star/funnel (one funder → many fresh wallets), tight reciprocal clusters. Start **lenient + review queue**, tighten on data (open decision #3 in the plan — false positives on real families sharing a device/IP).
- **Velocity/device:** reuse the existing `VELOCITY_WHITELIST` + invite daily-limit infra; per-device/IP earning caps. **Privacy + data-source boundary:** use **existing signals only** — do not introduce new raw identifiers. If a device/IP signal must be persisted, store it **hashed + salted, with a retention limit** — never raw. **Never expose raw phone / IP / device** in any public API or in `season.flag.detail`; flags carry only hashed/masked references.
- **Flags feed an admin review queue** (extend `moderation_controller`): `open → confirmed|cleared`. Confirmed flags withhold (future) redeemable perks but **never block a normal send**.
- **Delayed realization is the primary control** and is already the design (on-ramp realizes on use; referral on activation/retention; nothing pays on intent).

## C3 — On-ramp / off-ramp emission

- **`offramp` (high-value value-out, base 20 + volume bonus, KYC-gated, low sybil risk):** emit one `offramp` score_event when an `offramp_order` **completes**. Hook at the completion transition (find it in `offramp_controller` / `poll_colurs_movements`). Idempotent id `offramp:{order_id}`. Best-effort, guarded, non-blocking. `offramp` is already a value-out + volume-bonus verb in `params.ts`.
- **`onramp` (pending, base 0 — earns nothing until used) → `onramp_used` (base 10 + volume bonus, on realization):**
  - **Emit `onramp` pending** when a verified wallet receives USDC from a **non-verified (external) address** — i.e. a deposit. The projector already records this inflow as a flagged `receive`; extend it to ALSO write an `onramp` pending event (`realized=false`, `pending_until = now + onrampRealizeWindowDays (14d)`). `/notify-fund` may be used as a **corroborating** signal, but the projector-on-chain detection is canonical because not all on-ramps flow through `fund.sippy.lat`. **Surface for audit:** "external→Sippy inflow" can't perfectly distinguish a self-deposit from an inbound P2P payment — note this; it's acceptable because on-ramp earns 0 until _used_.
  - **Realize → `onramp_used`** when that wallet later performs a qualifying value-out (send/off-ramp) within the window. **Define the balance accounting explicitly — do not hand-wave "flip realized":**
    - Track a **`pending_remaining` USD balance per pending on-ramp event**, initialized to the on-ramp amount.
    - On a value-out, **consume pending on-ramps FIFO** (oldest first), realizing `min(pending_remaining, remaining_value_out_usd)` against each pending row until the value-out USD is exhausted or no pending remains.
    - Emit **one `onramp_used` per consumed chunk** with **deterministic id `onramp_used:{pending_event_id}:{valueout_event_id}`** and `usd` = the realized chunk (that's what `volumeBonus` scores). Decrement `pending_remaining`; a row at `pending_remaining = 0` is fully realized.
    - **Partial realization is normal** (a $20 value-out against a $50 pending realizes $20, leaving $30 pending until later used or expired). **Never realize more than was on-ramped** — cap total realized per pending row at its original amount.
  - **Eligible-balance ledger (the source-of-funds primitive C1 depends on — define it here):** maintain, per wallet, a running **eligible balance** = funds from external/on-ramp inflows **and** non-referrer inbound, credited when realized and debited FIFO as the wallet spends. **Balance the referrer directly transferred in is NOT eligible.** C1's referral unlock checks that the referee's qualifying send draws on this eligible bucket, not on referrer-funded balance. (Pending on-ramp FIFO above is the on-ramp slice of this same ledger.) **It is a derived, rebuildable view over `score_event` + `onchain.transfer` history — NOT a separate authoritative money ledger.** Like `season.score`, it must be reconstructable by replay (same recompute discipline); it never holds custody or balances of record.
  - **Expired on-ramp (`void`) maps to concrete `score_event` fields** — not a vague status: a pending on-ramp still carrying `pending_remaining > 0` past `pending_until` is set `realized=false`, `flagged=true`, `flag_reason='expired_onramp'`, with the leftover `pending_remaining` preserved in `meta` (or a side table). Never realized, never earns. The season job (C4) performs this expiry pass.
- **`new_counterparty` (+8, capped):** emit when a wallet sends to a verified counterparty it has never sent to before this season; cap at `newCounterpartySeasonCap` (10/season) — enforced in `#season/score`.

## C4 — Season job (provider + timer)

A new provider mirroring `invite_provider.ts` (`boot()` → lazy-import → start timer → `.unref()`), **guarded by `SEASON1_ENABLED`** so the timer never starts when off. Register it in `adonisrc.ts`. **Singleton guard (required — this job runs heavy score / referral / expiry work, unlike the lightweight invite retry):** wrap each pass in a **Postgres advisory lock** (`pg_try_advisory_lock`) or a DB job-lock row, so on multi-instance / multi-warm-process deploys two processes never run the same pass concurrently. If the lock isn't acquired, **skip the pass** (log and return). Release the lock in a `finally`. The job runs on an interval and:

- **`active_week`** (+15): emit one idempotent event per wallet per qualifying ISO week (id `active_week:{season}:{wallet}:{weekIndex}`) for weeks the wallet had a qualifying value-out. **Do not double-count:** `active_week` is the _points_ reward; `computeScore`'s `activeWeeks` (derived from value-outs, for tier gates) is separate — keep them distinct and make sure a week isn't rewarded twice.
- **Referral `retained`** checks (C1): promote `unlocked → retained` + emit `referral_retained`.
- **On-ramp expiry:** pending `onramp` rows still carrying `pending_remaining > 0` past `pending_until` → expire using the concrete `score_event` field mapping defined in C3 (`realized=false`, `flagged=true`, `flag_reason='expired_onramp'`, leftover `pending_remaining` preserved). Partially-realized rows expire only their unrealized remainder.
- **Decay/dormancy is only "live" if recompute runs:** `computeScore` applies `recencyWeight`/`dormant` against `now`, so a wallet's score only reflects current decay when recomputed. The job must periodically **recompute the active set** (wallets with recent events) and run a **full `rebuildAll`** rarely. Be mindful of cost — recompute the recently-active set frequently, the whole season occasionally.

## `#season/score` extensions (pure, keep it the single scoring authority)

`computeScore` is verb-generic and already scores `onramp_used`/`offramp`/`referral_*`/`active_week` by base+bonus. Add the verb-specific caps the spec defines and Phase A left as seams:

- **Referral season cap** (`referral.seasonCap`) + **diminishing after `referral.decayAfter`** referrals (parallel to the existing per-pair send decay).
- **`new_counterparty` season cap** (`newCounterpartySeasonCap`).
- Confirm `offramp` counts as a value-out (it's in `VALUE_OUT_VERBS`) so it drives active-weeks/retention, and `onramp` (pending) never does.
- Keep all of this **pure and unit-tested** — no I/O in `score.ts`.

## Hard constraints

- **Flag-guarded write path:** nothing writes unless `SEASON1_ENABLED`. The season job timer doesn't even start when off.
- **Money/bot paths are sacred:** the off-ramp hook, the on-ramp/notify hook, and the webhook projector hook are all try/caught, lazy-imported, and non-blocking. A season failure logs and moves on.
- **Idempotent + flagged-not-deleted** everywhere (deterministic event ids; sybil/void flags set, never deleted; recompute reproducible).
- **Reputation-only:** referral awards are score points. No money, no token, no redeemable-perk language. Lina gates Phase D copy.
- **One definition, one seam:** all verified/vendor/operator exclusion stays in `verifiedWalletCte()`; all scoring stays in `#season/score`.

## Tests

- `#season/referral` state transitions: pending→unlocked→retained→void; precedence (`referral_attributions` beats `pending_invites`); one row per referee; two-sided amounts; pay-on-transition-not-signup.
- **Source-of-funds (the must-fix):** the **fund-and-bounce farm does NOT unlock** — referrer funds referee $5, referee sends $5 back (or to any cp) → no unlock, because the send isn't backed by realized-on-ramp/independent funds. A send **to the referrer** never qualifies. A referee who on-ramps independently and then sends $5 to a third verified party **does** unlock.
- `#season/sybil`: circular / round-trip / star / cluster → flagged + zeroed; vendor/operator/spender excluded; a legit family-on-one-device case to tune the false-positive line.
- `#season/score`: referral cap + decay-after-N; new_counterparty cap; onramp(0)→onramp_used(10+bonus); offramp value-out.
- Emissions: off-ramp completion → one idempotent `offramp`; external inflow → `onramp` pending → realize → `onramp_used`; pending expiry → void.
- **On-ramp FIFO accounting:** $20 value-out against a $50 pending realizes exactly $20 and leaves $30 pending; a later $40 value-out realizes the remaining $30 (not $40); **never realizes more than on-ramped**; `onramp_used` ids are deterministic (`onramp_used:{pending}:{valueout}`) so replay/recompute doesn't double-realize.
- **Flag dedup + audit:** the season job re-running does **not** create duplicate `season.flag` rows (UNIQUE `season_id,subject,kind`); confirm/clear stamps `reviewed_at`/`reviewed_by`; no raw PII in `detail`.
- Season job: active_week idempotency (no double-reward per week); retained promotion; decay reflected after recompute.
- Integration: replay a fixture set through projector + job → assert referral payouts, sybil zeroing, and that re-running is idempotent. Confirm every hook is a no-op when `SEASON1_ENABLED` is unset.

## Verification (definition of done)

- Backend `typecheck` + lint/prettier clean; all season tests pass (Phase A/B unaffected).
- Demonstrate end-to-end against a seeded local Postgres (as in Phase B): a referral reaching `unlocked`+`retained`, an off-ramp `offramp` event, an on-ramp `onramp`→`onramp_used`, and a sybil cluster flagged to 0 — with `recompute` reproducing identical scores.
- Confirm with `SEASON1_ENABLED` unset: no timer starts, no hook writes, the bot/deposit/off-ramp paths are byte-for-byte unchanged.
- Branch `feat/season1-phase-c`, four separable commits (C1→C4). **Do not commit final / do not deploy** — leave for Mateo. `SEASON1_ENABLED` stays unset in every env.

## Out of scope (Phase D)

The WhatsApp `score`/`mi nivel` command, the per-user web "your score" page, the public season leaderboard, the tier-perk ladder copy — and **enabling the flag**. Phase C makes the loop _correct in shadow_; Phase D exposes it (after Lina clears reward language).

## Open decisions to surface in the PR (don't silently pick)

1. On-ramp signal: projector on-chain inflow detection (recommended, canonical) vs `/notify-fund` (only covers fund.sippy.lat). Note the self-deposit-vs-inbound-payment ambiguity.
2. Sybil aggressiveness at launch (lenient + review queue recommended; tighten on data).
3. Season-job cadence (active-set recompute frequency vs full rebuild) — pick a default, make it configurable.

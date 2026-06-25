# Season 1 — Stats & UX polish pass (post-smoke-test)

Branch off `main`. This is a focused revision from smoke-testing the **live** dashboard against **real prod data** — the seeded tests never caught it because they had Sippy→Sippy sends, which prod doesn't.

## What the smoke test found (the why)

Against prod (216 verified wallets, healthy floor — NOT a bug): **Sippy→Sippy = $0**, **Sippy→external = ~$10,700** (sends to non-Sippy people + off-ramps), **external→Sippy = ~$11,600** (on-ramps). Sippy is an **on-ramp → spend-out** product, not user-to-user P2P. The strict "verified→verified" dashboard floor therefore zeroes out the entire page (volume, MAW, active, retained, counterparties all 0). The believable proof number — and the grant's "transacted volume" KPI — is the **~$10.7K that verified Sippy users actually sent**, which the current definition throws away.

---

## 1. Backend — redefine the DASHBOARD value-out (the crux)

In `apps/backend/app/season/definitions.ts`, the **network/dashboard aggregates** must switch from "verified→verified" to **value-out by a verified sender to anyone**:

- **New recipient rule for the dashboard metrics:** `from ∈ verified` (the phone-verified sender is the sybil floor) AND `amount ≥ $1` AND recipient is **not** the sender, the **spender**, or an **operator** wallet. Drop the `to ∈ verified` requirement.
- Apply to: `transactedVolume`, `maw`, `activeThisWeek` (the 7d `maw`), `retention`, `dailyTransactedVolume`. These all currently require `to ∈ verified` — that's what's wrong.
- Exclude the **spender** (`SIPPY_SPENDER_ADDRESS`, `0xB396805…fBeb1`) and operators as **recipients** too, not just senders — otherwise spend-permission relay hops inflate the number.

### HARD CONSTRAINT — do NOT touch the score engine

The per-wallet functions used by scoring/referrals **must stay strict (verified counterparty)** — they're the sybil floor for the reputation engine:

- `isActive(wallet, period)` — imported by `#season/referral.ts` (`promoteRetainedReferrals`). Retention/scoring must keep requiring a **verified** counterparty.
- `distinctVerifiedCounterparties(wallet)` — the Regular/Fiel-tier gate in scoring.
- The projector's `counterpartyVerified` logic, `computeScore`, all of `#season/{projector,score,referral,recompute,onramp,emissions}` — **unchanged**.

So this is a **split**, not a global loosen: dashboard network aggregates go loose (value-out, sybil-gated on the sender); per-wallet score functions stay strict. Keep them clearly named and documented so the two never get re-merged. The grant report still reads the same (now-loose) dashboard functions — "one definition for dashboard+grant" still holds; the score engine is its own separate, stricter definition.

**Do not recreate the old blended hero.** Keep value-out as the public headline and keep on-ramped as a separate context tile. Gross facilitated (`value-out + on-ramped`) may be mentioned in private grant/reporting copy as arithmetic context, but it should not become the `/stats` hero and should not be returned as a field that invites the UI to blend deposits and sends again.

**Spender-relay handling (this is what's making the number wobble — get it right).** A send appears on-chain as either `user→recipient` (direct) or `user→spender→recipient` (relayed, two hops). Count each economic send **exactly once**: do **not** drop a relayed send (excluding the spender on _both_ legs erases it), and do **not** double-count the two hops. Inspect the live feed to confirm which pattern Sippy actually uses, and define value-out to capture the user's outflow once. This is the real gap between the ~$9.5K and ~$10.7K readings.

**Do NOT hardcode any figure** — compute and return every number. Prod shifts daily (on-ramp is cumulative) and by ±$1–2K on relay/exclusion handling. The smoke-test figures elsewhere in this doc (~$10.7K / ~$11.6K) are stale placeholders; verify against prod and report the computed values. Sanity floor: value-out > 0 and on-ramped is shown separately, never added into the hero.

## 2. Backend — live feed: filter the spender/operators

In `apps/backend/app/controllers/season_transactions_controller.ts`, exclude any transfer where `from` **or** `to` is the **spender** or an **operator** wallet. (The live page currently double-shows the spender relay: `80d6→b396` then `b396→c363` for one logical $0.1 send.) Each real send should appear once, no spender rows. Optional: also hide sub-$1 dust so the feed reads as real activity.

## 3. Web — `/stats` presentation: show what's worth, drop the zeros

In `apps/web/app/stats/page.tsx`, curate to the believable set and **render a tile only when its value is meaningful (> 0)**:

- **Hero: Transacted Volume / Value-out** — label **"USDC SENT BY SIPPY USERS"**. This is the honest unblended public headline: real money sent/cashed out by verified Sippy users, not deposits plus sends mixed together.
- **Separate context tile: On-ramped** — funds entering Sippy. Keep it visible but never add it into the hero.
- **Keep:** On-ramped, Active Wallets (MAW, now > 0), Active this week, Users, Transfers, Countries.
- **Drop:** "COUNTERPARTIES / DISTINCT VERIFIED PAIRS" (a P2P metric that stays ~0 for this product), and any tile still showing 0 — hide it rather than show a zero.
- The daily chart: keep, but it now plots value-out (will have data); hide it cleanly if still empty.

## 4. Web — app-wide readability (font size up)

The mono/`spec-label` type is too small and light to read comfortably (see `/stats`, `/temporada`). Bump the base readability **app-wide**, not just `/stats`: increase the base font-size and the smallest type steps (`spec-label`, mono captions, tile sublabels). Keep the visual system, just larger. Verify no layout breaks at mobile widths.

## 5. Tier rename (display only — slugs unchanged)

User-facing tier names change to the confirmed ladder; the internal slugs (`newcomer/activated/active/regular/power`) and all thresholds stay exactly as they are.

| slug      | OLD display | NEW display   |
| --------- | ----------- | ------------- |
| newcomer  | Nuevo       | **Nuevo**     |
| activated | Activado    | **En marcha** |
| active    | Activo      | **Activo**    |
| regular   | Regular     | **Fiel**      |
| power     | Power       | **Estrella**  |

- Update the `SEASON_TIER_NAME` map in `apps/backend/app/utils/messages.ts` **and** the web equivalents (`/temporada` `TemporadaContent.tsx`, `/score`, any web i18n tier map).
- Update the per-tier one-line standing copy (`SEASON_TIER_LINE`) to fit the new names (e.g. "En marcha" = "diste tu primer paso", "Fiel" = "usas Sippy semana tras semana", "Estrella" = top). Keep it **reputation-only** — no reward/payout language (the existing language-guard test still must pass).
- Update any tests asserting the old names (`season_score_message.spec.ts` asserts tier strings — `Activo`/`Nuevo` survive, but `Activado`/`Regular`/`Power` references must become `En marcha`/`Fiel`/`Estrella`).

## Tests & verification

- Backend: a definitions test proving the dashboard value-out includes Sippy→external sends and **excludes** spender/operator recipients; and a guard that `isActive`/`distinctVerifiedCounterparties` (score side) are **unchanged** (still verified-counterparty) — the split is the whole point.
- Feed: no spender/operator address appears in the payload; one row per logical send.
- Tier rename: message + web tests updated; language-guard + no-formula tests still green.
- `typecheck` + lint + web build clean; season suite green. Demonstrate value-out ≈ $10.7K, MAW > 0 against prod-shaped seed data.
- Branch `feat/season1-stats-polish`, separable commits. **Do not commit final / do not deploy / do not flip the flag.**

## Out of scope (note, don't do here)

- Flipping `SEASON1_ENABLED` (still the separate go-live + Lina step). The score command will keep showing the empty state until then — that's correct.
- Founder-thread / grant-update number fix (~$11.6K in / ~$10.7K out, not "$24K in sends") — that's a marketing-doc edit, handled separately.

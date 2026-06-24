# Season 1 — Phase D (the user-facing layer)

You are implementing **Phase D** of Season 1: the surfaces that show a user their score and standing. Phases A (measurement), B (dashboard), C (the live loop) are merged. Branch off `main`.

## The gate that shapes this whole phase

Phase D splits in two, and **only D1 ships now:**

- **D1 — reputation-only surfaces (no legal dependency).** Showing someone their score, tier, progress, and a public usage leaderboard is just reflecting data that already exists. No money, no redeemable perk, no "token/airdrop/earn" language. This is the whole of Phase D's build.
- **D2 — redeemable / behavior-changing perks (HELD).** Higher send limits, priority off-ramp, fee reductions, anything a tier _unlocks_. **Do NOT build D2 in this phase.** It needs (a) Lina to clear the reward language and (b) a real product/eng design (changing limits touches the send/off-ramp paths). D2 is a separate, later effort. Leave clearly-marked seams, ship nothing redeemable.

**Language rule across every D1 surface:** describe what the user _did_ and _what raises their standing_ — never "earn," "rewards," "points you can redeem," "token," or "airdrop." Tiers are status/reputation. If a string implies a payout, it's D2 and it doesn't ship. When in doubt, the copy goes to Lina before it ships.

## Read first (do not skip)

- `docs/SEASON1_IMPLEMENTATION_PLAN.md` §7 (user-facing surfaces + the pitch + the tier-perk ladder), §9 (the `/api/season/score` + leaderboard APIs), §11 (legal/Lina gate).
- `apps/backend/app/season/score.ts` + `definitions.ts` — the score/tier/`activeWeeks`/`distinctCounterparties` a user surface reads. **Do not recompute anything here; read `season.score` (and call the existing definitions if you need a fresh signal).**
- `apps/backend/app/season/params.ts` — tier thresholds (`tiers.active/regular/power`), so "progress to next tier" is computed from the same source, never hardcoded.
- `apps/backend/app/controllers/quest_controller.ts` — the existing public leaderboard (`publicLeaderboard`, masked phones, IP-throttled) + `/quest/[slug]`. **Generalize this** into the season leaderboard; don't reinvent the masking/throttle.
- `apps/backend/app/utils/message_parser.ts` + `webhook_controller.ts` — how WhatsApp text commands (`mi codigo`, `ayuda`/`help`) are matched and routed. The `puntos`/`mi nivel` command plugs in here.
- `apps/backend/app/services/quest/referral.service.ts` — `ensureReferralCode` + the `mi codigo` reply, the closest precedent for a bot-native, Spanish-first status reply.
- `apps/web/app/quest/[slug]/page.tsx` + `QuestContent.tsx` — the public masked leaderboard page pattern to mirror for `/temporada`.
- `apps/web/app/wallet/page.tsx` — the authenticated web page + auth pattern to mirror for a per-user "your score" page.

## D1 — build exactly this (all behind `SEASON1_ENABLED`, reputation-only)

### 1. Read APIs

- **`GET /api/season/score` (authenticated)** — the signed-in user's `{ score, tier, activeWeeks, distinctCounterparties, nextTier: {name, scoreToGo, weeksToGo, counterpartiesToGo}, topActions: [...] }`. Read from `season.score`; compute "to next tier" from `params.tiers`. `topActions` = the 2–3 concrete things that raise _this_ user's standing (e.g. "send to one more friend", "cash out to pesos") — **derived, never the formula**.
- **`GET /api/season/leaderboard` (public, IP-throttled, masked)** — usage-ranked (by `score`), masked identities, **opt-in handles only** (default masked). Generalize `quest_controller.publicLeaderboard`. Never a deposit/volume board, never exposes phones.

### 2. WhatsApp command (primary surface, Spanish-first)

- Add a `puntos` / `mi nivel` / `mi puntaje` / `score` command in the message router. Reply (ES default, EN fallback) with: **tier name, one line of progress to the next tier, and the 2–3 next actions** — and a link to the web "your score" page. **Never render the scoring formula, weights, or caps.** Tone: the `mi codigo`/`mi quest` register — warm, plain, no crypto jargon.
- If the user has no score yet (season off / not activated), reply with a friendly "haz tu primer envío para empezar" rather than a zero.

### 3. Web "your score" page (authenticated)

- A per-user page (mirror `wallet/page.tsx` auth) showing tier, progress bar to next tier, the breakdown in **plain language** (sends, cash-outs, friends brought in — not verb/point tables), and the next actions. Read `/api/season/score`. Mobile-first, existing visual system.

### 4. Public season leaderboard `/temporada`

- Generalize `/quest/[slug]` → a season leaderboard page: masked, usage-ranked, opt-in handles, IP-throttled. Links from `/stats`. Clearly a _usage/reputation_ board — no balances, no "rewards."

### 5. Tier display

- Names: **Nuevo · Activado · Activo · Regular · Power** (confirm with Mateo — these are now user-facing). One short, honest line each describing what it reflects (e.g. Activo = "usando Sippy de verdad"). **No perk promises** in D1 — describe standing, not rewards.

## Go-live runbook (this is where the season actually turns on)

Phase D is the first time real users see scores, so it's also the enablement step:

1. Set `SEASON1_ENABLED=true` in **staging** first; run `node ace season:backfill`; confirm the backfilled `season.score` matches the shadow numbers on `/stats`.
2. Verify the WhatsApp command + web page render real, sane values for a few known wallets.
3. Then production: flag on, backfill, spot-check, expose the surfaces.
4. Keep the surfaces **degradation-safe**: if `season.score` is empty (flag still off), every surface shows the friendly empty state, never an error or a zero-leaderboard.

## D2 — HELD (do not build; document the seam)

Tier perks that change product behavior or imply a payout — higher limits, priority off-ramp, fee changes, any redeemable benefit. Leave a clearly-commented seam (e.g. a `tierPerks(tier)` stub returning `[]` with a `// D2 — Lina-gated` note) so D1 ships with no perk surface. Building D2 requires Lina's sign-off on the language **and** a product/eng design for the limit/fee changes — out of scope here.

## Constraints

- **Reputation-only language everywhere** (the rule at the top). Any redeemable/reward phrasing → Lina before it ships, and it's D2 regardless.
- **No formula exposure** — the WhatsApp reply and web page show tier + progress + actions, never weights/caps/decay.
- **Privacy:** leaderboard masks phones (reuse the quest masking), handles are strictly opt-in (default off), throttled. No PII in any payload.
- **Read-only:** D1 never writes score data — it reads `season.score`. All scoring stays in `#season/*`.
- Everything behind `SEASON1_ENABLED`; degrade to friendly empty states when scores aren't present.

## Tests

- `/api/season/score`: tier + "to next tier" computed from `params.tiers` (not hardcoded); empty-state for an unscored wallet; auth required.
- `/api/season/leaderboard`: masked, throttled, opt-in handles only, no phone fields, usage-ranked.
- WhatsApp command: matches the command variants; ES/EN replies; no formula in the output; empty-state copy when unscored.
- Web page + `/temporada`: render from the APIs; empty-state safe; no PII.
- Language guard: a test asserting no D1 surface string contains reward/token/redeem vocabulary (cheap regression against scope creep).

## Verification (DoD)

- Backend + web typecheck / lint / prettier clean; web build passes.
- Screenshots (desktop + mobile) of the web "your score" page and `/temporada`, and a sample WhatsApp reply, confirming: tier + progress + actions, no formula, friendly empty state, masked leaderboard.
- Demonstrated against a seeded local Postgres with `SEASON1_ENABLED=true` + backfill (as in B/C).
- Branch `feat/season1-phase-d`, separable commits. **Do not commit final / do not deploy / do not flip the prod flag** — leave enablement to Mateo (it's the go-live decision, paired with Lina clearance).

## Open product decisions to settle (surface in the PR, don't silently pick)

1. **Tier names** final (Nuevo/Activado/Activo/Regular/Power) and the one-line description for each.
2. **Command words** — `puntos` vs `mi nivel` vs `mi puntaje` (support several aliases; pick the primary for docs).
3. **Leaderboard identity** — masked-only vs opt-in handle; default must be the privacy-preserving one.
4. **Go-live timing** — does the prod flag flip in this phase (after Lina + staging proof) or wait for the founder-thread launch moment?

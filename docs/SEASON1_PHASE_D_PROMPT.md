# Season 1 — Phase D (the user-facing layer)

You are implementing **Phase D** of Season 1: the surfaces that show a user their score and standing. Phases A (measurement), B (dashboard), C (the live loop) are merged. Branch off `main`.

## The gate that shapes this whole phase

Phase D splits in two, and **only D1 ships now:**

- **D1 — reputation-only surfaces (no legal dependency).** Showing someone their score, tier, progress, and a public usage leaderboard is just reflecting data that already exists. No money, no redeemable perk, no "token/airdrop/earn" language. This is the whole of Phase D's build.
- **D2 — redeemable / behavior-changing perks (HELD).** Higher send limits, priority off-ramp, fee reductions, anything a tier _unlocks_. **Do NOT build D2 in this phase.** It needs (a) Lina to clear the reward language and (b) a real product/eng design (changing limits touches the send/off-ramp paths). D2 is a separate, later effort. Leave clearly-marked seams, ship nothing redeemable.

**Language rule across every D1 surface:** describe what the user _did_ and _what raises their standing_ — never "earn," "rewards," "points you can redeem," "token," or "airdrop." Tiers are status/reputation. If a string implies a payout, it's D2 and it doesn't ship. When in doubt, the copy goes to Lina before it ships.

## Read first (do not skip)

> **This prompt OVERRIDES older references in the plan/spec.** `SEASON1_IMPLEMENTATION_PLAN.md` and `SEASON1_SCORE_SPEC.md` still mention opt-in leaderboard handles and tier perks/rewards as the "carrot." Those are superseded here: **D1 builds NO handle fields, NO perk UI, NO limit/fee changes, and NO reward copy.** When the plan/spec and this prompt disagree on handles or perks, this prompt wins.

- `docs/SEASON1_IMPLEMENTATION_PLAN.md` §7 (user-facing surfaces + the pitch + the tier-perk ladder — _note: perks are D2/Lina-gated, not built here_), §9 (the `/api/season/score` + leaderboard APIs), §11 (legal/Lina gate).
- `apps/backend/app/season/score.ts` + `definitions.ts` — the score/tier/`activeWeeks`/`distinctCounterparties` a user surface reads. **Do not recompute anything here; read `season.score` (and call the existing definitions if you need a fresh signal).**
- `apps/backend/app/season/params.ts` — tier thresholds (`tiers.active/regular/power`), so "progress to next tier" is computed from the same source, never hardcoded.
- `apps/backend/app/controllers/quest_controller.ts` — the existing public leaderboard (`publicLeaderboard`, masked phones, IP-throttled) + `/quest/[slug]`. **Generalize this** into the season leaderboard; don't reinvent the masking/throttle.
- `apps/backend/app/utils/message_parser.ts` + `webhook_controller.ts` — how WhatsApp text commands (`mi codigo`, `ayuda`/`help`) are matched and routed. The `puntos`/`mi nivel` command plugs in here.
- `apps/backend/app/services/quest/referral.service.ts` — `ensureReferralCode` + the `mi codigo` reply, the closest precedent for a bot-native, Spanish-first status reply.
- `apps/web/app/quest/[slug]/page.tsx` + `QuestContent.tsx` — the public masked leaderboard page pattern to mirror for `/temporada`.
- `apps/web/app/wallet/page.tsx` — the authenticated web page + auth pattern to mirror for a per-user "your score" page.

## D1 — build exactly this (all behind `SEASON1_ENABLED`, reputation-only)

### 1. Read APIs

- **`GET /api/season/score` (authenticated)** — the signed-in user's `{ score, tier, activeWeeks, distinctCounterparties, nextTier: {...}, topActions: [...] }`. Read from `season.score`; compute "to next tier" from `params.tiers`. `topActions` = the 2–3 concrete things that raise _this_ user's standing (e.g. "send to one more friend", "cash out to pesos") — **derived, never the formula**.
  - **Auth binding (explicit, no input trust):** this route lives in the **JWT-auth `/api` group** (the one that resolves `ctx.cdpUser.phoneNumber`, as in `embedded_wallet_controller.walletStatus`). Resolve the wallet **server-side** from `ctx.cdpUser.phoneNumber` → `phone_registry.wallet_address`. **Never accept a `wallet` or `phone` query/body param** — a user can only read their own score.
  - **Power-tier / KYC caveat (load-bearing):** `params.tiers.power` requires KYC and `computeTier` enforces `hasKyc`, but `recompute` does **not** feed a KYC signal today and `season.score` stores none — so a wallet's stored `tier` can realistically never be `power` yet. In D1, **do not present Power as reachable from score alone.** Compute `nextTier` progress for newcomer→regular from `params.tiers` (score/weeks/counterparties); when the next step is Power, surface KYC as a **separate `verificationRequired` flag sourced from the existing KYC status** (not from `season.score`), or defer Power progress entirely. Do not show a `scoreToGo`-only path to Power that a user can't actually complete.
- **`GET /api/season/leaderboard` (public, IP-throttled)** — usage-ranked (by `score`), **fully anonymous** (decided: max privacy, no handles). The payload row carries an **anonymous `displayId` only** — an HMAC of `wallet + a season salt` (stable per wallet within the season, non-reversible), or a masked wallet if you deliberately accept that tradeoff. **No `phone` key, no handle/name field, no raw wallet.** Reuse `quest_controller.publicLeaderboard`'s ranking/throttle structure but **NOT its identity output** — that precedent returns a `phone` field, which must not appear here. Never a deposit/volume board.

### 2. WhatsApp command (primary surface, Spanish-first)

- Add a score command that matches **all of `puntos` / `mi nivel` / `mi puntaje` / `score` as equal aliases** (decided — no single canonical; any of them triggers the reply) in the message router. Reply (ES default, EN fallback) with: **tier name, one line of progress to the next tier, and the 2–3 next actions** — and a link to the web "your score" page. **Never render the scoring formula, weights, or caps.** Tone: the `mi codigo`/`mi quest` register — warm, plain, no crypto jargon.
- If the user has no score yet (season off / not activated), reply with a friendly "haz tu primer envío para empezar" rather than a zero.

### 3. Web "your score" page (authenticated)

- A per-user page (mirror `wallet/page.tsx` auth) showing tier, progress bar to next tier, the breakdown in **plain language** (sends, cash-outs, friends brought in — not verb/point tables), and the next actions. Read `/api/season/score`. Mobile-first, existing visual system.

### 4. Public season leaderboard `/temporada`

- Generalize `/quest/[slug]` → a season leaderboard page: usage-ranked, **fully anonymous** (rows show the anonymous `displayId` only — never a phone, handle, or raw wallet), IP-throttled. Links from `/stats`. Clearly a _usage/reputation_ board — no balances, no "rewards."

### 5. Tier display

- Names: **Nuevo · En marcha · Activo · Fiel · Estrella** (confirmed — user-facing; internal slugs stay `newcomer/activated/active/regular/power`). One short, honest line each describing what it reflects (e.g. Activo = "usando Sippy de verdad"). **No perk promises** in D1 — describe standing, not rewards.

## Go-live runbook (this is where the season actually turns on)

Phase D is the first time real users see scores, so it's also the enablement step:

1. Set `SEASON1_ENABLED=true` in **staging** first; run `node ace season:backfill` (the command exists at `apps/backend/commands/season_backfill_command.ts`, `commandName = 'season:backfill'` — it's in `commands/`, not `app/commands/`). Equivalent admin path: `POST /admin/season/recompute { rebuild: true }` (`season_controller.recompute`, admin-gated). Confirm the backfilled `season.score` matches the shadow numbers on `/stats`.
2. Verify the WhatsApp command + web page render real, sane values for a few known wallets.
3. Then production: flag on, backfill, spot-check, expose the surfaces.
4. Keep the surfaces **degradation-safe**: if `season.score` is empty (flag still off), every surface shows the friendly empty state, never an error or a zero-leaderboard.

## D2 — HELD (do not build; document the seam)

Tier perks that change product behavior or imply a payout — higher limits, priority off-ramp, fee changes, any redeemable benefit. Leave a clearly-commented seam (e.g. a `tierPerks(tier)` stub returning `[]` with a `// D2 — Lina-gated` note) so D1 ships with no perk surface. Building D2 requires Lina's sign-off on the language **and** a product/eng design for the limit/fee changes — out of scope here.

## Constraints

- **Reputation-only language everywhere** (the rule at the top). Any redeemable/reward phrasing → Lina before it ships, and it's D2 regardless.
- **No formula exposure** — the WhatsApp reply and web page show tier + progress + actions, never weights/caps/decay.
- **Privacy:** leaderboard is **fully anonymous** — it derives **no phone-based identity at all** (the quest masking still emits a `phone` key; do **not** reuse that output). Rows carry only the anonymous `displayId` (HMAC of wallet+season salt) or a masked wallet — no phone, no handle, no raw wallet. Throttled. No PII in any payload.
- **Read-only:** D1 never writes score data — it reads `season.score`. All scoring stays in `#season/*`.
- Everything behind `SEASON1_ENABLED`; degrade to friendly empty states when scores aren't present.

## Tests

- `/api/season/score`: tier + "to next tier" computed from `params.tiers` (not hardcoded); empty-state for an unscored wallet; **auth resolves the wallet from `ctx.cdpUser.phoneNumber` server-side and a `wallet`/`phone` query/body param is ignored/rejected** (can't read someone else's score); **Power step surfaces `verificationRequired`, not a score-only path**.
- `/api/season/leaderboard`: throttled, usage-ranked; **each row's identity is the anonymous `displayId` only — assert no `phone`, no handle/name, and no raw-wallet key in the payload**.
- WhatsApp command: matches the command variants; ES/EN replies; no formula in the output; empty-state copy when unscored.
- Web page + `/temporada`: render from the APIs; empty-state safe; no PII.
- Language guard: a test asserting no D1 surface string contains reward/token/redeem vocabulary (cheap regression against scope creep).

## Verification (DoD)

- Backend + web typecheck / lint / prettier clean; web build passes.
- Screenshots (desktop + mobile) of the web "your score" page and `/temporada`, and a sample WhatsApp reply, confirming: tier + progress + actions, no formula, friendly empty state, anonymous `displayId` leaderboard (no phone/handle/raw wallet).
- Demonstrated against a seeded local Postgres with `SEASON1_ENABLED=true` + backfill (as in B/C).
- Branch `feat/season1-phase-d`, separable commits. **Do not commit final / do not deploy / do not flip the prod flag** — leave enablement to Mateo (it's the go-live decision, paired with Lina clearance).

## Product decisions — SETTLED (build to these)

1. **Tier names:** `Nuevo · En marcha · Activo · Fiel · Estrella` — final, user-facing. Write one short honest standing-line for each.
2. **Command:** all of `puntos` / `mi nivel` / `mi puntaje` / `score` trigger the reply (equal aliases, no single canonical).
3. **Leaderboard identity:** fully anonymous — **anonymous `displayId` only** (HMAC of wallet+season salt, or masked wallet), **no handles, no phone-derived identity** (no opt-in handle feature; no handle/name/phone field anywhere).

## Still open (Mateo's call — does NOT block the build)

4. **Go-live timing** — when the prod `SEASON1_ENABLED` flag flips (after Lina + staging proof, or held for the founder-thread launch moment). Phase D is built flag-off regardless; this is the separate enablement decision.

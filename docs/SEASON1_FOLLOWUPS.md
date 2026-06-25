# Season 1 — Follow-ups & Go-Live

**Status (2026-06-23):** the full A→D code build is merged to `main` and runs in **shadow mode** (`SEASON1_ENABLED` unset everywhere — projector, season job, and all user surfaces are dormant; nothing is visible to users yet). This doc is the backlog that outlives the build thread: the go-live gate, the held D2 work, and the tracked follow-ups from the phase audits.

What's on `main`:

- **A — measurement core:** `season` schema, score projector off `onchain.transfer`, `#season/{params,score,definitions,recompute}`, `season:backfill` command.
- **B — proof dashboard:** `/api/season/stats` + `/api/season/transactions`, the un-blended `/stats` (Transacted Volume hero, On-ramped separate, live tx feed), landing strip un-blended.
- **C — the live loop:** referrals (two sources, `referral_attributions`-precedence, source-of-funds rule), anti-sybil graph + flag review queue, on/off-ramp emission + FIFO realization, the season job (provider + DB job-lock).
- **D1 — user surfaces (reputation-only):** `/api/season/score` (JWT-bound), anonymous `displayId` leaderboard, WhatsApp `puntos`/`mi nivel`/`mi puntaje`/`score` command, web `/score` + `/temporada`, tiers `Nuevo·En marcha·Activo·Fiel·Estrella`.

---

## 1. Go-live (the gate that makes any of this visible)

Nothing reaches users until `SEASON1_ENABLED=true`. Sequence:

1. **Lina clears the reputation-only language** (D1 copy is built to satisfy this — no reward/token/redeem/airdrop vocabulary; the `tierPerks()` seam ships empty). This is the legal gate.
2. **Staging:** set `SEASON1_ENABLED=true`; run `node ace season:backfill`; confirm backfilled `season.score` matches the shadow numbers on `/stats`; spot-check the WhatsApp command + web `/score` for a few known wallets; confirm `/temporada` shows the anonymous board.
3. **Production:** flag on, backfill, spot-check, then the surfaces are live.
4. **Decoupled from the gas migration** — go-live is a flag flip + backfill, independent of the AA work.

**Pre-flight (run once against prod before trusting the strict-floor numbers):** the `wallet_aliases`-only-active query (Phase B prompt §pre-flight). Last run came back ≈0 (2 dormant rows); re-run at launch.

---

## 2. Held by design — D2 (redeemable perks)

Tier perks that change product behavior or imply a payout (higher send limits, priority off-ramp, fee reductions). **Not built.** Flows only through the `tierPerks()` seam in `#season/standing`, which returns `[]` today. Requires (a) Lina's sign-off on reward language and (b) a product/eng design — it touches the send + off-ramp limit/fee paths. Separate, later effort.

---

## 3. Tracked follow-ups (from the phase audits — none blocking, ordered by when they bite)

1. **`FULL_KYC_LEVEL` single-source (small, do before it desyncs).** The _checks_ route through `FULL_KYC_LEVEL` (`colurs_kyc.service.ts`), but the _producers_ still hardcode `5` (`colurs_user.service.ts` ~L380/L390, incl. the `COLURS_KYC_PASSTHROUGH_ALLOWED` branch). Move the constant to a **leaf module with no imports** (e.g. `colurs_kyc.constants.ts`) that both the checks and the producers import — otherwise changing the level silently desyncs the encoders. (The circular import is why it wasn't finished inline.)

2. **Flag-clear re-void window (before D2).** Clearing one sybil flag un-voids the subject's referrals even if another open flag still applies, relying on the next scan (~1 job interval) to re-void. Harmless while reputation-only; close it before D2 attaches anything redeemable — on clear, re-check for other open flags before un-voiding.

3. **Proxy-funded referral residual.** The source-of-funds rule blocks the _attributed referrer_ from funding the referee, but a referrer funding from a _second wallet they control_ (1:1) can still unlock (C2 star/funnel catches one-to-many, not 1:1). Accepted for S1; harden at the personhood/Power layer.

4. **`/score?phone=` link hardening.** The WhatsApp link carries the user's raw phone as a prefill (their own number, their own chat; never an auth key — the API is JWT-bound). Minor privacy smell; pass the `displayId` or a short-lived token instead.

5. **Onramp KYC consolidation (broader).** The `isFullKyc` predicate is now shared, but the onramp gate and the season gate are still conceptually two definitions converging on level 5. Consolidate fully (pairs with #1).

6. **Scale hardening (only matters once the flag is on at volume).**
   - `computeEligibleBalance` folds a referee's full transfer history per qualifying send (bounded by the 14d pending window today).
   - Season job `LOCK_STALE_SECS` (600s) should sit above the worst-case pass duration, or add a heartbeat — a `rebuildAll` on a large season could approach it.
   - `active_week` + active-set passes scan the season each run; window them at scale.

---

## 4. Smoke test (next, before the gas migration)

Confirm the merge is healthy in shadow mode (flag still off — nothing should be live yet):

- `main` typecheck + lint + web build clean; the season test suite green.
- `/stats` renders the un-blended hero (Transacted Volume), On-ramped as its own tile, the live tx feed with working Arbiscan links — all from live `onchain.transfer` (works flag-off).
- `/api/season/score` (authed) and `/api/season/leaderboard` (public) return the **friendly empty state** while the flag is off (`{ scored: false }` / `{ leaderboard: [] }`), never an error.
- WhatsApp `puntos` replies with the "haz tu primer envío" empty state (flag off).
- **Money paths unaffected:** a real send, an on-ramp deposit, and an off-ramp completion behave exactly as before (the season hooks are no-ops with the flag off). The `onramp_controller` KYC refactor is byte-identical behavior — confirm the onramp gate still admits/blocks as before.

---

## 5. Next initiative — Gas refuel → AA migration

Prep already exists: `docs/GAS_PHASE0_FINDINGS.md` (decision: CDP addresses stable → **swap-gas-only**, no wallet migration) and `docs/GAS_MIGRATION_PRIVY_AA.md` (the plan). Phase 0 is done; Phase 1 is the narrow spike (confirm the CDP SDK external-paymaster call on Arbitrum + who pays gas in today's send path) behind an env guard, GasRefuel staying live as fallback. Independent of the Season 1 go-live flag.

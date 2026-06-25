# Gas → AA Migration — Full Phased Plan (for audit)

**Date:** 2026-06-24 · Supersedes `GAS_MIGRATION_PRIVY_AA.md` §6 with the **Phase 0 decision** baked in. Pairs with `GAS_PHASE0_FINDINGS.md`.

## The reframe Phase 0 gave us (read this first)

The original plan flirted with migrating to **Privy + Coinbase Smart Account**. **Phase 0 closed that off:** CDP smart-account addresses are stable, so we **keep the CDP smart accounts exactly as they are and swap only the gas path** — replace the GasRefuel ETH-drip with an **ERC-7677 paymaster on Arbitrum** that sponsors the accounts' UserOps. (CDP's docs: off-Base networks "can use any ERC-7677-compliant paymaster with CDP Smart Accounts.")

What this kills from the original risk surface — **entirely**: no wallet migration, no address change, no balance sweep, no identity/registry migration. The "account-address caveat" is gone. This is a **gas-path swap, not a wallet migration.** "Privy/daebak" is now only the _reference shape_ for the paymaster-proxy + bundler plumbing — **we are not adopting Privy accounts.**

**Two things to nail before building — and the second is the real one:**

1. The exact CDP-SDK call to submit a UserOp from a CDP smart account with an _external_ paymaster on Arbitrum — **and whether CDP accepts a direct paymaster/bundler URL or needs a Sippy-hosted proxy** (don't assume the daebak proxy shape; decide it in the spike).
2. **Which gas paths actually cost money — because "who pays gas" is NOT one answer; the code already runs several lanes.** From the live code: the core WhatsApp/web **free-gas sends** and **off-ramp** run on the **spender** smart account (`embedded_wallet.service` refuels `spenderAccount.address` then `sendUserOperation({ smartAccount: spenderAccount })`; `offramp_controller`). But **registration, setup/permission-creation, direct, and sweep** still burn **user-smart-account** gas via `/api/ensure-gas` → `checkAndRefuel`.

**The architecture rule (this IS the design):** the paymaster sponsors **only actual submitted UserOps** — **never pre-fund a wallet, and no gas on registration.** Registration just binds phone → wallet; the first time the user submits a real op (their `createSpendPermission` at setup) _that_ UserOp is sponsored — and likewise permission update/revoke, direct/sweep (if covered), and the spender's `spend + transfer` / off-ramp. Today's `GasRefuel` does the opposite: it **pre-funds wallets before any op exists** — most wastefully an **auto-refuel at registration** for a wallet that may never transact. That pre-funding _is_ the waste to delete.

**What this means for cost (corrected):** the trailing-30-day read shows **all 15 refuels went to USER wallets, 0 to the spender** — the entire spend is **pre-funding user wallets** (~0.000423 ETH stranded in just those 15; **~0.03748 ETH idle all-time** across all refueled wallets). Sponsoring the **spender** send is ~10% _more_ per-op than its current self-paid gas (Pimlico ×1.1) — **but the spender is one shared, already-active account, not O(N) pre-funded wallets**, so including it is a small premium for **one unified gas system**, not a regression. The **real cost deletion is removing the user-wallet pre-funding** (registration + setup refuels + idle ETH). So we sponsor the spender too — for _simplicity, not savings_ — **not "last because it's wrong."**

---

## Cross-cutting rules (apply to every phase)

- **Env guard `GAS_AA_ENABLED`** (mirrors `isSeason1Enabled()` / `isPrivyEnabled()`): default off; a missing paymaster key can never brick sends.
- **GasRefuel stays live as fallback** through cutover; it's deployed and only _paused_ at the end, kept dormant one cycle for rollback.
- **Paymaster policy must be STRICTER than today's controls (not "replace the allowlist").** GasRefuel in prod is **V1 — no allowlist** (V2-with-allowlist is code-complete but **undeployed**), so the paymaster isn't replacing an allowlist, it's adding the first one. Enforce: **registered-account checks** (only known Sippy smart accounts), **method/call-target allowlists** (only the USDC transfer + permission calls), **per-account/day gas caps**, and a **global budget cap**. Tighter than V1, never equivalent.
- **Don't change gas and authz in the same step** — keep the spend-permission/spender model as-is; session keys (ERC-7715) are a separate, later decision (Phase 6).
- **Money path is sacred — fallback is PRE-BROADCAST ONLY (no double-send).** A sponsorship error falls back to GasRefuel **only if it fails before the UserOp is broadcast** (before a `userOpHash` exists). If a `userOpHash` exists, or the outcome is a timeout/ambiguous, **do NOT retry via GasRefuel** — wait and reconcile on-chain, because the sponsored op may already be landing. Retrying an already-broadcast send is a **duplicate money movement.**

---

## Fallback semantics per lane (the no-regression contract)

Flag-on tries sponsorship first and falls back to today's gas path **only pre-broadcast** (above). Per lane:

- **Setup (`createSpendPermission`):** try `createSpendPermission({ paymasterUrl })`. If sponsorship fails **before broadcast**, call the existing `/api/ensure-gas` for that user account, then retry `createSpendPermission` **unsponsored**. Once broadcast → wait/reconcile, never re-run.
- **Spender send / off-ramp:** try the sponsored spender UserOp. If sponsorship fails **before broadcast**, run the existing `checkAndRefuel(spenderAccount.address)` (`embedded_wallet.service`), then retry the send **unsponsored**. Once a `userOpHash` exists → wait/reconcile, **never re-send** (this is the double-send guard).
- **Direct / sweep:** same shape — sponsored first, else `/api/ensure-gas` + unsponsored retry, **pre-broadcast only**.
- **Registration:** **no fallback** — registration must not touch gas at all (phone→wallet bind only).

This keeps GasRefuel a true legacy fallback, guarantees zero loss of current functionality, and zero duplicate money movement.

---

## Phase 0 — Measure & decide ✅ DONE

Decision: **swap gas path only, keep CDP accounts** (addresses stable). Cost baseline measured from `onchain.refuel_event` (dripped ETH + refuel-tx gas). Arbitrum paymaster providers confirmed: **Pimlico** (bundler+paymaster, single API, policy engine — recommended), **Alchemy Gas Manager**, **Circle** (USDC-native gas). See `GAS_PHASE0_FINDINGS.md`.

## Phase 1 — Spike: inventory the sponsorable UserOps + confirm the SDK (≤1 day, no product code)

**Goal:** map every gas event as _sponsor this submitted UserOp_ vs _delete this pre-funding_, and prove the two representative ops can be paymaster-sponsored. Read-only / throwaway test wallet.
**Deliverables:**

1. **The UserOp inventory:**
   - **Sponsor — user smart account:** `createSpendPermission` at setup; permission **update/revoke**; **direct/sweep** — note `settings/page` sweep calls `ensureGasReady` today, so it **can't be dropped**: either sponsor it or keep it on legacy GasRefuel, never neither.
   - **Sponsor — spender smart account:** the batched `SpendPermissionManager.spend + USDC.transfer` send; off-ramp. (Self-funded today; sponsoring is a ~10% premium — included for one gas system, not savings.)
   - **DELETE pre-funding (not a sponsor lane):** the **registration auto-refuel** (`embedded_wallet_controller` on register) and the `/api/ensure-gas` → `checkAndRefuel` pre-fund. **Registration should just bind phone → wallet — no gas.** Gas happens when the user submits their first real op.
2. **The SDK surface + integration shape** — confirm `sendUserOperation` **and** `createSpendPermission` accept a `paymasterUrl` (local SDK types suggest both do; the React hooks appear to forward the options), the EntryPoint version, and **whether CDP takes a direct paymaster/bundler URL or needs a self-hosted proxy** (decides Phase 2's shape — don't pre-bake `/api/paymaster`).
3. **Prove TWO sponsored ops end-to-end** outside the product flow — and (i) must be the **real regression risk: a fresh user smart account with ZERO ETH and no prior refuel**:
   - **(i)** a brand-new, **zero-ETH** user smart account submits `createSpendPermission` with `paymasterUrl` and it lands **without any registration refuel** — proves a cold-onboarded wallet can act with no pre-funding;
   - **(ii)** a spender smart account batched `spend + USDC.transfer` with `paymasterUrl`.
     **Exit criteria:** the filled inventory, a written SDK + direct-vs-proxy answer, **(i) landing from a fresh zero-ETH account**, and **(ii) landing sponsored.** If either can't be sponsored in practice, **stop and re-plan**.
     **Rollback:** n/a (no product code).

## Phase 2 — Stand up the AA lane + stop pre-funding at registration (2–3 days, behind `GAS_AA_ENABLED`)

**Goal:** the plumbing exists, **registration stops pre-funding**, and the setup UserOp is sponsored on staging — product flow untouched when the flag is off.
**Deliverables:** stand up the integration shape **Phase 1 chose** (direct URLs _or_ a self-hosted `/api/paymaster` + `/api/bundler` proxy), pointed at **Arbitrum One + Pimlico**, keeping **CDP accounts**, behind `isPaymasterEnabled()`. Then the core change: **behind the flag, skip the registration auto-refuel** (registration = phone→wallet bind only) **and sponsor the actual `createSpendPermission` UserOp** at setup — so a new wallet gets gas _when it acts_, never pre-funded. Prove the setup op lands sponsored with **no ETH drip to the user account**. Mirror daebak's landing-wait + error mapping.
**Exit criteria:** on staging, a new user completes setup with a sponsored `createSpendPermission` and zero refuel; with the flag off, registration + every lane is byte-for-byte the GasRefuel path.
**Rollback:** flag off → registration auto-refuels again, nothing changed.

## Phase 3 — Dual-run / canary (1 week, behind the flag)

**Goal:** prove it on real traffic — **including onboarding/setup**, where the pre-funding waste actually lives — without betting the product on it.
**Deliverables:** canary a **small % of real users through the full sponsored flow**: new-user **setup `createSpendPermission`**, permission **update/revoke**, and **sends/off-ramps** — not just transfers. **GasRefuel stays live** for everyone else and as the fallback on any **pre-broadcast** paymaster error; **ambiguous/broadcast ops reconcile on-chain, never re-sent** (per the per-lane contract). Enforce the stricter paymaster policy (registered-account + call-target allowlists + caps). Instrument success rate, latency, and **cost per op** (the subsidy-efficiency metric shared with the season dashboard).
**Exit criteria:** canary success ≥ the GasRefuel path across setup + sends, latency acceptable, cost materially lower, **zero ops lost — pre-broadcast errors fell back cleanly, any ambiguous/broadcast op reconciled on-chain (none double-sent)**.
**Rollback:** shrink the canary % / flag off → all sends back on GasRefuel.

## Phase 4 — Cutover (1–2 days)

**Goal:** **every gas-bearing op** on the paymaster lane (or explicitly left on legacy) — not just transfers.
**Deliverables:** flip to 100% for **setup `createSpendPermission`, permission update/revoke, direct/sweep, free sends, and off-ramps** — each either on the paymaster **or explicitly left on legacy GasRefuel**. **A lane left on legacy keeps GasRefuel live for it — so GasRefuel can only be paused/decommissioned once ZERO lanes remain on legacy** (every user-account `checkAndRefuel` / `/api/ensure-gas` path migrated). When that's true: **pause** GasRefuel (it starts paused) + **stop the poller**, contract dormant one cycle as rollback. Watch the paymaster balance with the same alerting GasRefuel had.
**Exit criteria:** a clean week with **every** gas-bearing op accounted for (sponsored or legacy) and **no unhandled `checkAndRefuel` path** before the pause.
**Rollback:** un-pause GasRefuel + restart poller + flag the lane off (dormant contract makes this a config flip, not a redeploy).

## Phase 5 — Decommission & reclaim (0.5 day)

**Goal:** delete the old machinery, recover capital.
**Hard gate (do not skip):** do **not** delete `refuel.service.ts` or its callers until **every user-account gas lane is sponsored or removed** — registration auto-refuel (`embedded_wallet_controller` on register), `/api/ensure-gas` → `checkAndRefuel`, and direct/sweep. Grep for every caller of `checkAndRefuel` and confirm none remains; deleting the service while onboarding/setup still call it would **break wallet registration**. (This is why the user-refuel lanes are migrated first, in Phases 2–4.)
**Deliverables:** after the clean week and the gate above — `withdraw()` the GasRefuel balance; optionally sweep residual ETH from user wallets if cost-effective; remove `refuel.service.ts` + `gas_refuel_poller.service.ts` + `REFUEL_ADMIN_PRIVATE_KEY` / `REFUEL_CONTRACT_ADDRESS` from env; keep `contracts/gas-refuel/*` in-repo but undeployed; update the runbook.
**Exit criteria:** no caller of `checkAndRefuel` remains, old services gone, env cleaned, cost-savings number recorded.
**Rollback:** none expected post-clean-week; the contract code stays in-repo if ever needed again.

## Phase 6 — Optional, decoupled (later)

Not part of the core migration; each is its own decision:

- **USDC-native gas (Circle paymaster)** — users pay gas in USDC, no ETH anywhere; most on-brand. Evaluate after the core lane is stable.
- **Session keys (ERC-7715)** replacing the spend-permission/spender model — only once the gas path is settled; never combine the authz change with the gas cutover.

---

## Cost model — measured, not assumed

**Trailing-30-day baseline (read-only, from `onchain.refuel_event` + receipts):**

- **15 refuels, all to USER wallets, 0 to the spender.**
- Refuel cost: **0.000792 ETH** (0.000750 dripped + 0.000042 refuel-tx gas).
- **~0.000423 ETH stranded** in just those 15 wallets; **~0.03748 ETH idle all-time** across all refueled wallets (grows O(N) with every onboard).
- Spender-path transfer gas: **0.0001188 ETH**; a Pimlico paymaster (`actualGasCost × 1.1`) would be **0.0001306 ETH** → **sponsoring the spender is ~10% MORE expensive** per op.
- Sponsor the user-account ops + delete refuels: **~0.000149 ETH** vs current transfer-gas + refuel overhead **~0.000928 ETH** → **~0.000778 ETH saved** for the window. (ETH ≈ $1,572 at check.)

**Conclusion (corrected):** the migration pays for itself by **deleting the user-wallet pre-funding** — the drip, the ~300k-gas refuel tx, and the idle ETH (~0.03748 ETH all-time, growing O(N) with onboards). **The spender send is sponsored for one unified gas system at a ~10% per-op premium — simplicity, not savings.** The structural win is the rule "sponsor submitted ops, never pre-fund": the dollar figure is tiny at today's volume, but the pre-fund + idle-ETH + poller burden scales with the volume push. Re-measure against the Phase 3 canary before cutover.

## Open decisions to close in the spike (Phase 1)

1. **Direct external paymaster/bundler URL vs a Sippy-hosted proxy** — Phase 1 decides; don't pre-build the proxy. (The "user vs spender" question is _resolved_ by the architecture rule: sponsor submitted UserOps, delete pre-funding — registration carries no gas, the spender send is sponsored for one gas system.)
2. Pimlico vs Alchemy as the Arbitrum provider (lean Pimlico: single bundler+paymaster API + policy engine; Alchemy if Sippy already uses it for RPC/indexing).
3. Keep spend-permission (yes, for this migration) vs ERC-7715 session keys (defer to Phase 6).

## What gets deleted when done

`refuel.service.ts`, `gas_refuel_poller.service.ts`, `REFUEL_ADMIN_PRIVATE_KEY` / `REFUEL_CONTRACT_ADDRESS` env, the 30-min poller, and the refuel runbook — replaced by one paymaster balance + policy. `contracts/gas-refuel/*` stays in-repo, undeployed.

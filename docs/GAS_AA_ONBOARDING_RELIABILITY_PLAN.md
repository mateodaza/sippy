# Onboarding Reliability Plan — near-zero failures + GasRefuel removal (for audit)

**Goal.** Make new-user onboarding near-zero-failure, and remove the legacy GasRefuel ETH-drip entirely. Two tracks: **A — resilience hardening (ship now)** stops the bleeding and recovers stuck users without waiting on the big build; **B — sponsored onboarding (slice 2)** removes the gas dependency at the root and decommissions GasRefuel.

---

## 1. Baseline (measured, prod)

- **All-time:** 217 registered · 190 completed · **27 stuck** = **87.6%**.
- **Recent (30d):** 15 of 16 = **~94%** — the 27 are mostly historical accumulation; current volume is low (~16/mo).
- **26 of 27 stuck are the gas-pattern** (GasRefuel drip fired, then died at the permission step). **They are recoverable** — the dripped ETH landed *after* the failed attempt, so it's sitting there now.
- Failure is concentrated almost entirely at the **gas → permission handoff**, not the earlier funnel.

## 2. Settled architecture (on-chain proof — closes the slice-2 fork)

Decoded 14 real grants for `0x80d6…948A` on Arbitrum One:

- The spend-permission grant is an **on-chain `approve` UserOp from the user's account** (selector `0x33211c30`), **self-paid** today (`paymasterAndData = 0x`). GasRefuel exists to fund it. The **first** grant carries `initCode` and **deploys the account in the same op as the approve** (~**478k gas**); re-grants ~213k.
- **No gasless grant in the CDP SDK.** `approveWithSignature` exists in the SPM contract but is not exposed by `@coinbase/cdp-core` / `cdp-hooks` / `cdp-api-client@0.0.76` (only `create`/`list`/`revoke`…`WithEndUserAccount`).
- **Deploy can't defer to the first send.** The slice-1 spender op's `sender` is the spender (not the user); `SpendPermission` has no initCode field; `SPM.spend` calls back into `account.execute`, which requires the account already deployed.

⇒ **Onboarding requires a sponsored cold `deploy(initCode) + approve(perm)` op.** Slice 2 sponsors exactly that op **off-CDP** (CDP's own paymaster only sponsors on Base; Sippy runs on Arbitrum). This is the V3-proper path, now confirmed as the only shape that works.

## 3. Failure-point inventory → fix → track

From the end-to-end audit of `setup/page.tsx` + backend (`register-wallet`, `ensure-gas`, `register-permission`, `refuel.service`). "Stuck" = registered + ToS, no permission, undeployed.

| # | Failure | Where | Recoverable today? | Fix | Track |
|---|---|---|---|---|---|
| F1 | Gas race: `createSpendPermission` runs before the drip confirms | `setup:1142-1158` | No auto-retry (`permissionFired` one-shot) | Confirm gas on-chain before grant + bounded auto-retry/resume | **A1** (interim) → eliminated by **B** |
| F9 | Re-register-on-gas-error is fire-and-forget, never retries the permission | `setup:1224-1247` | No | Replace with real confirm+retry (A1) | **A1** → removed by **B** |
| F10 | `register-wallet` returns success even when refuel failed (silent) | `ctrl:144-161` | Surfaces later as F1 | Make refuel failure non-silent / mooted by sponsorship | **A1** → removed by **B** |
| F11 | GasRefuel contract paused / empty / cooldown → **hard dead-end, can't onboard** | `refuel.service:159-170` | No | — | **B** (deletes GasRefuel) |
| F15 | `ensure-gas` 500s (RPC/provider) | `ctrl:455-513` | Manual reload | — | **B** mitigated (onboarding stops calling it); endpoint removed only at **B4** (settings/sweep keep it until then) |
| F2 | `createSpendPermission` throws (deploy/CDP/RPC), opaque "Failed to create permission" | `setup:1152-1158` | One-shot, deterministic recurrence | Bounded retry + real error surface; sponsorship removes the gas cause | **A1/A4** + **B (partial)** |
| F3/F4 | **register-permission indexing race** — permission on-chain but `listSpendPermissions` not indexed → 400; one 5s retry; DB ends with **no hash** | `ctrl:269-303` | Reload-only adoption (`setup:638-651`) | Real backoff retry + run on-chain **adoption inline**, not just on reload | **A3** (survives B — orthogonal) |
| F7 | **Silent-logout still in onboarding page** — setup's own recovery clears a valid token after 3 attempts (guard fix never mirrored here) | `setup:506-524` | Re-OTP, loses progress | Mirror the `useSessionGuard` retry-before-clear into setup recovery | **A2** |
| F5 | CDP auth 401 before `evmSmartAccounts` propagates | `cdpmw:76-79` | Manual reload | Retry/backoff on the propagation race | **A** (orthogonal) |
| F6 | CDP async wallet-creation 30s timeout | `setup:879-893` | Re-OTP | Gate on `useIsInitialized`/`useIsSignedIn`, longer/again | **A** (orthogonal) |
| F8 | JWT expiry mid-flow can orphan a signed permission | `setup:692/1166` | Reload (may strand) | Refresh-before-grant; faster sponsored flow shrinks the window | **A** + **B (partial)** |
| F-addr | Address casing mismatch — `phone_registry.wallet_address` checksummed vs `refuel_event."user"` lowercase; any case-sensitive lookup silently misses | backend | — | Normalize address comparisons (`lower()`) everywhere | **A** |
| — | **Structural: no auto-resume** — `permissionFired` ref + fire-and-forget means *any* transient blip dead-ends until manual reload | `setup:376-382, 1224` | No | A bounded retry/resume state machine across the permission step | **A1** (the multiplier fix) |

**Read:** removing GasRefuel (B) eliminates F1/F9/F10/F11/F15. **F3/F4, F7, F5, F6, F8 are orthogonal and survive B** — they need Track A regardless. The structural "no auto-resume" is the multiplier that turns every transient into a permanent stuck user.

## 4. Track A — resilience hardening (ship now, independent of slice 2)

Frontend + light backend; low-risk; recovers the 26 and stops new failures before B lands.

- **A1 — Confirm-gas + idempotent auto-resume (interim, superseded by B).** Before `createSpendPermission`, confirm the smart-account ETH is actually on-chain (poll balance to threshold, not just `ensure-gas` optimism). On a gas-looking failure, bounded auto-retry the permission step instead of the fire-and-forget re-register. **Idempotency rail (required):** every resume/retry must *first* run adoption — check for an existing valid on-chain permission (`listSpendPermissions` / register-existing) and register it if present; only call `createSpendPermission` when **no** valid permission exists. Without this, a retry after "grant landed but `register-permission`/indexing failed" creates a **duplicate `approve` op** (wasted gas + a second permission). Kills the F1 race and self-heals safely.
- **A2 — Mirror the guard fix into setup (F7).** Port `useSessionGuard`'s retry-before-clear into setup's own mount recovery (`setup:506-524`) so a valid token isn't nuked mid-onboarding. *Permanent — survives B.*
- **A3 — Harden register-permission (F3/F4).** Real backoff retry on the indexing lag, and run the on-chain **adoption** path (recover an existing permission) **inline**, not only on a fresh reload. *Permanent — survives B.*
- **A4 — Diagnosable errors, two layers.** Internally, log the full provider/CDP/RPC cause + a stable error **code** so failures are measurable. To the **user**, surface only the stable code + human copy — never raw provider/CDP/RPC details. Replaces today's opaque `errCreatePermission`/`errRegisterPermission`. *Permanent.*
- **A5 — Recover the existing 27 (classifier RAN 2026-06-26, read-only; recovery = nudge + manual, no bulk writes).** A read-only classifier (DB session pinned `read_only`, on-chain `isValid` + `wallet==account` checks, per-wallet gas balance) bucketed the 27:
  - **0 auto-adopt** — nothing was cleanly, unambiguously adoptable. **The silent-adopt DB write-path is therefore dropped as the default** — no bulk auto-write, and the [P1] adoption-safety-rails surface goes with it.
  - **18 clean → nudge (only after A2/A3 ship).** 16 `finish-setup` (gas-ready), 1 `refuel-then-setup` (0 ETH → drip first or it re-strands), 1 `tos-nudge`. Nudge into the *hardened* flow so re-runs don't re-hit F3/F4/F7.
  - **8 manual batch (not a product flow).** 6 `verify-email+tos` — the **closed pre-fix $500 cohort** (onboarded before `UNVERIFIED_DAILY_LIMIT_USDC='50'`; hold an unusable $500 perm; **5 have no `user_preferences` row** → guided re-entry, not a settings toggle); 1 `disambiguate` (2 perms → `ctrl:305` null-limit fallback risk); 1 `re-setup` (CDP-listed but `isValid=false` on-chain). Handle by hand.
  - **1 excluded — Pascal (`+4915121090333`), personal handling only.**
  - **Banked lever:** `SpendPermissionManager.revokeAsSpender(permission)` exists (no CDP SDK helper → hand-encoded from the Sippy spender, staging-tested) — kept as a manual/admin tool to clear a stale perm if ever needed, **not** a built flow.

  Artifacts: `classify_recovery.mjs` (gitignored spike dir, re-runnable as the list works down); audit CSV at a scratch path (PII, uncommitted).
- **A6 — Normalize address casing** in backend gas/permission lookups (the checksummed-vs-lowercase smell). *Permanent.*

**Track A exit:** recent success rate from ~94% toward ~99%+, 27 stuck driven to near-zero, no dead-ends (every step retries/resumes).

## 5. Track B — sponsored onboarding (slice 2): remove GasRefuel at the root

Sponsor the confirmed cold op so onboarding needs **zero** user ETH; then decommission GasRefuel.

- **B1 — Build the cold `deploy + approve` op off-CDP** (the decoded shape, ~478k gas, but Pimlico-sponsored instead of self-paid): `toCoinbaseSmartAccount({ owners: [userEOA, SPM] })` for `initCode` + `executeBatch([approve(self-built SpendPermission struct)])` + **browser-sign** with the user's owner EOA (`useSignEvmHash`, V2(b) proven) + Pimlico bundler + the existing **DB-binding webhook**, extended with a `setup` lane. It **cannot** go through `createSpendPermission` (CDP paymaster is Base-only).
- **B2 — Banked implementation requirements** (do not lose): webhook `setup`-lane with its **own** Pimlico policy, binding the prepared row (paymaster money path — be explicit) to: **authenticated user · `sender == phone_registry.wallet_address` · `initCode == Coinbase factory createAccount([userEOA, SPM], 0)` · callData exactly `approve(SpendPermission)` · `permission.account == sender` · Sippy spender · USDC · allowance ≤ tier cap · nonce · calls hash · expiry · no extra calls · no ETH value**, with a negative test for each binding; `OffCdpSubmitter` is a **real refactor** to *prepare → browser-sign → backend-submit* (slice 1 signs server-side); preserve `register-wallet` side-effects but **remove only the refuel under the flag** and **never re-register as a refuel fallback**; gate the browser step on the **two CDP races** (`useIsInitialized` for "SDK not initialized"; wait on `useIsSignedIn` for "not authenticated after auth"); **Pimlico per-op cap must clear ~478k gas** (bigger than the ~240k free-send); settings/sweep stay legacy until a later slice.
- **B3 — Validation (staging Part B style).** Real new-user onboard lands **sponsored** (account 0 ETH, no drip); **zero-GasRefuel invariant** measured as a delta (no new `refuel_event`, `gas_refuel_status` unchanged, no `ensure-gas` call); confirm the orthogonal failures are still covered by Track A; one genuinely **frontend-onboarded** user in the run (V2(b) was on a `createEndUser` subject). Throwaway subjects only; mint minimally (shared CDP project, no delete).
- **B4 — Decommission GasRefuel** once every gas lane is sponsored (grep all `checkAndRefuel`/`ensure-gas` callers) + a clean canary. That's the true "GasRefuel gone" end state.

## 6. Sequencing & ownership

1. **Now:** A2, A3, A4, A6 (permanent hardening) + A1 (interim, idempotent race fix). **Then** run A5 recovery: nudge the clean **18** into the now-hardened flow, and work the **8**-user manual batch by hand (Pascal personal). The classifier already ran (0 auto-adopt → no bulk writes). → immediate reliability + stuck-user recovery.
2. **Then:** B1–B3 (sponsored onboarding) behind `GAS_AA_ONBOARD_ENABLED` (default off) → staging validation → prod canary.
3. **Finally:** B4 decommission GasRefuel.

**Rollback differs by track.** Track B is flag-based (`GAS_AA_ONBOARD_ENABLED` off → legacy GasRefuel onboarding), and GasRefuel stays the pre-broadcast fallback through B until B4. **Track A is not flag-reversible** — A5 writes DB state + sends nudges, and A2/A3/A4/A6 are flagless code changes; its safety comes from **dry-run, idempotency, the audit CSV, and small deploy slices**, not a switch.

## 7. Open items for audit

- **Pimlico cap** for the ~478k cold op (gas + per-op $ cap) — confirm the policy clears it before the canary.
- **Real-frontend-user sign** — V2(b) passed on a `createEndUser` subject (browser-only-signable, valid proxy); B3 should include one real frontend-onboarded user to close the last inch.
- **Test-user supply** — shared CDP project, `createEndUser` writes permanent users with no delete; mint minimally, never touch real users (e.g. `+4915121090333` = Pascal).
- **A1 vs B overlap** — A1's gas-confirm is interim (superseded by B); A2/A3/A4/A6 + the auto-resume are permanent and handle the orthogonal failures that B does not.

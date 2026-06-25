# Gas → AA — Slice 2 cold-onboard: V1–V4 verification spike (CC task)

**SPIKE ONLY — no product code, no prod flag changes, no prod writes, no implementation.** (Staging-only `GAS_AA_ENABLED=true` + the test harness are allowed — see Constraints; V4 needs them.) This decides **option A** (sponsor cold onboarding, zero GasRefuel drip) vs **plan B** (legacy-first-deploy only), AND de-risks the **end-to-end** — *sponsored setup → a registerable permission → a working first send* — before we write any implementation prompt. Read `docs/GAS_AA_SLICE2_ONBOARD_PLAN.md` first.

**Why V1/V2 alone aren't enough (the audit point).** Convergence + owner-readability prove we *can* build the user's `initCode` and sign — but onboarding's value is a *usable wallet*, which depends on the sponsored setup producing a spend permission the backend can **find, store, and use for a first send**. Today that permission is created by CDP's `useCreateSpendPermission` (`apps/web/app/setup/page.tsx:1152`) and recovered/registered via `/api/register-permission` + CDP indexing (`apps/backend/app/controllers/embedded_wallet_controller.ts ~:211/:244`). **V3/V4 prove the sponsored path reproduces that — they're make-or-break.**

## V1 — convergence for real USER accounts (read-only, backend)

For 2–3 **real app-onboarded staging users** (incl. `0x80d69a5A96274881b13ad93caa0c48081498948a`, the user from the §2 send): read the account's **owner count + full owner list** on Arbitrum One (**not** just `ownerAtIndex(0)`); derive `toCoinbaseSmartAccount({ owners, version:'1.1' })` (viem 2.47.2, **no** address override) with the **full owner list** — single-owner ⇒ `[owner]`, multi-owner ⇒ all of them (deriving from index 0 alone would false-pass/fail a multi-owner account); assert derived == the real address. **Pass = converges ⇒ the user's deploy `initCode` is reconstructable** (public factory + owner(s), default salt).

> **✅ V1 RAN 2026-06-25** (`apps/backend/scripts/spike/offcdp/gate_user_convergence.ts`, 9/9 accounts): every sampled user wallet is a **2-owner** public-factory v1.1 account — `derive([userEOA, SPM])` converges exactly, `derive([userEOA])` diverges. `owner[1]` is the **constant** SpendPermissionManager `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` (`config.ts:21`); `owner[0]` is the per-user EOA. Banked initCode is in V3 step 0. Full table: `GAS_AA_SLICE2_V1V2_FINDINGS.md`.

## V2 — owner readable pre-deploy + a working browser signer (frontend, acceptance test)

- (a) Confirm the app can obtain the user's **owner EOA address before deploy** (counterfactual) via `@coinbase/cdp-hooks`.
- (b) **Do NOT assume `useSignEvmHash` exists** — find whatever browser hash-signing primitive `cdp-hooks` exposes **in this checkout**, and prove it: sign a userOpHash in the browser, ECDSA-recover the signer, confirm the recovered signer is the **hook-returned owner** and is **in the account's full owner list** (from V1) — not hard-coded to index 0. **Report the exact API.**

**Pass = owner readable pre-deploy AND a confirmed browser signer that recovers to a real owner of the account.** (If no usable browser signer → the prepare→browser-sign→submit architecture is blocked; report.)

> **◐ V2 PARTIAL 2026-06-25 (inspection only).** (a) owner EOA pre-deploy = `currentUser.evmAccounts[0]` (cdp-core `User.evmAccounts`), already read at `setup/page.tsx:530` before deploy. (b) candidate browser signer found **by type inspection**: `useSignEvmHash({ evmAccount: EvmAddress, hash: Hex }) → { signature }` (cdp-hooks 0.0.76) — but it is **NOT yet wired** in this checkout (setup uses `useCreateSpendPermission`, not this), so the **runtime sign→ECDSA-recover→owner-in-list proof still has to run**. Treat V2 as open until that runtime proof lands.

## V3 — sponsored setup creates a REGISTERABLE permission (staging, the crux)

**V3 step 0 — pre-deploy address convergence (HARD GATE) + the banked initCode.** Run this *before* building anything; it decides whether we can deploy to the right address at all.

- **Banked initCode (from V1):** factory `0xba5ed110efdba3d005bfc882d75358acbbb85842` + `createAccount([ userEOA, SPM ], 0)` (selector `0x3ffba36f`, salt 0), where `userEOA = currentUser.evmAccounts[0]` (per-user, pre-deploy) and `SPM = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad` (the **constant** SpendPermissionManager — `owner[1]` on every sampled wallet, `config.ts:21`). So the deploy is reconstructable from one per-user value; the second owner ships as a constant. `toCoinbaseSmartAccount({ owners:[userEOA, SPM], version:'1.1' }).getFactoryArgs()` reproduces it.
- **HARD GATE — counterfactual convergence on a FRESH user.** V1 only proved the address of *already-deployed* wallets; cold-onboard targets a **counterfactual** one. On a brand-new staging user (not yet deployed), assert `derive([evmAccounts[0], SPM]) == cdp-hooks' evmSmartAccounts[0]` (the address CDP will deploy to) **before any deploy**. If they diverge — e.g. CDP adds the SPM owner at grant-time rather than baking it into the deploy initCode — our sponsored deploy lands the wallet at a **different address than CDP expects → broken onboard (funds/identity at the wrong address).** This is the make-or-break of "deploy to the right address," **not** a re-check; **fail ⇒ plan B**, stop-and-report.

> **✅ V3 step-0 RESOLVED 2026-06-25 — closed by on-chain inference, no fresh-user capture needed.** CREATE2 fixes an account's address at deploy from its initCode hash; a post-deploy `addOwner` can't move it. The **session-fresh** §2 account `0x80d69a5A…948a` sits at `derive([EOA, SPM])@0` (re-derived independently, viem 2.47.2) and **not** at the single-owner control `derive([EOA])@0` (`0xF6A2…ccc1`) — direct proof SPM is in the **deploy initCode**, not bolted on at grant-time (the exact failure mode this gate existed to catch). `enableSpendPermissions: true` is set in the CDP provider from login (`apps/web/app/providers/cdp-provider.tsx`), so CDP bakes SPM from account creation ⇒ a fresh user's `evmSmartAccounts[0]` = `derive([EOA, SPM])@0` = where our self-built initCode lands. The only thing inference can't *directly* observe — a fresh user's *pre-permission* `evmSmartAccounts[0]` — folds into V3-proper for free (it reads `evmSmartAccounts[0]` before deploying); **keep the assert above as a cheap pre-deploy guard there.** This gate no longer blocks slice 2; V3-proper + V4 are what remain. Repro: `apps/backend/scripts/spike/offcdp/gate_v3_step0.ts`.

**V3a — first, capture the exact permission shape (do NOT invent an ABI).** From a real `useCreateSpendPermission` setup (`setup/page.tsx:1152`) and/or what `/api/register-permission` recovers (`embedded_wallet_controller.ts ~:211/:244`), capture the **exact** permission-creation primitive + the calldata / permission fields the current path uses. Build the sponsored op to **match that exact shape**, never a hand-written ABI.

**Precondition:** use a test user with a **`phone_registry` row + ToS accepted** — `/api/register-permission` enforces ToS server-side (`embedded_wallet_controller.ts:190`), so an unregistered / un-ToS'd user yields a **false negative**.

Then build the cold setup op **off-CDP**: `initCode` (public factory + the user's owner) + the spend-permission grant, **sponsored** via Pimlico, **browser-signed** (V2 primitive), **backend-submitted**. Then confirm the resulting permission is one **`/api/register-permission` can find, store, and index** — i.e. the sponsored path produces the **same permission shape** the current `useCreateSpendPermission` path produces (same hash/identifier the backend recovers today).

**Make-or-break: if the sponsored setup yields a permission the backend can't recover/register, option A doesn't work end-to-end even if V1+V2 pass.** Pass = sponsored setup → a permission registered exactly like today. **Stop-and-report on failure** (reopens A vs B).

## V4 — first send works from that permission (staging, end-to-end)

Using the V3 permission, run a real **spender free-send** (the slice-1 path, already in prod) for that user. **Pass = a user onboarded entirely sponsored (zero GasRefuel) can send** — the loop closed.

**Zero-GasRefuel invariant (V3 + V4 — the actual promise; prove it, don't assume).** Across the whole sponsored onboard, assert ALL of: the **user account ETH stays 0** (checked before/after every op); **no `refuel_event` / admin-EOA drip** to that account; **`gas_refuel_status` total unchanged**; **no `/api/ensure-gas` call** and **no re-`/api/register-wallet` refuel** on the happy path. A sponsored op landing is **not** sufficient — GasRefuel must be demonstrably **untouched**.

## Constraints + output

Spike/throwaway on **staging**, tiny/no funds, **prod read-only**, **no product-code change. No PROD flag changes** — but **staging-only `GAS_AA_ENABLED=true` + the `gas_aa_test_send` harness ARE allowed** (V4's real send needs the flag on in staging; the harness refuses AA when the flag is off — `gas_aa_test_send.ts:87`). Output a findings note (append to the slice-2 plan or a new doc): V1 (convergence), V2 (owner + the **exact** signing API), V3 (registerable? — make-or-break), V4 (first send works) → **verdict: option A buildable end-to-end / plan B / blocked.** Only after V1–V4 resolve do we write the implementation prompt.

---

## Banked for the implementation prompt (NOT this spike — from the audit)

When the spike passes and we write the implementation prompt, it must include (don't lose these):

1. **Webhook is free-send-only today** (`webhook_pimlico_controller.ts:192/:204` reject non-`spend+transfer` and non-spender senders; `config.ts:23` lane is only `'free_send'`). Implementation needs a **lane-dispatched `setup` decoder + policy** (user-account sender, deploy/permission call targets) with its own **negative tests** — not "same webhook."
2. **`OffCdpSubmitter` extension is a real refactor**, not reuse: slice 1 signs internally with the backend CDP owner (`off_cdp_submitter.ts:507`); onboarding needs **prepare → browser signs → backend submits**.
3. **Explicit happy-path rewiring** of registration + setup: registration auto-refuels (`embedded_wallet_controller.ts:142`), setup always calls `/api/ensure-gas` first (`setup/page.tsx:1142`) and **re-calls `/api/register-wallet` to refuel again on gas-looking errors** (`setup/page.tsx:1222`). The prompt must say: **preserve registration side-effects, remove only the refuel under the flag, and never use re-registration as a refuel fallback.**
4. **Settings/sweep stay legacy** in onboarding-only scope (`settings/page.tsx:584/:778` still call `ensureGasReady`) → `/api/ensure-gas` **cannot be deleted** and GasRefuel is **not "gone"** until a later slice covers those + a decommission step.

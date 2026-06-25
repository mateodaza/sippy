# Gas → AA — Slice 2: sponsor onboarding (remove GasRefuel from the happy path) — for audit

**Goal.** Make a new user's onboarding gas **sponsored** (zero GasRefuel drip on the happy path), so registration + setup stop depending on the GasRefuel ETH-drip — the lane that produced a user-facing bug. This is "**option A**" from the Phase 2 plan, and the path toward "**AA for all gas, GasRefuel decommissioned.**"

**What slice 1 did / didn't touch.** Slice 1 sponsored only the **spender free-send** behind `GAS_AA_ENABLED`. Onboarding is **unchanged** — `embedded_wallet_controller.registerWallet` still drips via `checkAndRefuel` (`:146`), `/api/ensure-gas` still drips (`:490`), and the web setup page's `createSpendPermission` still deploys the user account + grants the permission, gas-dripped. This slice is what changes that.

**The unlock (why this is buildable now).** The §2.0 gate proved CDP smart accounts are **public-factory-derivable** at the owner-derived address (convergence). If that holds for *user* accounts too, we can **construct the user's deploy `initCode` ourselves** (public factory + the user's owner) and sponsor their **first op** (the op1-style cold deploy the gate already landed at 0 ETH) — no GasRefuel pre-fund needed.

---

> **Rev 1 (audit, 2026-06-25):** the gate is **expanded to V1–V4** and moved to **`GAS_AA_SLICE2_SPIKE_PROMPT.md`** (the CC-ready spike). V1/V2 only prove we *can* build initCode + sign; **V3** proves the *sponsored* setup yields a permission `/api/register-permission` can register, and **V4** proves a first send works from it — the actual onboarding value. Two premises here are corrected: **`useSignEvmHash` is NOT assumed** (it's a V2 acceptance test — find the real `cdp-hooks` primitive in-checkout), and **"reuse `OffCdpSubmitter`" is a real refactor** (prepare → *browser* signs → backend submits; slice 1 signs with the backend CDP owner). The webhook is **free-send-only today** and needs a `setup`-lane decoder/policy. **Spike first (V1–V4); the implementation prompt comes only after** — its banked requirements live at the bottom of the spike doc. §1–§5 below are the directional shape, now gated behind that spike.

## 0 · The gate — V1–V4 verification gate (run FIRST; full gate in `GAS_AA_SLICE2_SPIKE_PROMPT.md`)

Read-only / throwaway, against **real staging user accounts** (not the spender). **The full gate is V1–V4** — V1/V2 are summarized here; **V3** ("sponsored setup → registerable permission") and **V4** ("first send works, GasRefuel untouched") live in the spike doc and are the make-or-break. If **any of V1–V4** fails, option A isn't available end-to-end → fall to plan B (below).

- **V1 — convergence for a *user* account.** Does a `@coinbase/cdp-hooks`-created user smart account's address equal `toCoinbaseSmartAccount({ owners, version: '1.1' })`'s derivation of its owner? The spender + a throwaway converged; user accounts are created via a different (frontend) path, so this needs its own confirmation. **Convergence ⇒ the salt is the public-factory default ⇒ `initCode` is reconstructable** (factory + `createAccount(owners, 0)`).
- **V2 — owner readable pre-deploy.** Can we read a **counterfactual** (not-yet-deployed) user account's **owner address** before it's on-chain? (`ownerAtIndex(0)` only exists once deployed; pre-deploy it must come from `cdp-hooks`.) Needed to build the `initCode` *and* to know who signs.

**All of V1–V4 pass → option A is real (end-to-end).** Any fails → **plan B:** leave only the *first deploy* on legacy GasRefuel (one drip per new user, the named `legacy-first-deploy` path) and sponsor everything after — still removes the registration auto-refuel and the recurring drips, just not the single deploy op.

## 1 · Architecture (reuse slice 1's engine, extended)

Reuse `OffCdpSubmitter` + the `gas_aa_prepared_user_ops` ledger + the DB-binding webhook, extended for the user-account lanes:

- **Backend-orchestrated, frontend signs.** The user account is frontend (`cdp-hooks`). The backend builds the UserOp (with self-constructed `initCode` for the cold deploy + the setup callData), authorizes a prepared-op row (lane `setup`), fetches Pimlico sponsorship; the **frontend produces the owner signature** over the userOpHash via **the browser signing primitive discovered in V2** (not assumed — found in-checkout); the backend submits off-CDP via the Pimlico bundler. Keeps the Pimlico key + 4337 stack server-side, one codebase.
- **The webhook gates it** the same way — a `setup`-lane prepared-op row bound by `chain_id + entry_point + sender(=user account) + sender_nonce + calls_hash + decoded_user + cap_bucket`. (Note: for the user lanes the `sender` *is* the user, so the spender-decode path doesn't apply — the allowlist binds on the user account + the setup/permission call targets.)
- **The failure envelope from R5/R6 carries over** — pre-broadcast failure (incl. authorize, incl. a bad `initCode`) → legacy; post-`prepared` → idempotent rebroadcast only; `markFailed`/`markLanded` best-effort. A cold-deploy that can't be sponsored degrades to the legacy drip, never a hard fail.

## 2 · Lanes in scope

1. **Setup `createSpendPermission` (row ①) → sponsor the cold first op.** Build deploy(`initCode`) + the permission-grant in one sponsored UserOp; account at 0 ETH. (Confirm whether the gas is the **deploy**, the **permission grant**, or both — if the grant is an EIP-712 signature, only the deploy needs sponsoring.)
2. **Registration auto-refuel (row ⑥) → delete.** Registration becomes phone→wallet bind only; no gas on register.
3. **`/api/ensure-gas` (row ⑦) → fallback-only**, then deletable once every user lane is sponsored.
4. **(Decision) settings update/revoke + direct/sweep (rows ②③)** — same backend-orchestrated shape, accounts already deployed (the simpler op2 case). **Bundle into this slice, or a fast follow-on?** They're not onboarding, so I'd lean follow-on unless you want "AA for all" in one shot.

## 3 · Flag, fallback, decommission

- **New sub-flag `GAS_AA_ONBOARD_ENABLED`** (separate from `GAS_AA_ENABLED`) so onboarding sponsorship rolls out independently of the now-validated spender lane. Default off.
- **GasRefuel stays live as the pre-broadcast fallback** through this slice — so the morning's bug is **routed around on the happy path** (new users get sponsored, not dripped), but GasRefuel isn't *deleted* yet. Full removal is the **decommission** step, gated on: every gas lane sponsored (grep all `checkAndRefuel` callers) + a clean canary. That's the true "GasRefuel gone" end state.

## 4 · Validation (staging-first, mirrors Part B)

- Run the **V1–V4 spike** (`GAS_AA_SLICE2_SPIKE_PROMPT.md`) on real staging user accounts first.
- A real **new-user onboarding on staging**: register (no drip), setup `createSpendPermission` lands **sponsored** (account 0 ETH, no refuel), then a send works. Webhook returns `sponsor:true` for the `setup` row.
- Negatives/safety: webhook rejects an unauthorized setup op; forced pre-broadcast sponsorship failure → legacy drip fallback, account deploys, no double-deploy; flag-off ⇒ unchanged GasRefuel onboarding.
- Then prod canary, watch the first real onboards (sponsored, 0 ETH, no drip).

## 5 · Open decisions (audit these)

1. **Bug urgency** — does this morning's GasRefuel bug need an interim hotfix in parallel, or is the slice the fix? (Slice is multi-day.)
2. **Scope** — onboarding-only (rows ①⑥⑦), or include the deployed user lanes (rows ②③) for "AA for all" in one slice?
3. **Plan A vs B** — decided by **V1–V4** (see the spike); if convergence/owner/registerable-permission/first-send don't all hold, ship plan B (legacy-first-deploy only) and pursue A via a CDP ask.

---

## Implementation requirements (from the audit — for the post-spike prompt; do NOT lose)

These refine §1–§4 and **must** be in the implementation prompt once V1–V4 pass (also mirrored at the bottom of `GAS_AA_SLICE2_SPIKE_PROMPT.md` for CC's context):

1. **Webhook needs a `setup` lane.** It's free-send-only today (`webhook_pimlico_controller.ts:192/:204` reject non-`spend+transfer` and non-spender senders; `config.ts:23` lane is only `'free_send'`). Add a **lane-dispatched setup decoder + policy** (user-account sender, deploy/permission call targets) with its **own negative tests**.
2. **`OffCdpSubmitter` extension is a refactor, not reuse.** Slice 1 signs with the backend CDP owner (`off_cdp_submitter.ts:507`); onboarding is **prepare → browser signs → backend submits**.
3. **Explicit registration/setup happy-path rewiring.** Preserve registration side-effects (`embedded_wallet_controller.ts:142`), remove **only** the refuel under the flag, and **never** use re-`/api/register-wallet` as a refuel fallback (`setup/page.tsx:1222` does today on gas-looking errors).
4. **Settings/sweep stay legacy** in onboarding-only scope (`settings/page.tsx:584/:778` still call `ensureGasReady`) → `/api/ensure-gas` **can't be deleted** and GasRefuel is **not "gone"** until a later slice + a decommission step.

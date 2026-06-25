# Gas → AA — Phase 2 Plan (off-CDP submission) — for audit

**Date:** 2026-06-24 · Supersedes the **mechanism** of Phases 2–5 in `GAS_AA_MIGRATION_PHASES.md` (which assumed a one-line CDP `paymasterUrl` swap). Grounded in `GAS_PHASE1_FINDINGS.md` — the gate **passed on Arbitrum One mainnet** via off-CDP submission. The architecture rule, the delete-the-pre-funding cost case, and the pre-broadcast double-send guard from the old plan still hold.

**Rev 2 (audit pass):** folded in the P1s — the webhook **decodes the underlying user** on spender ops, the `userOpHash` is **persisted before broadcast**, a **CDP-created-account proof** gates §2.0, and cold-onboard (B) is a **named `legacy-first-deploy` primary path** (not the fallback, with the decommission consequence stated). Frontend signing downgraded to an acceptance test (`useSignEvmHash` exists).

**Rev 3 (audit pass 2):** the submitter targets the **stored CDP address** (not public-factory derivation; fail-closed on divergence); a **`gas_aa_prepared_user_ops` ledger** DB-binds every sponsored op (the webhook authorizes against the row, not calldata alone); **"never re-send" = never a new/legacy op, but idempotent rebroadcast of the _identical_ signed op is allowed** (closes the crash-after-prepare gap); **off-ramp split onto its own flag** behind free-send. Audit decisions resolved — see bottom.

**Rev 4 (pre-handoff reconciliation):** the **exact** webhook + concurrency mechanics live in **`GAS_AA_PHASE2_CC_PROMPT.md` (authoritative for implementation)**; mirrored here so this doc isn't behind it: (1) the webhook match key is **`chain_id + entry_point + sender + sender_nonce + decoded_user + calls_hash + cap_bucket + not-expired`** (the `sender_nonce` disambiguates repeated identical sends); (2) the webhook is **authenticated** via `@pimlico/webhook` over the **raw body** (`PIMLICO_WEBHOOK_SECRET`) — unsigned/invalid rejected before any DB work; (3) the shared spender requires **per-`(chain_id, entry_point, sender)` nonce-lock serialization**, plus a **partial-unique index on active rows** over `(chain_id, entry_point, sender, sender_nonce)` and a unique `user_op_hash`; (4) a verified **`finalized`** event is DB-bound by `user_op_hash + chain_id + entry_point` (unknown hash = no-op).

## What Phase 1 settled (the ground we build on)

- **Off-CDP submission works on mainnet.** A CDP-key-owned Coinbase Smart Wallet validated a CDP-signed UserOp **built, sponsored, and submitted entirely outside CDP** (viem + Pimlico; CDP used only to `sign()`). Op2 (deployed account, no initCode) is the production shape — verified on-chain (tx `0xf8c043a9…`, EntryPoint v0.6, account at 0 ETH).
- **Keep CDP accounts + addresses. Privy is out.** No sweep, no migration.
- **The deployed fleet is ready today.** All 216 user wallets + the spender are deployed standard ECDSA Coinbase Smart Wallets → the op2 shape applies directly.
- **One genuine open fork: cold-onboard first op.** CDP exposes no initCode/factory/salt, so a brand-new wallet's _first_ op can't be deployed off-CDP. This is the only thing not already proven (§2.3).
- **The lanes** (`GAS_PHASE1_FINDINGS.md` Deliverable 1): ① setup `createSpendPermission` (user, frontend, **cold**), ② permission update/revoke (user, frontend, deployed), ③ direct/sweep (user, frontend, deployed), ④ spender `spend+transfer` free sends (backend, deployed), ⑤ off-ramp (backend, deployed), ⑥ registration auto-refuel (**delete**), ⑦ `/api/ensure-gas` pre-fund (**delete**).

## The architecture — one shared off-CDP submit module

A single `OffCdpSubmitter` that every sponsored lane calls. For a given account + call(s):

0. **Authorize first.** After the app's own velocity/security checks pass, write a **`gas_aa_prepared_user_ops`** row (lane, semantic action id, `sender`, **decoded user** (`permission.account` for spender ops), **calls hash**, cap bucket, expiry, status `authorized`). Nothing downstream — not the build, not the webhook — sponsors anything without a matching row. This DB binding (not just calldata decoding) is what stops a well-formed-but-unauthorized op from drawing on the paymaster directly.
1. **Build** the v0.6 UserOp with viem `toCoinbaseSmartAccount`, **passing the STORED CDP smart-account address** (from `phone_registry` for users / spender config for the spender) as `toCoinbaseSmartAccount({ address, owner, … })`. **Do NOT let viem derive the address from the owner via the public factory** — the spike did exactly that, but CDP's address comes from CDP's factory+salt, not the public one, so derivation would target the wrong (often non-existent) account. **Fail closed if the configured address and the library's default derivation diverge.** The custom owner **delegates signing to the CDP owner** (`owner.sign({ hash })` — proven ECDSA, recovers to the owner).
2. **Resolve initCode** from the deterministic deploy-state source (§constraint 2) — deployed ⇒ no initCode; new ⇒ cold-onboard path (§2.3).
3. **Gas price** from Pimlico (`pimlico_getUserOperationGasPrice`).
4. **Sponsor** via Pimlico **with `sponsorshipPolicyId` in the paymaster context** (never the spike's empty context); the webhook matches the request against the `authorized` prepared-op row.
5. **Sign** the userOpHash via the CDP owner. **Persist the FULL signed UserOp + `userOpHash` onto the prepared-op row (status `prepared`) BEFORE `eth_sendUserOperation`** — store enough to reconstruct the _exact same_ hash after a crash.
6. **Submit** via the Pimlico bundler; **wait + reconcile** on the receipt; map EntryPoint errors; mark the row `landed`/`failed`.

**Fallback (pre-broadcast only):** if any step fails **before the op is persisted at status `prepared`**, fall back to CDP's own unsponsored `sendUserOperation` + the existing `checkAndRefuel` / `/api/ensure-gas`. **Once `prepared` (signed op + hash stored), the lane is committed to that exact op — never rebuild, never fall back to a different stack, never produce a new hash.** On timeout/ambiguity: **query the bundler/EntryPoint by the stored `userOpHash`** — if found (pending or mined), wait/reconcile; **if found nowhere, idempotently rebroadcast the _same_ signed UserOp** (same hash — the EntryPoint dedupes a duplicate, so it cannot double-spend), which closes the crash-after-prepare-before-bundler gap. **"Never re-send" means never a new/legacy op — not "never an idempotent rebroadcast of the identical one."** The guard lives inside `OffCdpSubmitter`, across _both_ submission stacks.

## Non-negotiable constraints (your five, made concrete)

1. **Pimlico policy + call-target allowlist BEFORE any real traffic.**
   - Sponsorship policy (dashboard): **Enabled Chains = Arbitrum One (42161)**, per-account/day cap, global budget cap. Pass its `sponsorshipPolicyId`.
   - **DB-bound allowlist** via a **Pimlico sponsorship-policy webhook** → our endpoint sponsors **only** an op it can match to a DB-authorized prepared op. **Authoritative check = DB binding, not decoding alone:** sponsor only if the request matches an `authorized`/`prepared` `gas_aa_prepared_user_ops` row by `chain_id` + `entry_point` + `sender` + **`sender_nonce`** + **decoded user** + **calls hash** + cap bucket + not-expired (the `sender_nonce` disambiguates repeated identical sends; the webhook is authenticated and `finalized` events are DB-bound — see **Rev 4** + the CC prompt). **A well-formed op with no matching row is rejected** — this is what stops direct paymaster abuse (decoding alone can't: an attacker can craft valid-looking calldata). **Decoding is still required** to derive the matched fields: **for spender ops (④⑤) the `sender` is ALWAYS the spender**, so decode the batched `SpendPermissionManager.spend(permission, amount)` + paired `USDC.transfer` and bind on `permission.account` (the real user) — `permission.account` ∈ registered users, `permission.spender` == the Sippy spender, token == USDC, recipient ∈ allowed, amount within the **per-`permission.account`** cap (never per-`sender`). For user ops (①②③): sender ∈ known Sippy accounts + callData ∈ {`createSpendPermission`/`revoke`, `USDC.transfer` to permitted recipients}. Dashboard policies hold the global/per-key caps; the webhook does the per-user DB-match + decode. (GasRefuel V1 has _no_ allowlist — this is the first one.)
2. **Deterministic deployed-vs-counterfactual detection.** Source of truth = **our DB deploy record + the bundler/paymaster RPC view**, never a lagging public node (that's what produced the spike's `AA10` / propagation hiccups). Seed the record: the 216 existing wallets + spender are **known-deployed**. A new wallet is `deployed:false` until its first op **receipt** confirms deployment, then flipped. The "needs initCode?" decision reads only this record.
3. **Deployed fleet + spender on off-CDP submission** — this phase (§2.1, §2.2).
4. **Cold-onboard first deploy is the explicit fork** — decided this phase (§2.3).
5. **Pre-broadcast-only fallback, non-negotiable** — built into `OffCdpSubmitter` (above); no lane bypasses it.

**Env guard `GAS_AA_ENABLED`** (default off). **GasRefuel stays live** as the fallback all through Phase 2; nothing is paused here. Staging before prod. The money path is sacred.

## Deliverables & lane order

### 2.0 — Foundation: the `OffCdpSubmitter` + prepared-op ledger + policy + webhook + deploy-state record

Build: the shared `OffCdpSubmitter`; the **`gas_aa_prepared_user_ops` ledger** (authorize → prepared → landed/failed lifecycle, §architecture steps 0 + 5); the Pimlico sponsorship policy; the **DB-binding allowlist webhook**; the deterministic deploy-state source of truth; and the pre-broadcast fallback + idempotent-rebroadcast reconcile. Reference the spike scripts (`apps/backend/scripts/spike/offcdp/`) for the proven viem + CDP-owner wiring, **but replace the spike's owner-derived public-factory account with the stored-address path** (architecture step 1). Unit/integration-test on Arbitrum **Sepolia** (free sponsorship) before any mainnet wiring.

**Acceptance gate before any production lane (P1):** Phase 1's op2 landed on a wallet deployed via the _public_ `CoinbaseSmartWalletFactory` — Step 1 confirmed prod wallets share the same impl + EIP-712 domain, but the _land_ wasn't on a CDP-created account. **Before replacing any live path, land one policy-enabled sponsored op from a throwaway account created through CDP's own creation path** (real CDP factory/impl — ideally a throwaway taken through the current app onboarding), **explicitly exercising the stored-address override** (`toCoinbaseSmartAccount({ address })` targeting the CDP-assigned address, with the fail-closed divergence check) — proving off-CDP submission validates against a genuinely CDP-created account at its CDP address, not the public-factory derivation. Harmless self-call / no-op; never the real spender or user funds. Only after this lands do we wire §2.1.

### 2.1 — Spender lanes FIRST (rows ④⑤ — backend, deployed, highest volume)

Both lanes go through the same `OffCdpSubmitter`, but **roll out under separate flags/canaries — free sends FIRST, off-ramp AFTER** sponsored-send receipts + reconciliation are proven on real traffic. Off-ramp is the higher-value, harder-to-reconcile path (cash-out), so it must not ride the very first canary: free sends behind **`GAS_AA_ENABLED`**, off-ramp behind a **separate flag** flipped only once free-send has a clean reconciliation record. The spender is backend-controlled, **already deployed**, ECDSA owner (all proven in Phase 1) — the cleanest exercise of the entire machine (policy, DB-bound webhook, deterministic deploy-state trivially-true, pre-broadcast fallback) on the **highest-volume** lane, with **no frontend and no cold-onboard** in the way. Under the flag, the sponsored path replaces `checkAndRefuel(spender)`; the fallback retains it pre-broadcast.

> **Open decision (cost):** the spender **self-pays** today (0 refuels to it in 30d). Sponsoring it adds Pimlico's ~10% (~$0.0004/op — negligible in absolute terms) but means **no ETH to manage anywhere** (one gas system). Recommend: **sponsor it.** Leaving it self-pay keeps a perpetual ETH-topup chore for marginal per-op savings.

### 2.2 — Deployed user-account lanes (rows ②③ — settings update/revoke, sweep)

Existing users, accounts already deployed → the op2 shape. The frontend signing primitive **exists** — `@coinbase/cdp-hooks` exposes `useSignEvmHash` (`node_modules/@coinbase/cdp-hooks/dist/types/index.d.ts`) — so this is no longer an open risk but an **acceptance test:** in the browser, sign a UserOp hash with the user's owner, recover the owner address, and confirm the **backend-wrapped** signature lands on a deployed test account. Architecture: **backend-orchestrated** — the frontend produces only the owner signature over the userOpHash; the backend builds + sponsors + submits via `OffCdpSubmitter`, keeping the Pimlico key + 4337 stack **server-side** (one codebase, reuses §2.1). Under the flag, `/api/ensure-gas` for these (deployed) lanes becomes fallback-only.

### 2.3 — The cold-onboard fork (row ① setup) + kill the registration pre-fund (rows ⑥⑦)

A new wallet's first `createSpendPermission` needs initCode, which CDP doesn't expose. **Decide:**

- **(A) CDP exposes initCode/deploy data** (support ask to Coinbase) → the first op is fully sponsored, registration carries **zero** gas. Cleanest end state, but **gated on CDP**.
- **(B) First deploy runs a _named_ `legacy-first-deploy` path** — when setup sees `deployed=false`, it deliberately routes that one op through GasRefuel (drip + deploy), then flips `deployed=true`. **Every op after is off-CDP sponsored.** Ships with **no CDP dependency**; deletes the O(N) idle pre-fund down to a single deploy-op per new wallet.

> **Recommendation: ship (B) now, pursue (A) in parallel as cleanup.**
>
> **(B) is a named PRIMARY path, not the fallback** (this resolves the `/api/ensure-gas` contradiction): `legacy-first-deploy` is a deliberate, named code path gated strictly on `deployed=false`, **distinct from** the pre-broadcast fallback. **Only `deployed=true` accounts take the sponsored setup/update/sweep lanes.** So `/api/ensure-gas` is "fallback-only" **for the deployed lanes**, while the cold first op intentionally uses the legacy drip via its own named path.
>
> **Row ⑥ (registration auto-refuel) dies this phase** regardless — registration becomes phone→wallet bind only.
>
> **Consequence to admit (your judgment call):** under (B), **GasRefuel cannot be fully decommissioned** until either CDP exposes initCode (A) or the `legacy-first-deploy` path is otherwise removed. Phase 5 decommission is therefore blocked on **closing the cold-deploy fork**, not just on migrating the recurring lanes.

## Exit criteria

- **CDP-created-account proof (§2.0 gate) landed** — one sponsored op on a real CDP-created account at its **CDP-assigned address** (stored-address override exercised) before any live lane was touched.
- **Prepared-op binding enforced:** the webhook sponsors only requests matching an `authorized`/`prepared` `gas_aa_prepared_user_ops` row; a valid-looking op with **no row is rejected** (negative test).
- **Staging:** spender **free-send** lands sponsored through `OffCdpSubmitter` with policy caps + the **decoded, DB-bound, per-`permission.account`** webhook enforced; **off-ramp held behind its own flag** until free-send reconciliation is clean; **flag off ⇒ byte-identical legacy** on every lane.
- Deployed user lanes (②③) land sponsored (the `useSignEvmHash` acceptance test passed) **or** are explicitly held with reason.
- Cold-onboard fork **decided**; **registration auto-refuel (⑥) deleted**; the cold first op runs the named `legacy-first-deploy` path (deployed=false only); `/api/ensure-gas` is fallback-only for the deployed lanes.
- **Safety proofs:** a forced pre-broadcast sponsorship failure falls back cleanly with **no double-send**; a **`prepared` op + simulated post-broadcast crash → idempotent rebroadcast of the SAME signed op (same hash), never a new/legacy op**; the webhook **rejects** an unregistered decoded `permission.account`, a non-allowlisted recipient, an over-cap op, and an unmatched (no-row) op.

## Rollback

`GAS_AA_ENABLED` off → every lane reverts to CDP submission + GasRefuel. GasRefuel never paused in this phase, so rollback is a flag flip, not a redeploy.

## Deferred to Phase 3+ (unchanged in shape from `GAS_AA_MIGRATION_PHASES.md`)

Canary on real traffic (incl. cold-onboard setup), full cutover of any remaining legacy lane, then **GasRefuel pause + decommission** — hard-gated on **zero lanes left on legacy** (grep every `checkAndRefuel` caller first). **Under cold-onboard (B), the `legacy-first-deploy` path keeps GasRefuel alive — so decommission is blocked until the fork closes via (A) or that path is removed.**

## Decisions (resolved in audit, 2026-06-24)

1. **Cold-onboard fork → B-now-A-later.** Ship the named `legacy-first-deploy` path; pursue CDP-exposes-initCode (A) in parallel; decommission stays blocked while the legacy path exists.
2. **Spender → sponsor it** (one gas system; ~$0.0004/op premium accepted). This is what §2.1 does.
3. **Frontend signing → backend-orchestrated** (frontend signs via `useSignEvmHash`, backend submits); confirm via the §2.2 acceptance test.
4. **Docs → cherry-pick the cleaned findings + this plan onto `main` as canonical; keep scratch scripts off `main`** (they stay on `spike/gas-phase1`).

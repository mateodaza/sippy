# Gas → AA — Phase 2, slice 1 (§2.0 + §2.1 free-send) — CC implementation task

**This is real product code, behind a flag, staging-first.** Scope is **strictly** the foundation + the spender **free-send** lane. **Out of scope (do NOT touch):** off-ramp, user-account lanes (setup/update/sweep), cold-onboard / `legacy-first-deploy`, registration-refuel deletion, GasRefuel decommission. Those are later slices.

**Read first:** `docs/GAS_AA_PHASE2_PLAN.md` (the audited plan — this slice implements §2.0 and the free-send half of §2.1, under its constraints), `docs/GAS_PHASE1_FINDINGS.md` (why off-CDP, the proven shape), and the spike scripts `apps/backend/scripts/spike/offcdp/` (proven viem + CDP-owner wiring — reuse the mechanics, **not** the public-factory account derivation).

## Build in this order (each gates the next)

### 1. The CDP-created-account acceptance gate (PROVE BEFORE WIRING ANYTHING LIVE)

A throwaway script (spike-style, not product) that:

- Creates a throwaway account through **CDP's own creation path** (real CDP factory/impl), ideally via the same call the app uses to onboard a wallet.
- Builds + signs + sponsors + submits one **harmless self-call / no-op** off-CDP (viem + Pimlico), **passing the account's stored CDP address** into `toCoinbaseSmartAccount({ address, owner, … })` — exercising the **stored-address override + fail-closed divergence check** (architecture step 1), not owner-derived public-factory address.
- Lands sponsored on **Arbitrum Sepolia** first (free), then **Arbitrum One** with the funded Pimlico balance + the real sponsorship policy.

**If this doesn't land sponsored against a genuinely CDP-created account at its CDP-assigned address, STOP and report** — do not wire the live lane. This closes the one gap Phase 1 left (op2 used the public factory).

### 2. `gas_aa_prepared_user_ops` ledger (migration + model)

The authorization spine. Columns at least: `id`, `lane`, `semantic_action_id`, `sender`, `decoded_user` (the `permission.account` for spender ops), **`chain_id`, `entry_point`, `sender_nonce`**, `calls_hash`, `cap_bucket`, `status` (`authorized` → `prepared` → `landed`/`failed`/`expired`), `user_op_hash` (null until prepared), `signed_user_op` (full, null until prepared), `expires_at`, timestamps. A row is created **only after the app's existing velocity/security checks pass**, before the build.

**Short expiry + cleanup (P2):** `expires_at` is **minutes, not hours**. A **cleanup/reconciliation sweep** marks un-landed `authorized`/`prepared` rows `expired` once past the window — so the webhook can never sponsor a stale prepared intent after product state has moved on. The not-expired check is enforced **both** in the webhook match and by the sweep.

**Uniqueness (P1):** a **partial-unique index over active (non-terminal) rows** on `(chain_id, entry_point, sender, sender_nonce)` once `sender_nonce` is set, plus a **unique index on `user_op_hash`** once `prepared`. This is the DB backstop to the submitter's nonce lock (§3) — concurrent spender sends cannot double-allocate a nonce. **Rows without `sender_nonce` are not sponsorable.**

### 3. `OffCdpSubmitter` (the shared module)

Per `docs/GAS_AA_PHASE2_PLAN.md` §architecture, steps 0–6:

- **Authorize** (row at `authorized`) → **build** with the **stored CDP address** (fail closed on divergence) → resolve initCode from the **deterministic deploy-state source** (for the spender it's known-deployed; seed that) → Pimlico gas price → **sponsor with `sponsorshipPolicyId`** (never empty context) → **sign, then persist the FULL signed UserOp + `userOpHash` at `prepared` BEFORE `eth_sendUserOperation`** → submit via Pimlico bundler → reconcile, mark `landed`/`failed`.
- **Fallback = pre-broadcast only:** any failure **before `prepared`** → CDP's own unsponsored `sendUserOperation` + existing `checkAndRefuel`. **Once `prepared`, committed to that exact op:** on timeout/ambiguity, query bundler/EntryPoint by the stored `userOpHash`; if found → wait/reconcile; if found nowhere → **idempotent rebroadcast of the SAME signed op** (same hash). **Never rebuild, never a new/legacy op, never a new hash.**
- **Shared-spender nonce concurrency (P1) — serialize it.** The spender is a _shared_ backend account, so two concurrent free-sends could resolve the **same** current nonce and collide (row collision, a stuck op, or ambiguous webhook matching). `OffCdpSubmitter` **must hold a per-`(chain_id, entry_point, sender)` lock across the whole critical section** — **resolve nonce → write/UPDATE the prepared row → sign → submit** — so nonce allocation is serialized. With the §2 active-uniqueness on `(chain_id, entry_point, sender, sender_nonce)`, a second concurrent send either **waits and takes the next nonce or fails cleanly pre-broadcast** — never two active prepared rows on one nonce. A row without a `sender_nonce` is never sponsorable.

### 4. Pimlico sponsorship policy + authenticated, DB-binding webhook

- Sponsorship policy (Arbitrum One): per-account/day cap + global budget cap; pass its `sponsorshipPolicyId` in the paymaster context.
- **Authenticate the webhook FIRST (P1).** The endpoint is internet-reachable and authorizes paymaster spend, so verify **every** request with **`@pimlico/webhook`** — `pimlicoWebhookVerifier(process.env.PIMLICO_WEBHOOK_SECRET)` — over the **raw request body** (capture the exact received bytes; do NOT re-serialize `req.body`, the signature is over what was sent). **Reject unsigned / invalid-signature / unknown-type requests before any DB work.** Handle `user_operation.sponsorship.requested` (authorize) and `user_operation.sponsorship.finalized` (reconcile).
- **DB-binding match (P1) — authorize ONE exact prepared op, not a class.** The `requested` payload carries `{ userOperation, entryPoint, chainId, sponsorshipPolicyId }`. Match it to an `authorized`/`prepared` `gas_aa_prepared_user_ops` row by **`chain_id` + `entry_point` + `sender` + `sender_nonce` + `calls_hash` + `decoded_user` + `cap_bucket` + not-expired** — the **`sender_nonce` is the disambiguator** so repeated identical sends can't collide on one authorization. Recompute/bind the final `user_op_hash` at the prepared/broadcast stage. If the Pimlico `paymasterContext` can carry a custom `prepared_op_id`, include it for an exact 1:1 match (**verify** whether the webhook surfaces custom context; if not, the nonce-tuple is the binding). **No matching row ⇒ `{ sponsor: false }`** (even if the calldata looks valid — decoding alone is not authorization).
- **Decode to derive the bound fields.** For the spender free-send `sender` is ALWAYS the spender, so decode `SpendPermissionManager.spend(permission, amount)` + the paired `USDC.transfer` and bind on `permission.account`: registered user, `permission.spender` == Sippy spender, token == USDC, recipient allowed, amount within the **per-`permission.account`** cap (never per-`sender`).
- **`finalized` is DB-bound too (P2).** A verified `user_operation.sponsorship.finalized` event may only update a row matched by **`user_op_hash` + `chain_id` + `entry_point`** (the hash exists by finalize time). **An unknown hash is rejected / no-op** — a signed-but-unknown finalized event must never mark anything `landed`.

### 5. Wire the spender FREE-SEND lane behind `GAS_AA_ENABLED`

The batched `SpendPermissionManager.spend + USDC.transfer` at `apps/backend/app/services/embedded_wallet.service.ts:345` (inventory row ④). With the flag **on**: route through `OffCdpSubmitter` (replacing `checkAndRefuel(spender)` on the happy path; fallback retains it pre-broadcast). With the flag **off**: byte-identical to today. **Off-ramp (`offramp_controller`) stays on the legacy path — its own flag, not this one.**

## Constraints (non-negotiable)

- `GAS_AA_ENABLED` **default off**. **GasRefuel stays live** (fallback). **No deploy, no flag flip in prod** — staging only; the user does promotion.
- Money path sacred: pre-broadcast-only fallback; idempotent-rebroadcast (never a new/legacy op once `prepared`).
- Throwaway accounts + tiny amounts for the gate script; **never the real spender's or users' funds** in the gate; prod DB read-only outside the new table's migration.
- Reuse the spike's proven wiring but **not** its public-factory address derivation.
- **Explicit backend deps (P2):** add `viem` and `@pimlico/webhook` (plus any other production imports) as **explicit** dependencies of the backend package — do NOT rely on transitive deps from `@coinbase/cdp-sdk` or the scratch-script `node_modules`. New env: **`PIMLICO_WEBHOOK_SECRET`** (from the sponsorship-policy settings), alongside the existing `PIMLICO_API_KEY`.

## Tests / exit criteria

- **§2.0 gate landed** on a CDP-created account at its CDP address (stored-address override + divergence check exercised), Sepolia then One.
- **Webhook auth (P1):** a missing / tampered / wrong-secret signature is **rejected before any DB lookup** (test with a tampered raw body and a wrong secret).
- **Webhook negative tests:** rejects (a) an op with no matching prepared-op row, (b) a decoded `permission.account` that isn't registered, (c) a non-allowlisted recipient, (d) an over-cap op, (e) a second identical send reusing the _same_ nonce/row (must require its own authorized row).
- **Stale-row (P2):** a `prepared`/`authorized` row past `expires_at` is **not** sponsorable; the cleanup sweep marks it `expired`.
- **Nonce concurrency (P1):** two concurrent spender free-sends **cannot** produce two active prepared rows with the same `sender_nonce` — one waits/takes the next nonce or fails cleanly pre-broadcast.
- **Finalized binding (P2):** a verified but **unknown-hash** `finalized` event marks nothing `landed` (no-op/reject).
- **Safety:** forced pre-broadcast sponsorship failure falls back with **no double-send**; a `prepared` op + simulated post-broadcast crash → **idempotent rebroadcast of the same signed op**, never a new/legacy op.
- **Free-send lane:** lands sponsored on staging via `OffCdpSubmitter`; **flag off ⇒ byte-identical** legacy behavior. Off-ramp untouched.
- typecheck + lint + backend suite green.

## Commit / handoff

Branch off `main` (or `spike/gas-phase1`'s merge, once the docs are on main). commitlint scope: use `feat(backend):` (not `season`/other non-enum scopes). **Do not commit final / deploy / flip the flag** — report back with the gate result + the staging free-send evidence for audit; the user commits and promotes.

# Gas → AA — Phase 2 slice 1, Part B: staging validation checklist (audit record)

**Status of the gate:** §2.0 Part A is **CLOSED** on Arbitrum One (op1 `0x36110e6e…`, op2 `0x0f9cec2b…`, account at 0 ETH, EIP-1271 `isValidSignature → 0x1626ba7e` against the real spender). The signature/owner risk is **retired**, so Part B _confirms_ the full webhook-gated `spend + transfer` end-to-end — it is **confirmation, not de-risking**.

Run top to bottom on **staging**, record evidence inline, and **do not flip the prod flag** until every section is green and the evidence has been reviewed. Rollback is always available: `GAS_AA_ENABLED` off → every lane reverts to legacy + GasRefuel (still live), no redeploy.

---

## 0 · Pre-conditions (staging env + config)

- [ ] Migration `0031_create_gas_aa_prepared_user_ops` applied on the staging DB (table + the `uniq_gas_aa_active_nonce` / `uniq_gas_aa_user_op_hash` indexes present).
- [ ] `PIMLICO_API_KEY` set (bundler + paymaster key).
- [ ] `PIMLICO_SPONSORSHIP_POLICY_ID=sp_wet_tyrannus` set.
- [ ] Webhook **enabled** on `sp_wet_tyrannus` → URL `https://<staging-host>/webhook/pimlico/sponsorship`, and that URL is **publicly reachable** (Pimlico must be able to POST to it — confirm it is not behind auth / an IP allowlist, or sponsorship silently fails and every send falls back to legacy).
- [ ] `PIMLICO_WEBHOOK_SECRET` = the policy's webhook secret (copied from the dashboard).
- [ ] Staging Arbitrum RPC env(s) set.
- [ ] **Owner re-confirm:** `'sippy-spender-owner'` resolves under _staging's_ CDP creds to the staging spender's `ownerAtIndex(0)`. Quick read-only proof: EIP-1271 `isValidSignature` on the staging spender for an override-account CDP-owner sig → `0x1626ba7e`. (Prod creds are already proven; re-check only matters if staging uses a different CDP project/spender.)
- [ ] **Chain/value note:** if staging runs on **Arbitrum One with the real spender**, the free-send moves real (small) USDC — use a controlled test user wallet + a minimal amount. If staging has its own spender/testnet, confirm the spender owner + USDC address there.
- [ ] `GAS_AA_ENABLED` **OFF** for the first deploy (for the §1 baseline), then flipped ON for §2+.

## 1 · Flag-OFF baseline (regression guard)

- [ ] With the flag **off**, run a free-send on staging. It behaves byte-identically to today: legacy path (`checkAndRefuel` + `cdp.evm.sendUserOperation`), spender refueled as before, send lands.
- [ ] **No `gas_aa_prepared_user_ops` rows created** (the AA path is fully dormant flag-off).
- **Evidence:** tx hash; log line shows the legacy (non-AA) path.

## 2 · Happy path (flag ON, one real free-send)

- [ ] Run **one** small spender free-send (controlled test user → test recipient).
- [ ] Logs show the **AA-sponsored** path (`via AA-sponsored path`), **not** "legacy fallback".
- [ ] **Spender ETH unchanged** before/after (no refuel) — record both balances.
- [ ] User's USDC moved to the recipient (correct amount).
- [ ] The ledger row went **authorized → prepared → landed**, with `user_op_hash`, `signed_user_op`, and `meta.tx_hash` populated.
- [ ] Pimlico dashboard (Requests / UserOp logs) shows the sponsored op under `sp_wet_tyrannus`, webhook returned `sponsor: true`.
- [ ] The userOp is on Arbiscan, EntryPoint v0.6, paymaster paid.
- **Evidence:** tx hash, userOp hash, prepared-op id, spender ETH before/after, Pimlico balance delta, row status timeline.

```sql
-- the prepared-op lifecycle for the test send
SELECT id, status, sender, decoded_user, sender_nonce, user_op_hash,
       meta->>'tx_hash' AS tx_hash, created_at, updated_at
FROM gas_aa_prepared_user_ops
ORDER BY created_at DESC LIMIT 5;
```

## 3 · Webhook security negatives (the DB-binding proofs)

Each must be **rejected** and the op **not sponsored**:

- [ ] **No matching row** — a signed, well-formed `sponsorship.requested` whose op has no prepared-op row → `{ sponsor: false }` ("no matching authorized op").
- [ ] **Bad / missing signature** — tampered raw body or wrong secret → **401 before any DB work**.
- [ ] **Unregistered `decoded_user`** — `permission.account` not in `phone_registry` → reject.
- [ ] **Wrong recipient / token / spender** — non-allowlisted recipient, non-USDC token, or `permission.spender ≠ sender` → reject.
- [ ] **Over the per-op cap** — an op whose sponsored gas would exceed $0.05 → not sponsored.
- [ ] **Unknown-hash `finalized`** — a signed `sponsorship.finalized` with no matching row → no-op; **nothing marked `landed`**.
- **Evidence:** for each, the webhook response + confirmation no sponsorship occurred. Run via the `gas_aa_webhook` functional spec pointed at staging, or signed direct requests.

## 4 · Safety / concurrency (money-path guards)

- [ ] **Two concurrent free-sends** (same spender) → no nonce collision; at most one active prepared row per nonce; the second takes the next nonce or fails cleanly pre-broadcast. The `uniq_gas_aa_active_nonce` index holds (no two active rows on one nonce).
- [ ] **Forced pre-broadcast sponsorship failure** (temporarily disable `sp_wet_tyrannus` or point to a bad policy id) → the send **falls back to legacy** and completes — **exactly one** on-chain transfer, **no double-send**. Re-enable the policy after.
- [ ] **Reconciler** (scheduled): `sweepExpired` marks stale `authorized` rows `expired`; a `prepared` row is never expired; a stuck `prepared` op is idempotently rebroadcast (same hash, never a new op). Confirm a clean no-op pass when idle, and that the `ALERT_AGE_SEC` (1h) stuck-op alarm is wired to something you'll actually see.
- **Evidence:** concurrent-send row states; the fallback send's single tx hash; reconciler log lines.

## 5 · Cost capture (feeds the Phase 2 model)

- [ ] Actual sponsored gas per free-send (from the receipt) + the Pimlico balance delta. Expect ~$0.004-ish, within the $0.05 per-op cap; watch the **$10 global lifetime cap** drain across the §3–§4 runs (the gate already consumed ~$0.014; raise the cap via Edit before a longer canary).

## 6 · Exit / sign-off

- [ ] All sections green; evidence recorded above.
- [ ] Hand the happy-path tx + the row timeline to audit before any prod flip.
- [ ] **Prod canary next:** flip on for a limited set, watch the same signals (AA-sponsored path, spender ETH flat, rows landing, no fallbacks/double-sends), then widen.

---

## Not Part B — banked for the cold-onboard slice

The gate's **convergence** finding (CDP accounts = public-factory v1.1 at the owner-derived address) suggests **option A** (fully sponsored cold onboarding, no GasRefuel first-deploy) may be essentially free. Verify at _that_ slice, not here:

1. A `cdp-hooks`-created **user** account converges with `toCoinbaseSmartAccount({ owners, version: '1.1' })` the way the spender + throwaway did.
2. A **counterfactual** user's owner address is readable pre-deploy (to build the public-factory initCode).

If both hold, cold accounts deploy via the op1-style **sponsored** path at 0 ETH — collapsing the "B-now-A-later" fork into "A directly."

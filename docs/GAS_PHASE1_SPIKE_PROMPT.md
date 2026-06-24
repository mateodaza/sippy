# Gas → AA — Phase 1 spike (CC task)

**This is a SPIKE: no product code, no flag, no deploy.** Output = a written findings doc + two throwaway proof scripts. It de-risks the whole migration; everything downstream waits on it.

**Read first:** `docs/GAS_AA_MIGRATION_PHASES.md` (the approved plan — note the architecture rule: _sponsor submitted UserOps, never pre-fund, no gas on registration_; and the per-lane fallback contract) and `docs/GAS_PHASE0_FINDINGS.md` (decision: keep CDP accounts, swap gas path; Pimlico on Arbitrum). Then the live call sites:

- `apps/backend/app/services/embedded_wallet.service.ts` — `sendUserOperation({ smartAccount: spenderAccount })` (spender send) + `checkAndRefuel`.
- `apps/backend/app/controllers/offramp_controller.ts` — off-ramp send (same spender path).
- `apps/backend/app/controllers/embedded_wallet_controller.ts` — **registration auto-refuel** + `/api/ensure-gas` → `checkAndRefuel`.
- `apps/web/app/setup/page.tsx` — the setup flow that creates the spend permission; `apps/web/app/settings/page.tsx` — sweep via `ensureGasReady`.
- `apps/backend/app/services/refuel.service.ts` — the GasRefuel V1 drip (confirm V1 = no allowlist).
- Wherever `createSpendPermission` is invoked (the SDK call + its options type).

## Deliverable 1 — the UserOp inventory

A table of **every gas event** in the codebase, each classified **sponsor this UserOp** vs **delete this pre-funding**:

| location | what op | who submits | whose account pays gas | funded how today | classification |
| -------- | ------- | ----------- | ---------------------- | ---------------- | -------------- |

Minimum rows: setup `createSpendPermission`, permission update/revoke, direct/sweep (`settings/page`), spender `spend + USDC.transfer` send, off-ramp send, **registration auto-refuel**, `/api/ensure-gas`. Mark registration + `/api/ensure-gas` as **delete pre-funding** (registration must become phone→wallet bind only); mark the actual UserOps as **sponsor**. Note 30-day cost/refuel count per row where available.

## Deliverable 2 — SDK surface + integration shape (written answer)

1. Does CDP's **`sendUserOperation`** accept a `paymasterUrl` (or equivalent external-paymaster option) on Arbitrum? Does **`createSpendPermission`** accept `paymasterUrl`? Confirm from the SDK types + a real call, not docs alone.
2. EntryPoint version + whether the CDP smart account is deployed/4337-ready for a sponsored UserOp.
3. **Direct vs proxy:** does CDP accept a direct external Pimlico paymaster/bundler URL, or do we need a self-hosted ERC-7677 `/api/paymaster` proxy (daebak shape)? **This decides Phase 2 — answer it; don't build the proxy.**

## Deliverable 3 — prove TWO sponsored ops (throwaway scripts, real Arbitrum, tiny amounts)

Scratch scripts only (not wired into product), a throwaway Pimlico key, throwaway accounts, tiny test USDC — **do not touch real user funds or the real spender**:

- **(i) the real regression risk:** a **fresh user smart account with ZERO ETH and no refuel** submits `createSpendPermission({ paymasterUrl })` and it lands. Proves a cold-onboarded wallet can act with **no pre-funding**.
- **(ii)** a (throwaway) spender smart account submits the batched `SpendPermissionManager.spend + USDC.transfer` with `paymasterUrl` and it lands. (Chain off (i)'s permission if needed.)

## Constraints

- **Read-only on prod** (DB/receipts for the inventory). All on-chain proof uses throwaway accounts + tiny amounts.
- **No product-code changes, no env flag, no deploy.** Scripts live in a scratch/spike dir.
- If either proof op **cannot be sponsored in practice**, **stop and report** — that's the one outcome that reopens the account-implementation question (per the plan).

## Exit criteria / output

Write `docs/GAS_PHASE1_FINDINGS.md` with: the filled inventory table, the SDK answers (paymasterUrl support on both calls + EntryPoint + **direct-vs-proxy decision**), and the two proof-op results (tx/userOp hashes). State the recommended Phase 2 integration shape. **Both (i) and (ii) landing sponsored is the gate to Phase 2.**

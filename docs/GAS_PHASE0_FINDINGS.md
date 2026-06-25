# Gas Migration — Phase 0 Findings & Decision

**Date:** 2026-06-23 · Scope: **Phase 0 only** (measure cost · confirm Arbitrum paymaster · decide address stability). Pairs with `docs/GAS_MIGRATION_PRIVY_AA.md`.

---

## Decision (the keystone): ✅ addresses stay stable → "swap gas path only"

**Proceed with the swap-gas-only path. Do NOT migrate wallets. Do NOT combine score launch + wallet migration + paymaster migration.**

**Why it's settled:** Coinbase's own docs state CDP Paymaster covers **Base only**, _but_ — **"For other EVM networks, you can use any ERC-7677 compliant paymaster provider with CDP Smart Accounts."** ([CDP Paymaster docs](https://docs.cdp.coinbase.com/paymaster/introduction/welcome)). CDP smart accounts are standard ERC-4337/ERC-7677 accounts, so we keep them **as-is** and route their UserOps through a third-party **Arbitrum** paymaster (Pimlico / Alchemy / Circle).

- A paymaster only _pays for_ a UserOp; it does **not** change the account. The smart-account address is a function of (factory, implementation, owner/salt) — none of which we touch.
- → **No address change. No balance sweep. No identity/registry migration.** The risky scenario from the migration plan (changing the account _implementation_ → new addresses) is avoided entirely.

This is the favorable branch you scoped: _"if existing CDP smart account addresses can stay stable, proceed with swap-gas-only."_ They can. Proceed.

> One spike still required before Phase 1 (small, see §4) — confirm the _exact CDP SDK call_ that submits a UserOp with an external paymaster on Arbitrum, and confirm who pays gas in today's send path (user smart account vs spender). The architecture answer (addresses stable) is firm regardless.

---

## 1. Measure real GasRefuel cost

**On-chain handles (from repo):**

- GasRefuel V1 (deployed): `0xE4e5474E97E89d990082505fC5708A6a11849936` (Arbitrum One)
- Refuel admin EOA: the `REFUEL_ADMIN_PRIVATE_KEY` signer (its address shows in startup logs) — this EOA pays the "gas to send gas."
- Spender: `0xB396805F4C4eb7A45E237A9468FB647C982fBeb1`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`

**Cost has three parts — measure all three:**

**(a) ETH dripped** — already aggregated in the indexer. Instant:

```sql
-- all-time dripped ETH + refuel count
SELECT total_refuels,
       total_eth_spent::numeric / 1e18 AS eth_dripped
FROM onchain.gas_refuel_status WHERE id = 'singleton';

-- trailing 30 days
SELECT COUNT(*)                       AS refuels_30d,
       SUM(amount)::numeric / 1e18    AS eth_dripped_30d,
       AVG(amount)::numeric / 1e18    AS avg_drip
FROM onchain.refuel_event
WHERE timestamp > EXTRACT(EPOCH FROM now() - interval '30 days');
```

**(b) "Gas to send gas" (the dominant waste)** — the gas the **admin EOA** paid to execute each `refuel()`. This is NOT in the DB (the DB stores the _value transferred_, not the tx gas). Get it from the admin EOA's outbound transactions on Arbiscan (`txlist` → sum `gasUsed × gasPrice` for txs to the GasRefuel contract), or fetch receipts for the `refuel_event.tx_hash` set and sum `gasUsed × effectiveGasPrice`. Budgeted `gasLimit` is 300k/refuel, so even at ~$0.01–0.05/tx this is the same order as the drip itself and recurs every top-up.

**(c) Stranded ETH** — ETH still idle across user wallets (locked, not spent):

```sql
-- distinct refueled wallets; multiply by current avg idle balance (query balances off-chain)
SELECT COUNT(DISTINCT "user") AS refueled_wallets FROM onchain.refuel_event;
```

**Total monthly cost ≈ (a) dripped + (b) refuel-tx gas + (c) opportunity cost of stranded ETH.** Run (a)+(b) for the last 30 days; that single number is the "before" baseline to beat. Compare to the paymaster estimate in §2 for the same transfer volume (paymaster pays **one** UserOp's gas, no drip, no refuel-tx, no idle ETH).

---

## 2. Arbitrum paymaster — confirmed support + pricing

All three sponsor on **Arbitrum One** today:

| Provider                | Fit                                                                                        | Pricing (2026)                                                           | Notes                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pimlico**             | bundler **+** paymaster, single API; policy engine (rate limits, allowlists, per-app caps) | **actualGasCost × 1.10** (10% surcharge); ~10M credits/mo before charges | ERC-20 paymaster supports **USDC** on Arbitrum → option to let users pay gas in USDC. Strong default.                                                                   |
| **Alchemy Gas Manager** | sponsorship-only + policy dashboard, per-user spend limits                                 | Pay-as-you-go (gas + margin)                                             | **Confirms Arbitrum One (42161)**; inherits your Alchemy key if you already use Alchemy for RPC/indexing.                                                               |
| **Circle Paymaster**    | USDC-native gas (most on-brand)                                                            | gas paid in USDC                                                         | Has an [Arbitrum quickstart](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart); users effectively pay gas in USDC — no ETH anywhere. |

Reference gas: a simple USDC transfer on Arbitrum is **~$0.01–$0.05**. The policy engines (per-user/day caps, allowlist) replace exactly what the GasRefuel allowlist + daily-limit gave us — enforced in config, not a bespoke contract.

**Recommendation:** **Pimlico** as the default (single bundler+paymaster API, clean policy engine, USDC-pay optionality) — _or_ **Alchemy Gas Manager** if Sippy's indexer/RPC is already on Alchemy (one less vendor). Note **Circle's USDC paymaster** as the most thematically-aligned option (gas in USDC) worth a look in Phase 1. This pairs cleanly with the daebak stack (self-host the `/api/paymaster` ERC-7677 proxy, point it at the chosen provider).

---

## 3. What Phase 0 establishes for Phase 1

Because addresses are stable, **Phase 1 becomes narrow and low-risk:** keep CDP smart accounts, stand up a `/api/paymaster` (ERC-7677) proxy to Pimlico/Alchemy on Arbitrum behind an env guard, submit a single sponsored transfer UserOp on a test wallet, and confirm it lands. GasRefuel stays live as fallback. No wallet/identity work. This keeps the **Season 1 launch decoupled** from any wallet migration, exactly as required.

---

## 4. The one spike to run before Phase 1 (≤0.5 day)

1. **CDP SDK + external paymaster:** confirm the exact call to submit a UserOp from a CDP smart account with an **external ERC-7677 paymaster on Arbitrum** (CDP docs say it's supported off-Base; verify the SDK surface and that the account is deployed/4337-ready).
2. **Who pays gas today:** confirm the live send path — does the **user smart account** submit the transfer UserOp (paying its own gas, hence GasRefuel), or does the **spender** execute via spend permission? This determines _whose_ UserOp the paymaster sponsors. (GasRefuel dripping ETH to _user_ wallets implies user-account-pays — confirm.)
3. **Spend-permission vs session keys:** decide whether the spender model stays (sponsor the spender's UserOps) or moves to ERC-7715 session keys. **Do not** change authz and gas in the same step.

---

## Bottom line

- **Address stability: ✅ stable.** Keep CDP accounts; swap only the gas path. No migration, no sweep, no registry change.
- **Arbitrum paymaster: ✅ available** (Pimlico / Alchemy / Circle). Recommend Pimlico (or Alchemy if already in-stack).
- **Cost baseline:** run §1 (a)+(b) for 30 days to get the "before" number; paymaster removes the drip, the refuel-tx gas, and the stranded ETH.
- **Sequencing:** safe to ship Season 1 first; the paymaster swap is isolated and can land in parallel without touching wallets.

## Sources

- [Coinbase CDP — Paymaster (Base-only; external ERC-7677 paymaster supported on other networks with CDP Smart Accounts)](https://docs.cdp.coinbase.com/paymaster/introduction/welcome)
- [Pimlico — paymaster + bundler, pricing (actualGasCost × 1.1)](https://docs.pimlico.io/guides/pricing) · [ERC-20 (USDC) paymaster](https://github.com/pimlicolabs/erc20-paymaster)
- [Alchemy — Gas Manager + supported chains (Arbitrum One 42161)](https://www.alchemy.com/docs/reference/supported-chains-copy) · [Gas Manager](https://www.alchemy.com/gas-manager)
- [Circle USDC Paymaster — Arbitrum quickstart](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart)
- Internal: `apps/backend/app/services/{refuel,gas_refuel_poller,onchain_writer}.service.ts`, `apps/backend/scripts/{audit_24h,preflight,smoke_onboarding}.ts`, `contracts/gas-refuel/contracts/GasRefuelV2.sol`

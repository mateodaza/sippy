# Gas Migration Plan — GasRefuel ETH-drip → Account-Abstraction Paymaster

**Status:** Plan / proposal · **Date:** 2026-06-23 · **Owner:** Mateo
**Goal:** Kill the GasRefuel ETH-drip (too expensive) and sponsor gas with an ERC-4337 **paymaster**, reusing the proven Privy + Coinbase-Smart-Account + self-hosted-paymaster stack from `daebak-markets`.

---

## TL;DR

Today we pay gas **twice and waste it three ways**: every user's smart account needs ETH to transact, so `GasRefuel` sends each wallet a drip — and **each drip is itself a ~300k-gas transaction** paid by an admin EOA. We pay gas to send gas, leave ETH stranded in hundreds of wallets, and run a poller to babysit it.

The fix is account abstraction done properly: route every transfer through a **bundler + paymaster**. The paymaster pays gas for the UserOp directly from **one funded balance**. No per-wallet ETH, no refuel transactions, no idle balances, no poller. We already have a working reference for the whole stack in `daebak-markets` (Privy signer → Coinbase Smart Account → EIP-7677 paymaster proxy → bundler).

**Net effect:** roughly **halve on-chain gas per transfer** (one sponsored UserOp instead of refuel-tx + user-tx), recover all stranded ETH, and delete the refuel contract, admin key, and poller service.

---

## 1. Why GasRefuel is expensive (current architecture)

**Stack today** (from `apps/backend`):

- Each user has a **Coinbase CDP embedded smart account** on Arbitrum One.
- A **spender wallet** (`SIPPY_SPENDER_ADDRESS`) executes transfers via on-chain **spend permissions**.
- `GasRefuel` V1 is deployed (V2 with allowlist is code-complete, not deployed — `contracts/gas-refuel/contracts/GasRefuelV2.sol`).
- `refuel.service.ts`: an **admin EOA** (`REFUEL_ADMIN_PRIVATE_KEY`) calls `contract.refuel(user)` with `gasLimit: 300000` whenever a wallet dips below `minBalance` (0.00005 ETH), topping it up by `refuelAmount` (0.0001 ETH), up to 3×/day with a 10-min cooldown. A 30-min poller monitors balances.

**Where the money goes:**

| Cost                  | What it is                                                                                | Why it hurts                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Gas-to-send-gas**   | Each `refuel()` is a full Arbitrum tx (budgeted 300k gas) just to move a few cents of ETH | You pay a whole transaction to enable another transaction — the dominant waste                       |
| **The drip itself**   | 0.0001 ETH per top-up                                                                     | Small per drip, but × users × up to 3/day, recurring forever                                         |
| **Stranded ETH**      | Every active wallet holds idle ETH                                                        | Capital locked across hundreds of wallets; only partially ever spent; unrecoverable without more txs |
| **The user's own tx** | The smart account then pays gas for its transfer                                          | Unavoidable today because gas comes from the wallet, not a sponsor                                   |
| **Ops overhead**      | Poller, admin key, contract balance monitoring, "unpause"/refill runbooks                 | Engineering + on-call surface area                                                                   |

The structural problem: **gas is funded per-wallet, in advance, on-chain.** That's O(N wallets) of transactions and idle capital. It does not scale with the volume push.

---

## 2. Target architecture — paymaster-sponsored UserOps

ERC-4337 lets a **paymaster** pay gas for a UserOperation. The flow becomes:

```
transfer intent
  → build UserOp from the user's smart account
  → paymaster sponsors gas (EIP-7677: pm_getPaymasterStubData / pm_getPaymasterData)
  → bundler submits to the EntryPoint
  → settles on Arbitrum
```

**What disappears:** the GasRefuel contract, the admin EOA + its key, the drip, the stranded ETH, and the poller. **What replaces it:** one **paymaster deposit** you top up (or a provider gas-tank), plus a bundler. You pay only for the _actual_ gas of _actual_ transfers, from one place, with one set of policies (per-user/day caps, allowlists) enforced in the paymaster instead of in a bespoke contract.

This is exactly the model Privy ships: _"Privy routes transaction requests to the registered paymaster, which pays gas instead of the user's wallet… register a paymaster URL in the Privy Dashboard."_ ([Privy smart wallets docs](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview))

---

## 3. Reuse from `daebak-markets` (we already built this)

The daebak app has a complete, debugged AA lane. Reuse it rather than re-deriving:

| daebak file                                                | What to lift                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/privy-smart-account.ts`                  | Builds the smart account from a Privy signer; wires `createPaymasterClient` (EIP-7677) + bundler client; the 90s UserOp-landing wait + error mapping. Note their hard-won pivot **off ZeroDev Kernel V3.1 → Coinbase Smart Account** for paymaster-tracer compatibility. |
| `apps/web/src/lib/aa-config.ts`                            | Single source of truth for chain, **`/api/paymaster`** proxy path, **`/api/bundler`** proxy path, and the `isPrivyEnabled()` env guard so a missing key can't brick the app.                                                                                             |
| `apps/web/src/app/api/paymaster/route.ts` + `/api/bundler` | **Server-side proxies** that keep the paymaster/bundler API keys off the client and let us enforce sponsorship policy server-side.                                                                                                                                       |
| `apps/web/docs/PRIVY_INTEGRATION.md`                       | The env-guard rationale and maintainability rules.                                                                                                                                                                                                                       |
| `tooling/csw-fixtures/*`                                   | UserOp `callData` / `paymasterAndData` fixtures + extract-from-tx tooling for tests.                                                                                                                                                                                     |

**Key difference to design around:** daebak is a **client-side** wallet UX (user signs in the browser, on Base Sepolia). Sippy executes transfers **server-side** (the WhatsApp bot/backend submits on the user's behalf, on **Arbitrum One**). So we keep the _stack shape_ (smart account + EIP-7677 paymaster proxy + bundler via `viem`/`permissionless`) but run it in the backend and point it at Arbitrum.

---

## 4. Provider decision (the one real fork)

The daebak paymaster proxy is built around **CDP's paymaster**, which is **Base-centric**. Sippy is committed to **Arbitrum One** (grant commitment — do not move chains). So the open decision is _which paymaster + bundler serves Arbitrum_:

| Option                                                                     | Account impl                                                           | Paymaster/bundler                                                                     | Notes                                                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Privy + Coinbase Smart Account + Arbitrum paymaster** _(recommended)_ | Coinbase Smart Account (matches daebak, avoids the Kernel tracer pain) | **Pimlico** or **Alchemy Gas Manager** on Arbitrum, behind our `/api/paymaster` proxy | Maximum code reuse from daebak; swap only the paymaster/bundler provider + chain                                                           |
| **B. Privy native gas sponsorship**                                        | Privy smart wallets (Kernel/Safe/Biconomy/Alchemy selectable)          | Register a paymaster URL in the Privy dashboard; Privy routes UserOps to it           | Least glue code; Privy partners with [ZeroDev](https://privy.io/blog/zerodev-partnership). Verify Arbitrum + server-side execution support |
| **C. Keep CDP smart accounts, add an Arbitrum third-party paymaster**      | Existing CDP accounts (no wallet migration)                            | Pimlico/Alchemy paymaster                                                             | Smallest blast radius (no wallet/identity migration) but loses the "standardize on Privy" goal                                             |

**Recommendation:** **Option A.** It reuses the daebak stack almost verbatim (Privy signer + Coinbase Smart Account + self-hosted EIP-7677 paymaster proxy + bundler), and only swaps the paymaster/bundler provider to an Arbitrum-capable one (Pimlico or Alchemy). Privy lets us pick the account implementation and bring our own paymaster ([implementations: Alchemy, Kernel/ZeroDev, Safe, Biconomy, Thirdweb, Coinbase Smart Wallet](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview)).

> **Must verify before committing:** (1) which paymaster providers sponsor on **Arbitrum One** today and their pricing; (2) whether we keep the **spend-permission/spender** model or replace it with **session keys (ERC-7715)** now that the account is AA-native; (3) migration path for **existing users' funds/addresses** (smart-account address may change if the account implementation changes — see §6).

---

## 5. Cost model — before vs after

Illustrative, per active transfer (exact $ depends on Arbitrum gas + provider fees):

|                           | Today (GasRefuel)                                | After (paymaster)                        |
| ------------------------- | ------------------------------------------------ | ---------------------------------------- |
| On-chain txs per transfer | ~2 (a refuel tx amortized + the user's transfer) | **1** (one sponsored UserOp)             |
| Idle ETH                  | ETH stranded in every wallet                     | **0** (one paymaster balance)            |
| "Gas to send gas"         | Yes (300k-gas refuel txs)                        | **None**                                 |
| Funding surface           | Refuel contract + admin EOA, refilled repeatedly | **One** paymaster deposit / gas-tank     |
| Infra                     | Poller + balance monitor + unpause runbook       | Paymaster policy config (caps/allowlist) |
| Cost scaling              | O(N wallets) txs + locked capital                | O(actual transfers) gas only             |

Rough expectation: **~50% less on-chain gas per transfer** (kills the refuel leg) **plus** recovery of all stranded ETH **plus** deletion of poller/admin-key ops. Put a number on it during Phase 0 by pulling 30 days of `Refueled` events (count + total ETH + gas spent) from the indexer and comparing to a paymaster cost estimate for the same transfer volume.

---

## 6. Migration phases

**Phase 0 — Measure & decide (0.5 day).**
Pull the real cost: from `onchain.refuel_event` / `Refueled` logs, sum refuel-tx count, dripped ETH, and gas spent over 30 days. Confirm the Arbitrum paymaster provider (Pimlico vs Alchemy vs Privy-native) and pricing. Decide account implementation (Coinbase Smart Account recommended).

**Phase 1 — Stand up the AA lane in staging (2–3 days).**
Port `aa-config.ts`, `privy-smart-account.ts`, and the `/api/paymaster` + `/api/bundler` proxies into the Sippy backend, pointed at **Arbitrum One** and the chosen provider. Put it behind an env guard (`isPaymasterEnabled()`), mirroring daebak's `isPrivyEnabled()`. Build a single transfer UserOp end-to-end on a test wallet; confirm the paymaster sponsors and the bundler lands it within the timeout.

**Phase 2 — Dual-run (1 week).**
Route a **small % of transfers** through the paymaster path while GasRefuel stays live as fallback. Compare success rate, latency, and cost. Enforce the same safety policy the contract did (per-user daily caps, allowlist) **in the paymaster policy** so abuse limits don't regress.

**Phase 3 — Cutover (1–2 days).**
Flip all transfers to the paymaster path. **Pause** GasRefuel (it already starts paused by default), stop the poller. Leave it deployed but dormant for one cycle as rollback.

**Phase 4 — Decommission & reclaim (0.5 day).**
After a clean week: `withdraw()` the GasRefuel contract balance, sweep residual ETH from user wallets if feasible, remove `refuel.service.ts` + `gas_refuel_poller.service.ts` + the admin key from env, and update the docs/runbook.

> **Account-address caveat:** if we change the account _implementation_ (CDP → Coinbase Smart Account via Privy), the deterministic smart-account **address can change**, which matters because users' USDC lives at their current address. Options: (a) keep the same account implementation so addresses are stable and only change the _gas_ path (lowest risk — favors Option C or a same-impl variant of A), or (b) run a one-time **sweep/migration** of balances to new addresses with the phone→wallet registry updated atomically. **Resolve this in Phase 0** — it may push us toward "keep accounts, swap only the paymaster."

---

## 7. Risks & mitigations

- **Paymaster abuse / griefing** → enforce per-user + global daily gas caps, allowlist (only registered Sippy wallets), and amount sanity checks in the paymaster policy (same guarantees GasRefuel's allowlist gave). Monitor the paymaster balance with the same alerting we have for the refuel contract.
- **Provider/bundler outage** → keep GasRefuel dormant-but-deployable as a fallback for one release cycle; env-guard so a missing paymaster key falls back, never bricks sends (daebak's exact pattern).
- **Address migration breaking balances** → §6 caveat; prefer keeping account addresses stable.
- **Arbitrum paymaster support uncertainty** → Phase 0 gate; do not cut over until a provider is confirmed sponsoring on Arbitrum One with acceptable pricing.
- **Spend-permission vs session-key mismatch** → decide whether the backend still acts as spender or moves to ERC-7715 session keys; don't change both gas and authz in the same cutover if avoidable.

---

## 8. What we delete when done

`contracts/gas-refuel/*` (kept in repo, undeployed), `refuel.service.ts`, `gas_refuel_poller.service.ts`, `REFUEL_ADMIN_PRIVATE_KEY` / `REFUEL_CONTRACT_ADDRESS` env, the 30-min poller, and the "refuel contract low balance / unpause" runbook — replaced by one paymaster balance + policy.

---

## Open questions to close in Phase 0

1. Arbitrum One paymaster provider + pricing (Pimlico / Alchemy / Privy-native)?
2. Keep account addresses stable (swap gas only) or migrate accounts (sweep balances)?
3. Keep spender/spend-permission model or adopt session keys (ERC-7715)?
4. Does Privy's server-side flow fit our backend bot execution, or do we drive `viem`/`permissionless` directly with a Privy/CDP signer?

## Sources

- [Privy — Smart wallets (gas sponsorship, paymaster URL, account implementations)](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview)
- [Privy × ZeroDev account abstraction partnership](https://privy.io/blog/zerodev-partnership)
- [Pimlico — using a Privy signer with permissionless.js](https://docs.pimlico.io/guides/how-to/signers/privy)
- [Privy base-paymaster-example (reference)](https://github.com/privy-io/base-paymaster-example)
- Internal: `daebak-markets/apps/web/src/lib/{privy-smart-account,aa-config}.ts`, `/api/paymaster`, `apps/web/docs/PRIVY_INTEGRATION.md`
- Internal: `apps/backend/app/services/{refuel,gas_refuel_poller}.service.ts`, `contracts/gas-refuel/contracts/GasRefuelV2.sol`

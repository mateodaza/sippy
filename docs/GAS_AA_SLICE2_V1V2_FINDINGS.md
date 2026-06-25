# Gas → AA Slice 2 §0 — V1/V2 verification spike (read-only)

**Question (from `GAS_AA_SLICE2_ONBOARD_PLAN.md` §0):** does a real, app-onboarded
**user** smart account (created via `@coinbase/cdp-hooks`, not the SDK) converge to a
public-factory derivation of its owner (**V1**), and can the frontend read that owner
**before** the account deploys (**V2**)? Both pass ⇒ **option A** (self-construct the
deploy `initCode`, sponsor the cold first op). Either fails ⇒ **plan B** (leave the
single first deploy on legacy GasRefuel).

**Status: V1 + V2 GREEN — but that proves *buildability*, not option A end-to-end.**
V1/V2 establish only that we can reconstruct the deploy `initCode` and produce the owner
signature. Whether a sponsored setup yields a permission the backend can **register** and
**send from**, at zero GasRefuel, is **V3 + V4 — NOT YET RUN.** Corrected verdict:
**V1/V2 green ⇒ option A is very likely and the build is de-risked; it is NOT proven
until V3/V4 pass.** One refinement the plan didn't anticipate (a constant second owner)
makes the *build* simpler, not harder.

Read-only throughout: Arbitrum One `eth_call`s + viem address derivation (no funds, no
writes, no prod DB) for V1; `.d.ts` + setup-page inspection for V2. viem pinned
`2.47.2` (== production). Repro: `apps/backend/scripts/spike/offcdp/gate_user_convergence.ts`.

---

## V1 — convergence for real USER accounts (Arbitrum One, 42161)

For each account: `getCode` (deployed) → `ownerCount()` + `ownerAtIndex(i)` →
`toCoinbaseSmartAccount({ owners, version:'1.1' })` (no address override, default
salt 0) → compare derived address to the real account.

**Result: every user account has `ownerCount = 2` and converges ONLY with both owners
in index order. `owners[0]`-alone derivation diverges; `[owners[0], owners[1]]`
converges exactly. 9/9.**

| user account | owner[0] (per-user EOA) | owner[1] | derive([o0]) | derive([o0,o1]) |
|---|---|---|---|---|
| `0x80d6…948A` (the §2-send user) | `0x6f94…314d` | SPM | ❌ `0xF6A2…ccc1` | ✅ == account |
| `0xc363…a15A` | `0x1a83…ca78` | SPM | ❌ | ✅ == account |
| `0x61Bb…2712` | `0xB3Bd…f8CD` | SPM | ❌ | ✅ == account |
| `0x9F28…3BCf` | `0x7759…86DD` | SPM | ❌ | ✅ == account |
| `0x6da2…6ED7` | `0x3c02…16EC` | SPM | ❌ | ✅ == account |
| `0x4678…a56f` | `0x568D…Dcaf` | SPM | ❌ | ✅ == account |
| `0x98de…C0A2` | `0x55A6…7d21` | SPM | ❌ | ✅ == account |
| `0x251a…82b6` | `0xCCA2…8465` | SPM | ❌ | ✅ == account |
| `0x4576…88B3` | `0x2df4…F98B` | SPM | ❌ | ✅ == account |

**The premise-shifting detail: `owner[1]` is CONSTANT across all 9 accounts** —
`0xf85210B21cC50302F477BA56686d2019dC9b67Ad`, which is Sippy's
`SPEND_PERMISSION_MANAGER` (`app/services/gas_aa/config.ts:21`,
`app/services/embedded_wallet.service.ts:50`; "same address on every supported
network"). So every Sippy user wallet is deployed by the **public factory** as a
**2-owner** v1.1 Coinbase Smart Wallet:

```
factory     0xba5ed110efdba3d005bfc882d75358acbbb85842   (canonical CoinbaseSmartWalletFactory)
factoryData createAccount([ userEOA, SpendPermissionManager ], 0)   selector 0x3ffba36f, salt 0
```

This reconciles the §2.0 gate (the spender + throwaway were **single**-owner and
converged on `owner[0]`): those never granted a spend permission, so the SPM is not
one of their owners. User accounts grant a permission at onboarding, so CDP deploys
them with the SPM baked in as `owner[1]` from the start — and that owner is part of
the create2 salt (proven: the address only reproduces when SPM is included).

**Consequence for option A:** the deploy `initCode` is **fully self-reconstructable**
— factory + `createAccount([userEOA, SPM], 0)` — and we need exactly **one** per-user
value (`userEOA`); the second owner is a hardcoded constant. The plan's worry ("can we
read *all* owners pre-deploy?") is moot: there are two, and one is already a constant
we ship.

---

## V2 — owner readable pre-deploy (`@coinbase/cdp-hooks` 0.0.76)

At setup the user account is counterfactual (`ownerAtIndex` doesn't exist yet), so the
owner must come from `cdp-hooks`. Exposed surface (from `dist/types`):

- **`useCurrentUser(): { currentUser: User | null }`** where
  `User = { evmAccounts?: EvmAddress[]; evmSmartAccounts?: EvmAddress[]; … }`
  (cdp-core `types.d.ts:48`). Both are plain address strings.
  - `currentUser.evmAccounts[0]` = the per-user **owner EOA** (== `owner[0]` above).
  - `currentUser.evmSmartAccounts[0]` = the **counterfactual smart-account address**
    (the target / sanity-check).
- **`useSignEvmHash(): { signEvmHash({ evmAccount: EvmAddress, hash: Hex }) → { signature: Hex } }`**
  — signs an arbitrary 32-byte hash (the userOpHash) with a chosen owner EOA. This is
  the "frontend signs" primitive the slice needs; the wallet is 1-of-n so a single
  owner signature is valid (the §2.0 gate confirmed EIP-1271 `isValidSignature` on a
  one-owner CDP sig).
- Also present: `useEvmAddress()`, `useEvmAccounts()`, `useEvmSmartAccounts()`.

**Already exercised in production, pre-deploy:** `apps/web/app/setup/page.tsx` reads
`currentUser.evmSmartAccounts?.[0] || currentUser.evmAccounts?.[0]` right after
`authenticateWithJWT()` (`:530`, `:802`, `:895`) — i.e. **before** `createSpendPermission`
ever deploys anything. So both the owner EOA and the predicted address are in hand at
registration time.

**V2 — inspection-level pass (runtime proof still owed).** The per-user input option A
needs (`evmAccounts[0]`) is readable pre-deploy, and the candidate signer
(`useSignEvmHash`) exists in the package. But this is **type/inspection only**:
`useSignEvmHash` is **not yet used anywhere in this checkout** (setup uses
`useCreateSpendPermission`), so the spike's **V2(b) runtime proof — sign a userOpHash in
the browser, ECDSA-recover, confirm the signer is an owner — has not run**, and moving
signing browser-side is a real refactor (slice 1 signs server-side with the backend CDP
owner). We do **not** need to read "all owners" — the second is the SPM constant.

---

## What V1/V2 prove — and what they don't

**V1/V2 de-risk the BUILD, not option A.** They show we can (i) reconstruct the deploy
`initCode` and (ii) produce the owner signature. They do **not** show that a sponsored
setup yields a permission the backend can register and send from. That is **V3 + V4**,
which have **not run**. Do not declare "option A is real" on V1/V2.

**Banked from V1 (the build is de-risked):**

```
initCode = 0xba5ed110efdba3d005bfc882d75358acbbb85842
           ++ createAccount([ userEOA, SPM=0xf85210…67Ad ], 0)      // selector 0x3ffba36f, salt 0
userEOA  = currentUser.evmAccounts[0]      // per-user; from cdp-hooks, pre-deploy (V2)
SPM      = constant, baked into the deploy salt
sign     = useSignEvmHash({ evmAccount: userEOA, hash: userOpHash })
```

`toCoinbaseSmartAccount({ owners:[userEOA, SPM], version:'1.1' }).getFactoryArgs()`
reproduces it — but the derived address MUST equal the address CDP will actually deploy
to (see V3 step 1).

## V3 + V4 — the deciding gates (NOT YET RUN)

**V3 — sponsored setup → registerable permission.** On a **fresh staging user**, in order:

1. **HARD PREREQUISITE — pre-deploy address convergence.** Every V1 account was
   *post-deploy*; cold-onboard targets a **counterfactual** address. Confirm `cdp-hooks`'
   `evmSmartAccounts[0]` (where CDP will deploy) **== `derive([evmAccounts[0], SPM])`**
   *before any deploy*. If they diverge (e.g. CDP adds the SPM owner at grant-time rather
   than in the deploy initCode), our sponsored deploy lands the wallet at a **different
   address than CDP expects** → broken onboard. This is the make-or-break of "deploy to
   the right address," not a footnote.
2. **Grant mechanism — on-chain call vs EIP-712 sig.** Lead: `useCreateSpendPermission`
   exposes `data: GetUserOperationResult`, i.e. today CDP grants the permission via an
   **on-chain UserOp** (bundled with deploy) — so plan for deploy+grant in one sponsored
   op, and check whether SPM `approveWithSignature` (gasless EIP-712) lets us sponsor only
   the deploy. Resolve before wiring lane ①.
3. **Sponsored setup lands + permission registers.** The setup op lands sponsored
   (account 0 ETH, no refuel) and the backend's `register-permission` accepts the
   resulting on-chain permission.

**V4 — first send + zero-GasRefuel invariant.** After V3, a real send from the freshly
onboarded account works **and** no GasRefuel drip fired anywhere on register→setup→send
(grep `checkAndRefuel` callers; webhook returns `sponsor:true` for the `setup` row).

**Only when V3 + V4 are green is option A proven.** Until then: V1/V2 green ⇒ option A
very likely, build de-risked, verdict pending V3/V4.

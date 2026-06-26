# Gas → AA Slice 2 — Step 0: test-user supply (SETTLED, read-only)

**Question:** V3-proper/V4 need a **signed-in but undeployed** user (owner EOA exists,
smart account counterfactual, setup not completed). Fresh phone numbers are exhausted and
minted-JWT injection "doesn't provision a new user." Find the cheapest reliable supply.
**Report before building.**

All of the below is **read-only**: CDP `listEndUsers`/`getEndUser` (no writes) + Arbitrum One
`eth_getCode` + viem address derivation. Repro scripts in `apps/backend/scripts/spike/offcdp/`:
`find_subject.mjs`, `check_identity.mjs`, `inspect_authmethods.mjs`. Run with
`node --env-file=apps/backend/.env --env-file=apps/web/.env.local <script>`.

## Verdict

- **`+573015269599` is NOT usable** — it is **not provisioned** in the CDP project at all
  (0 matches across all 222 end-users). Its "just authenticated" attempt created nothing
  usable (see the shell-user finding below). No smart account ⇒ cannot be the subject.
- **A ready-made subject already exists — use it (zero new writes):**
  **`+4915121090333`** (CDP userId `ffb3241a-294e-4cae-85bf-db1e2c5b3374`),
  smart account **`0xABD1f3B3b280053F686AF4E20c42358B46821DDC`**.
- **Repeatable supply for iteration: CDP backend-SDK `createEndUser`** (proven API surface;
  permanent — there is **no `deleteEndUser`**, so use sparingly).

## Evidence

### 1. One shared CDP project across local / staging / prod

Local `apps/backend/.env` creds and `railway -e staging -s sippy-backend` creds both list the
**same 222 end-users** and both contain the known slice-1 §2-send wallet
`0x80d6…948A` (userId `d4e3ab90-…`). Web project id `a64ae652-0ccb-498b-a8a8-3ce62aa454c7`
(`apps/web/.env.local`). ⇒ staging operates on this project; **the `+573015269599` negative
is project-wide, not a creds mismatch.** (CDP is shared even though each env has its own
Postgres + the JWT keypair is shared — see [[project_gas_aa_slice2]].)

### 2. Sippy customAuth = CDP `DeveloperJWTAuthentication`

End-user auth methods are `{ type:'jwt', kid:'', sub:'<E164>' }`. **All 212 jwt users have
`kid:''`** (10 are `sms`). They authenticate in prod with Sippy's `kid:'sippy-1'`-signed
tokens, so **CDP matches on `sub`, not `kid`.** `authenticateWithJWT` re-auths an existing
`(sub)` end-user; it does not create the EVM accounts.

### 3. Bare `authenticateWithJWT` on a fresh sub → an **account-less shell**

The mint script's default `+15555550123` exists as userId `3dd66d2b-…` (created today 22:11)
with **`evmAccounts: []`, `evmSmartAccounts: []`**. So a never-seen sub does get an end-user
_record_, but with **no wallet** — not directly usable, and it pollutes the project. This is
the precise shape of "minted-JWT injection doesn't provision a usable user." **Don't rely on
this path.**

### 4. The ready subject `+4915121090333` (created today 13:52)

```
userId           ffb3241a-294e-4cae-85bf-db1e2c5b3374
authMethods      [{ "type":"jwt", "kid":"", "sub":"+4915121090333" }]
owner EOA        0xeEe2fdEF635cD1EE961C6825BEd917525fAbB073   (evmAccounts[0])
smart account    0xABD1f3B3b280053F686AF4E20c42358B46821DDC   (evmSmartAccounts[0])
ownerAddresses   [ 0xeEe2…B073, 0xf85210…67Ad (SPM) ]         ← spend-perms baked in at create
eth_getCode      0x                                           ← UNDEPLOYED (setup not completed)
derive([EOA,SPM])@0 == 0xABD1f3B3…                            ← CONVERGENT, pre-deploy ✅
```

This **directly proves the V3 step-0 HARD GATE on a real counterfactual user** (V1 only had
post-deploy accounts; the prior session inferred it on-chain). Our self-built
`initCode = factory ++ createAccount([0xeEe2…B073, SPM], 0)` lands at exactly the address CDP
will deploy to. It is signed-in-able (mint a JWT with `sub:+4915121090333` → `authenticateWithJWT`
matches this end-user) and **needs zero new CDP writes.**

### 5. `createEndUser` — the repeatable supply (for iteration / if the subject is consumed)

`cdp.endUser.createEndUser({ authenticationMethods:[{ type:'jwt', kid:'', sub:'<throwaway E164>' }],
evmAccount:{ createSmartAccount:true, enableSpendPermissions:true } })` reproduces shape #4
(undeployed, convergent, `[EOA, SPM]` owners). **Permanent** (no delete) and it writes to the
**shared live CDP project** — so mint only what's needed. A successful V3 deploy _consumes_ a
subject (it deploys the account); pre-broadcast failures do **not**, so one subject usually
covers many V3 iterations + the V4 send.

## V3-proper precondition (for when we build — staging DB writes)

`/api/register-permission` (`embedded_wallet_controller.ts:185`) gates on
`findUserPrefByPhone(phone).tosAcceptedAt` (`user_preference.tosAcceptedAt`) and recovers the
permission via **`cdp.evm.listSpendPermissions({ address: walletAddress })`** filtered by
spender + USDC + network + allowance (`:212`), storing `spendPermissionHash` on `phone_registry`.
So before V3-proper, seed on **staging**: a `phone_registry` row + a `user_preference` row
with `tosAcceptedAt` set for the **minted subject** (below) — else a false-negative ToS 403.

## UPDATE — subject pivot: `+4915121090333` is a REAL USER (Pascal); minted a throwaway instead

A backend DB read (read-only, staging + prod) on `+4915121090333` showed a **full real
onboarding footprint on prod, today**: `phone_registry` row (created 13:52, `cdp_wallet_name
embedded-+4915121090333`, `spend_permission_hash null`), `user_preferences` with
`tos_accepted_at 2026-06-25T13:53:25Z` (English), and a real `onchain.refuel_event` of
`50000000000000` wei (the 0.00005 ETH dust = a GasRefuel drip, tx `0x442c0311…`). Mateo
recognized it as **Pascal, an ETH Global attendee who hit the GasRefuel bug live during his
talk** and is now stranded one step before `createSpendPermission`. **It is a real person's
half-onboarded wallet — OFF LIMITS to all spike tooling** (deploy/grant/send _and_ the
sign-proof: minting a JWT for his sub impersonates his session). Pascal is a direct human
follow-up (help him finish setup), not a test subject. Gate 2 did exactly its job — the DB
read + recognition caught a real account before any write. (Bonus: his footprint is the
**cleanest repro** of the bug this slice kills — register → ToS → drip → dead at permission.)

**The V3/V4 subject is now a minted throwaway (genuinely no one's), via `createEndUser`:**

```
userId         spike-gasaa-s2-v3-throwaway-1     ← loud tag (CDP has no delete)
sub / kid      +15550100001 / sippy-1           ← kid MUST be non-empty; createEndUser 400s on ''
owner EOA      0x91e6BBfBB641568243723b0C505254cE0680c46b
smart account  0x00F764516fEDE2C42c43aBa2d2b6186f7A1bcBAA
owners         [ EOA, SPM ]                      ← spend-perms baked in (real-onboard shape)
getCode        0x  (undeployed)   ETH 0  (clean, never dripped)
derive([EOA,SPM])@0 == 0x00F7…    (convergent)
```

This both **validates the `createEndUser` supply method** (reproduces the real-onboard shape)
and gives a subject with a strict-clean V4 baseline (ETH literally 0, no `refuel_event`, so
the invariant is "stays 0 / `gas_refuel_status` delta 0 / no new `refuel_event` for `0x00F7…`").
Mint+validate script: `apps/backend/scripts/spike/offcdp/mint_subject.mjs`. The staging
precondition seed (phone_registry + ToS) is for **`+15550100001`**, never Pascal's number.

## V2(b) browser sign-proof — PASS (runtime, 2026-06-26)

Temp harness `apps/web/app/spike-sign/page.tsx` (DELETE after spike), run against the local
`next dev` on :3000, driven via Claude-in-Chrome. Seeded a minted JWT for the subject
(`+15550100001`) into `localStorage['sippy_jwt']`, then:
`authenticateWithJWT()` → `signEvmHash({ evmAccount: ownerEOA, hash })` → ECDSA-recover.

```
owner EOA          0x91e6BBfBB641568243723b0C505254cE0680c46b
signature          0x77780fafd0c805347f2f4b0134ea3bdef9bbddddbce56968e9dbbfe6ec0fe31…8639ce1b
recovered signer   0x91e6BBfBB641568243723b0C505254cE0680c46b   ==  owner EOA  → PASS
```

**The createEndUser (server-provisioned) subject IS browser-auth + browser-sign capable.**
`useSignEvmHash` is the confirmed V2(b) primitive (sign → recover → owner EOA). Combined with
the backend-sign test (`cdp.evm.signHash`/`getAccount` → `not_found`; end-user EOAs are
non-custodial), this locks V3-proper's architecture: **prepare → browser-sign → submit**, no
backend shortcut.

**Two CDP races to handle in the real setup flow (both hit during the proof):**

1. **"SDK not initialized"** on mount → gate work on `useIsInitialized` before `authenticateWithJWT`.
2. **"User is not authenticated"** immediately after `authenticateWithJWT` resolves → the
   signed-in state lags; wait for `useIsSignedIn` / retry the sign before giving up.
   (`useEvmAddress` returns the smart account `0x00F7…`; `useEvmAccounts` returns the owner EOA.)
   These mirror the production `useSessionGuard` race handling — the implementation's browser
   sign step must do the same.

**Residual to close in implementation (Part B):** the subject is `createEndUser`-provisioned,
whereas a real user is browser-`createOnLogin:'smart'`-provisioned. The sign path converges
(both are browser-only-signable — backend `signHash` → `not_found` on each), so it's a valid
proxy; but the staging Part B validation should still include **one genuinely
frontend-onboarded user** to close that last inch.

## op-build — guardrail 1: exact on-chain permission primitive (captured, read-only)

Source of truth = CDP's **own bundled ABI** (`@coinbase/cdp-sdk/spend-permissions/constants.ts`)

- a live `cdp.evm.listSpendPermissions` read (script `capture_permission.mjs`) — not an invented ABI.

* **SpendPermissionManager** `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` (== the SPM constant from V1).
* **Grant call:** `approve(SpendPermission)` — selector `0x33211c30`.
* **`SpendPermission` tuple** (exact ABI): `address account, address spender, address token,
uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData`.
* **Live field values** (real user, Arbitrum One): `spender=0xb396805f…fbeb1` (Sippy spender),
  `token=0xaf88d065…5831` (USDC), `allowance=100000000` (100 USDC tier), `period=86400`,
  `end=281474976710655` (max uint48), `extraData=0x`, `salt`=random uint256.
  `permissionHash = keccak(struct)` → stored as `phone_registry.spend_permission_hash`.

**RESOLVED 2026-06-26 — the grant is an on-chain `approve` UserOp, self-paid; no gasless path
in the SDK; deploy can't defer.** Decoded 14 real grants for the §2 user `0x80d6…948A` on
Arbitrum One (`decode_grant.mjs`, read-only: `listSpendPermissions` → `SPM.getHash` →
`SpendPermissionApproved` log → `handleOps` decode → `UserOperationEvent`). All 14:
**selector `0x33211c30` `approve`** inside `executeBatch`, **`sender == the user smart account`**,
**`paymasterAndData = 0x` / `UserOperationEvent.paymaster = 0x0` (self-paid)** — zero
`approveWithSignature` (`0xb9ffc8e1`), zero sponsored. The FIRST grant carried **`initCode`
(312 B, public factory `0xba5ed1…5842`) → it DEPLOYED the account in the SAME op as the approve**:
`actualGasUsed = 477,783`. Re-grants on the already-deployed account = bare approve, ~212–214k.

1. **On-chain approve, self-paid (confirms the GasRefuel dependency).** `createSpendPermission`
   (cdp-core@0.0.76 → CDP server API `createSpendPermissionWithEndUserAccount`) submits an
   `approve(perm)` UserOp FROM the user's smart account and returns `{ userOperationHash }`;
   `useCdpPaymaster` defaults `false` and Sippy only sets it when `NETWORK === 'base'`
   (`settings/page.tsx:522`), so on **Arbitrum the approve op is self-paid** → setup runs
   `ensureGasReady()` (GasRefuel drip) BEFORE it (`setup/page.tsx:1142-1158`). That drip is the
   thing slice 2 removes.
2. **No gasless grant in the SDK.** `approveWithSignature` / `approveWithRevoke` /
   `approveBatchWithSignature` exist in the **contract ABI** but NOT as a callable method
   anywhere in `@coinbase/cdp-core`, `@coinbase/cdp-hooks`, or `@coinbase/cdp-api-client@0.0.76`
   (their only spend-perm surface is `create`/`list`/`revoke`SpendPermissionWithEndUserAccount;
   the backend `@coinbase/cdp-sdk` spend-perm actions encode only `spend`). Grant-by-signature
   is possible only by hand-rolling EIP-712 + calling `approveWithSignature` off-SDK.
3. **Deploy can't defer to the first send.** The slice-1 spender op's `sender` is the SPENDER
   (`off_cdp_submitter.getAccount(spenderAddress)`), so its `initCode` could only deploy the
   spender; the `SpendPermission` struct has **no initCode field** (account/spender/token/
   allowance/period/start/end/salt/extraData), and `SPM.spend` calls back into the user account
   (`account.execute`) → the user account must already have code + an approved permission. And
   the only way to approve today is an op FROM the user account, which deploys it — so
   **deploy and grant are inseparable; there is no reachable "undeployed + approved" state.**

⇒ **Slice 2 shape = sponsor the cold `deploy(initCode) + approve(perm)` UserOp** — the exact op
decoded above (initCode + `executeBatch[approve]`, ~478k gas), but with `paymasterAndData` set
(Pimlico) instead of self-paid. GasRefuel on the happy path is replaced by sponsoring that one op.
It **cannot** be done via `createSpendPermission` (CDP server API, `useCdpPaymaster` = CDP's own
paymaster, which per slice-1 doesn't sponsor off Base) — slice 2 must BUILD the op off-CDP like
slice-1 does: `toCoinbaseSmartAccount({ owners:[userEOA, SPM] })` (initCode from the public
factory — convergence proven V1/V3-step0) · calls `[approve(self-built perm struct)]` ·
browser-sign with the user owner EOA (V2(b): `useSignEvmHash`/`signUserOperation`) · Pimlico
bundler + the existing DB-binding webhook. Pimlico policy per-op gas cap must clear ~478k.

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
*record*, but with **no wallet** — not directly usable, and it pollutes the project. This is
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
**shared live CDP project** — so mint only what's needed. A successful V3 deploy *consumes* a
subject (it deploys the account); pre-broadcast failures do **not**, so one subject usually
covers many V3 iterations + the V4 send.

## V3-proper precondition (for when we build — staging DB writes)
`/api/register-permission` (`embedded_wallet_controller.ts:185`) gates on
`findUserPrefByPhone(phone).tosAcceptedAt` (`user_preference.tosAcceptedAt`) and recovers the
permission via **`cdp.evm.listSpendPermissions({ address: walletAddress })`** filtered by
spender + USDC + network + allowance (`:212`), storing `spendPermissionHash` on `phone_registry`.
So before V3-proper, seed on **staging**: a `phone_registry` row (`phoneNumber:+4915121090333`,
`walletAddress:0xABD1f3B3…`) + a `user_preference` row with `tosAcceptedAt` set — else a
false-negative ToS 403. (These are the only writes Step 0 implies; they're staging-only.)

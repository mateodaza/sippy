# Gas → AA — §2.0 CDP-created-account gate + staging validation (CC task)

**The pre-flight that actually unblocks `GAS_AA_ENABLED`.** Two parts: **(A)** a scratch gate script proving off-CDP submission against a _genuinely CDP-created_ smart account, and **(B)** the staging validation. **No product code, no prod flag flip.** Part A is a throwaway script on `spike/gas-phase1`; part B is config + running the existing tests on staging.

## Why this exists (what Phase 1 did NOT prove)

Phase 1's `offcdp_land.ts` built a **public-factory** Coinbase Smart Wallet from a CDP-owned key (`toCoinbaseSmartAccount({ owners })`). The **production** submitter (`gas_aa/off_cdp_submitter.ts → getAccount`) instead targets a **CDP-created** smart account at its **CDP-assigned address** via the stored-address override (`toCoinbaseSmartAccount({ address: sender, owners, version: '1.1' })`) and signs with the account's CDP owner. **That exact path has never validated on-chain.** This gate closes it before the flag flips. (`version: '1.1'` itself is already proven by the Phase 1 land — the open item is the CDP-created account + the address override + the real owner.)

## Part A — the gate script (`apps/backend/scripts/spike/offcdp/gate_cdp_smart_account.ts`, scratch)

1. Create a **throwaway CDP _smart account_** via CDP's own smart-account creation API (e.g. `cdp.evm.getOrCreateSmartAccount` / `createSmartAccount` with an owner — **NOT** `createAccount`, which is just an owner EOA). This is a real CDP factory deploy → a CDP-assigned address + a CDP owner.
2. Build a UserOp via the **production path**: `toCoinbaseSmartAccount({ client, address: <cdpSmartAccount.address>, owners: [wrap(cdpOwner)], version: '1.1' })`.
   - Assert `account.address === cdpSmartAccount.address` (the override took).
   - Also derive the account **without** `address` and assert it **differs** from the CDP address — proving CDP's factory ≠ the public factory (the whole reason the override exists). If they're equal, flag it (unexpected).
3. Sign with the CDP owner; sponsor via Pimlico (`PIMLICO_SPONSORSHIP_POLICY_ID` in the paymaster context); submit via the **Pimlico bundler** (off-CDP). Use a harmless op — a self-call / no-op or a tiny `createSpendPermission` — **no real value**.
4. Land it on **Arbitrum One**; assert the account held ~0 ETH before AND after (Pimlico paid). Print the userOp/tx hash.

**Pass = the op lands sponsored against the CDP-created account at its CDP address.** If it fails (especially **AA24 signature**), **STOP and report** — the production signing path is wrong, and the flag must not flip.

## Part B — staging validation (before any prod canary)

1. Set on **staging**: `PIMLICO_API_KEY`, `PIMLICO_WEBHOOK_SECRET`, `PIMLICO_SPONSORSHIP_POLICY_ID` (an Arbitrum One / 42161 policy with per-account + global caps), register the webhook URL `POST /webhook/pimlico/sponsorship` in that policy, and the staging RPC envs.
2. **Confirm `'sippy-spender-owner'` is the real spender's `ownerAtIndex(0)`** (read it on-chain). If it isn't, sponsorship fails — and because a signature rejection is post-`prepared` there's **no legacy fallback**, so the send fails rather than degrades. This must be right.
3. Flip `GAS_AA_ENABLED=true` on **staging only**. Run a **real spender free-send** (small amount). Confirm: logs show the **AA-sponsored** path (not "legacy fallback"), the op lands, the **spender's ETH is unchanged** (no refuel), and the user's USDC actually moved.
4. Run the safety/negative checks against staging: the webhook rejects (no matching row / unregistered `decoded_user` / non-allowlisted recipient / over-cap / bad signature); two concurrent sends don't collide on a nonce (one takes the next or fails clean); the reconciler recovers an op killed after `prepared`; and **flag-off ⇒ legacy still works**.

**Only after A and B are both green** → consider a prod canary flip (small % first).

## Constraints

Throwaway CDP accounts + tiny/no funds; **never the real spender or user funds** in Part A; prod DB read-only; scratch script lives on `spike/gas-phase1`; **no product-code change, no prod flag flip in this task.** Report back the Part A tx hash(es) + the Part B staging-send evidence (and the negative-test results) for audit before the flag is flipped anywhere in prod.

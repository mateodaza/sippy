---

## Phase 2 §2.0 gate — CDP-created-account acceptance: ✅ CLOSED on ARBITRUM ONE (2026-06-25)

The full production path landed sponsored on **Arbitrum One (42161)** against a genuinely CDP-created smart account, EntryPoint v0.6, account **0 ETH before and after**, **no AA24**. Script: `scripts/spike/offcdp/gate_cdp_smart_account.ts` (on `spike/gas-phase1`; viem pinned **2.47.2 == production**). Verified on-chain (op2 success through EntryPoint v0.6; account deployed 61-byte proxy at 0 wei).

- CDP smart account `0x0d6a9Fdff7F5551812FB332279CE07b403fbf5C8`.
- **op1** — sponsored deploy+exec via the public-factory initCode (no funder, 0 ETH): tx `0x36110e6e822b494bab587028529279587eb501ca592744965c94436aaa852034`.
- **op2** — sponsored exec via the **production stored-address override + CDP-owner signing** (deployed, no initCode): tx `0x0f9cec2b9d3ad91a104d169f792799cb9b8e17107c2d11ea96438ce6c19438cd`. `account.address == CDP address`, on-chain `ownerAtIndex(0) == CDP owner`.
- **AA24 also confirmed read-only:** EIP-1271 `isValidSignature` on the **deployed real spender** `0xb396805f…` returned `0x1626ba7e` for a CDP-owner sig built via the override account — the exact production signing path validates against the actual production account, no spend.

**Premise-flipping finding — CONVERGENCE, not divergence.** On Arbitrum One a CDP smart account's address **EQUALS** viem's `toCoinbaseSmartAccount({ owners, version:'1.1' })` derivation of its owner — verified for a throwaway AND the real spender, under viem **2.47.2 and 2.53.1**. So CDP smart accounts ARE standard public-factory v1.1 Coinbase Smart Wallets; the production stored-address override targets the same address viem would derive — **correct but not "load-bearing"** as the prompt assumed. The earlier Base Sepolia "divergence" (0xBaa08200… ≠ 0xC0bb5b9c…) did **not** reproduce here — treat it as a base-sepolia/stale artifact, not a CDP-factory difference. Two consequences:

- **Slice-1 nit:** `off_cdp_submitter.getAccount`'s divergence `logger.warn` (fires when derived == stored) would now fire on every spender build. Flipped to the useful invariant — warn when derived **!=** stored (a genuinely load-bearing, non-public-factory account). Override kept.
- **Cold-onboard (§2.3) unlock:** because CDP accounts are public-factory-derivable from their owner, a brand-new user's account can be cold-deployed via self-constructed public-factory initCode through the off-CDP **sponsored** path (exactly as op1 did, 0 ETH, no funder) — potentially **option A directly** (fully-sponsored cold onboarding, zero gas on registration) without waiting on CDP to expose initCode. Verify at the cold-onboard slice: (1) a _user_ account from `cdp-hooks` converges the same way, (2) a counterfactual user's owner address is readable.

**Earlier proxy (Base Sepolia, superseded):** `scripts/spike/offcdp/gate_cdp_account.ts` landed the same shape on Base Sepolia (tx `0xf1e3c204…`, account `0xBaa08200…`) when Arbitrum funding was the blocker — kept for history; the Arbitrum One land above is the closing proof.

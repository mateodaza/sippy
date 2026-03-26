# Wallet Architecture

Last updated: March 26, 2026

## Overview

Sippy uses Coinbase CDP Embedded Wallets. Each user has one CDP smart account
(CoinbaseSmartWallet, ERC-4337) on Arbitrum One. The smart account holds USDC
and optionally ETH for gas.

## Accounts per User

When a user completes setup, CDP creates:

1. **EOA signer** -- a private key held in CDP's TEE (Trusted Execution Environment).
   The user never interacts with this directly. Available via `useEvmAccounts()` in the browser.
2. **Smart account** -- a CoinbaseSmartWallet contract owned by the EOA signer + CDP co-signer.
   This is the user's wallet address. Holds USDC and ETH. Available via `evmSmartAccountObjects`.

The backend stores the smart account address in `phone_registry.wallet_address`.

## Two Send Modes (Web Wallet)

### Free Gas (spender path)

- User selects "Gas gratis" / "Free gas" in the wallet UI
- Frontend calls `POST /api/send` on the backend
- Backend uses the Sippy spender smart account + SpendPermissionManager to move USDC
- **Sippy pays gas** -- the spender account covers ETH fees
- **Daily limit applies** -- $500/day for verified users, $50 for unverified
- Velocity checks enforced (rate, volume, fan-out)
- This is the same path used by WhatsApp sends

### Direct (user gas, no limit)

- User selects "Directo" / "Direct" in the wallet UI
- Frontend calls `sendUserOperation` via CDP hooks directly from the user's smart account
- **User pays gas** -- requires ETH in the smart account
- **No daily limit** -- the user signs the transaction themselves
- Sippy's infrastructure never touches the funds
- This is the non-custodial path -- no compliance exposure for Sippy

### Why limits only on the spender path

The spender moves funds on the user's behalf (Sippy's wallet signs the on-chain tx).
Limits protect against: stolen sessions, phishing, social engineering.

Direct mode is pure self-custody -- the user's own key signs via CDP's TEE.
Imposing limits would contradict the non-custodial thesis. If a user moves millions
via Direct mode, Sippy has no compliance exposure because Sippy never touched the funds.

## Wallet Drift Detection

### What is drift

Drift occurs when the backend's stored wallet address (`phone_registry.wallet_address`)
doesn't match the CDP smart account address returned by `evmSmartAccountObjects` in the
browser. This means the user's browser session controls a different wallet than what
the backend knows about.

### Why it happened (March 2026)

Sippy migrated from CDP SMS auth to JWT custom auth. CDP treated these as different
identity types and created separate users with separate wallets for the same phone number:

- **SMS user** (created Jan 2026): EOA `0xDF88..`, Smart `0x1f31..` (held funds)
- **JWT user** (created Mar 2026): EOA `0x6f94..`, Smart `0x80d6..` (empty)

The browser authenticated as the JWT user but the backend still pointed to the SMS
user's wallet. Result: funds stuck in the old wallet, sends failing.

### How it was fixed

1. Deleted old `phone_registry` entries for affected users (only 2: Mateo + Carlos)
2. Users re-ran `/setup` which registered the JWT smart account in the backend
3. No real users were affected (SMS auth was never released to production)

### How it's prevented

- **Drift detection on every page load**: the wallet page compares `eoaAddress` (from
  backend) with `smartAccountAddress` (from CDP hooks). If they differ:
  - Yellow warning banner displayed
  - Send button disabled
  - Console warning logged with both addresses
- **Diagnostic script**: `scripts/debug-cdp-drift.ts` lists all CDP end users and
  flags any phone number with multiple CDP identities

## CRITICAL: JWT Identity Stability

CDP maps users by the JWT `sub` claim + `kid` (key ID). If either changes,
CDP creates a NEW user with a NEW wallet. The old wallet's funds become
inaccessible from the browser.

**Never change:**

- The JWT `sub` format (must stay as the canonical E.164 phone number, e.g. `+573116613414`)
- The RS256 signing key without migrating users (rotation = new `kid` = new CDP identity)
- The JWKS endpoint URL configured in CDP Portal
- The JWT issuer claim

**If you must rotate the signing key:**

1. Run `scripts/debug-cdp-drift.ts` to check for drift BEFORE and AFTER
2. Add the new key to JWKS alongside the old one (overlap period)
3. Test with a zero-balance user first
4. Monitor for drift warnings in production logs

**Lesson learned (March 2026):** Migrating from CDP SMS auth to JWT custom auth
created duplicate users because CDP treats `sms:+57xxx` and `jwt:+57xxx` as
different identities. This locked funds in the old wallet for 2 users (dev team only).

## Fund Security Audit (March 26, 2026)

### Can funds get lost?

| Scenario                         | Risk   | Mitigation                                                                |
| -------------------------------- | ------ | ------------------------------------------------------------------------- |
| Wallet drift (addresses diverge) | Medium | Drift detection blocks sends, warning banner shown                        |
| User sends to wrong address      | Low    | Self-send protection, phone resolution via backend                        |
| Spender drains user wallet       | Low    | SpendPermission has daily cap (on-chain), velocity checks (server)        |
| Stolen JWT session               | Medium | "Free gas" path capped at $500/day; "Direct" requires ETH (extra barrier) |
| CDP key compromise               | Low    | Keys in TEE, CDP co-signer required for smart account operations          |
| Backend DB corruption            | Low    | Wallet address is verified against CDP on each session via JWT middleware |

### Balance display accuracy

- Uses fresh local variables in fetch callback (not stale React state closure)
- `walletBalances` derived from `smartBalances ?? eoaBalances`
- When addresses match (normal case): fetched once, reused
- When addresses differ (drift): fetched separately, drift warning shown
- ETH balance displayed when > 0 (informs "Direct" mode availability)

### What the user sees vs what happens

| User action     | UI shows                        | On-chain signer              | Limit    |
| --------------- | ------------------------------- | ---------------------------- | -------- |
| "Free gas" send | "Gas gratis via Sippy"          | Sippy spender wallet         | $500/day |
| "Direct" send   | "Directo -- tu gas, sin limite" | User's smart account via CDP | None     |
| WhatsApp send   | (not in web UI)                 | Sippy spender wallet         | $500/day |

### Smart account ownership

Each CoinbaseSmartWallet has two owners:

1. The user's EOA (created by CDP, key in TEE)
2. CDP's co-signer (`0xf852..67Ad`) -- required for all operations

The SpendPermissionManager is authorized to call `execute()` on the smart account
only when a valid spend permission has been created during setup. The permission
specifies: token (USDC), allowance (500 USDC), period (1 day), spender (Sippy's
smart account).

### Scripts

- `scripts/debug-cdp-accounts.ts` -- lists all CDP end users for a phone number
- `scripts/debug-cdp-drift.ts` -- detects dual-user drift across all users, can
  test transfers between old and new smart accounts

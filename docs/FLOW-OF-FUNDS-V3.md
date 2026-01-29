# Sippy Flow of Funds

**Document Purpose:** This document explains how money moves through Sippy for lawyers, regulators, and potential partners.

**Key Takeaway:** Sippy is a **non-custodial orchestration layer**. Users own their wallets and keys. Sippy only coordinates transactions within user-approved spending limits and **does not perform KYC, custody funds, or process fiat currency**.

---

## Executive Summary

| Aspect                | Description                                           |
| --------------------- | ----------------------------------------------------- |
| **Custody Model**     | Non-custodial (users own their keys via Coinbase CDP) |
| **Asset**             | USDC (USD-backed stablecoin)                          |
| **Network**           | Arbitrum (Ethereum L2)                                |
| **User Interface**    | WhatsApp                                              |
| **Wallet Provider**   | Coinbase Developer Platform (CDP)                     |
| **Permission System** | Onchain Spend Permissions                             |
| **Fiat Operations**   | Handled entirely by third-party providers             |

---

## Responsibility Matrix

> **Critical Distinction:** Sippy is an orchestration layer that connects users to services. Sippy does not custody funds, perform KYC, or process fiat transactions.

| Function                          | Responsible Party                              | Sippy's Role                                     |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| **Wallet Creation & Key Storage** | Coinbase CDP                                   | None - user interacts directly with CDP          |
| **Private Key Custody**           | User (via Coinbase TEE)                        | None - no access to keys                         |
| **KYC/Identity Verification**     | Third-party on/off-ramp providers              | None - Sippy does not collect or verify identity |
| **Fiat to Crypto (On-Ramp)**      | Third-party providers (e.g., Transak, MoonPay) | Provides user's wallet address only              |
| **Crypto to Fiat (Off-Ramp)**     | Third-party providers                          | Provides user's wallet address only              |
| **P2P USDC Transfers**            | User (via spend permission)                    | Executes within user-defined limits              |
| **Spending Limit Enforcement**    | SpendPermissionManager smart contract          | Submits transactions; contract enforces rules    |
| **Transaction Records**           | Arbitrum blockchain                            | Queries and displays to user                     |

---

## Flow of Funds Diagram

![Flow of Funds Diagram](https://i.imgur.com/AG0lnuG.png)

---

## Flow Summary

| Stage            | What Happens                      | Who Handles KYC?       | Who Handles Funds?   | Sippy's Role            |
| ---------------- | --------------------------------- | ---------------------- | -------------------- | ----------------------- |
| **Onboarding**   | Wallet creation, spend permission | N/A                    | Coinbase CDP         | UI/UX only              |
| **P2P Transfer** | USDC moves between users          | N/A (crypto-to-crypto) | Smart contract       | Command relay           |
| **On-Ramp**      | Fiat → USDC                       | Third-party provider   | Third-party provider | Provides wallet address |
| **Off-Ramp**     | USDC → Fiat                       | Third-party provider   | Third-party provider | Provides wallet address |

---

## KYC Responsibility Clarification

> **Sippy does not perform, require, or store KYC information.**

### On-Ramp / Off-Ramp KYC

| Scenario                                 | KYC Performed By     | Sippy's Involvement |
| ---------------------------------------- | -------------------- | ------------------- |
| Small on-ramp (under provider threshold) | Provider may waive   | None                |
| Large on-ramp (above provider threshold) | Third-party provider | None                |
| Any off-ramp                             | Third-party provider | None                |

**How it works:**

1. User requests to add funds or cash out via WhatsApp
2. Sippy provides a link to the third-party provider's interface
3. User interacts **directly** with the provider
4. Provider performs any required KYC according to **their** compliance requirements
5. Provider processes the fiat transaction
6. Sippy is not involved in the KYC or fiat processing

**Key points:**

- KYC requirements are determined by the third-party provider, not Sippy
- KYC data is collected and stored by the provider, not Sippy
- Sippy has no visibility into user KYC status or identity documents
- Provider compliance is governed by the provider's licenses and jurisdiction

### P2P Transfer Compliance (Future)

For crypto-to-crypto transfers, Sippy may implement **KYT (Know Your Transaction)** screening:

- Automated wallet risk scoring (no user friction)
- Sanctions list checking
- This is **transaction monitoring**, not identity verification
- No personal data collected

---

## Detailed Flow Explanation

### 1. User Onboarding (One-Time Setup)

![User Onboarding Flow](https://i.imgur.com/uCBeyFT.png)

**Responsibility breakdown:**
| Action | Responsible Party |
|--------|-------------------|
| SMS verification | Coinbase CDP |
| Wallet creation | Coinbase CDP |
| Key generation & storage | Coinbase CDP (in TEE) |
| Spend permission signature | User (via Coinbase) |
| Permission storage | Arbitrum blockchain |
| UI/UX | Sippy |

---

### 2. Sending Money (P2P Transfer)

![Sending Money Flow](https://i.imgur.com/vvatgST.png)

**Responsibility breakdown:**
| Action | Responsible Party |
|--------|-------------------|
| Command parsing | Sippy |
| Limit enforcement | SpendPermissionManager (smart contract) |
| Fund movement | USDC contract on Arbitrum |
| Transaction finality | Arbitrum blockchain |

**What Sippy cannot do:**

- Move funds beyond user-set limits (contract rejects)
- Access user's private keys (stored in Coinbase TEE)
- Reverse completed transactions (blockchain is immutable)

---

### 3. On-Ramp / Off-Ramp (Third-Party Provider)

![On-Ramp Off-Ramp Flow](https://i.imgur.com/RjiJbpX.png)

**Responsibility breakdown:**
| Action | Responsible Party | Sippy's Role |
|--------|-------------------|--------------|
| KYC verification | Third-party provider | None |
| KYC data storage | Third-party provider | None |
| Fiat processing | Third-party provider | None |
| Compliance/licensing | Third-party provider | None |
| USDC transfer | User / Provider | None |
| Wallet address | User (via Sippy UI) | Provides address only |

---

## Custody Model: Detailed Breakdown

### What "Non-Custodial" Means for Sippy

> Sippy **never** has custody, control, or access to user funds or private keys.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTODY RESPONSIBILITY                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COINBASE CDP PROVIDES:                                         │
│  • Private key generation                                       │
│  • Key storage in Trusted Execution Environment (TEE)           │
│  • Transaction signing (user-authorized only)                   │
│  • Key export functionality (user can self-custody anytime)     │
│                                                                 │
│  USER CONTROLS:                                                 │
│  • Private keys (stored in Coinbase TEE, exportable)            │
│  • Spending limits (user sets, can change or revoke anytime)    │
│  • Permission to Sippy (explicit, revocable, time-limited)      │
│  • Wallet funds (user's smart account holds USDC)               │
│                                                                 │
│  SIPPY PROVIDES:                                                │
│  • WhatsApp interface for commands                              │
│  • Command parsing and validation                               │
│  • Transaction submission (within user-approved limits)         │
│  • Gas subsidies for new users                                  │
│                                                                 │
│  SIPPY DOES NOT HAVE:                                           │
│  ✗ Access to user private keys                                  │
│  ✗ Ability to move funds beyond user-set limits                 │
│  ✗ Ability to transfer without onchain permission               │
│  ✗ Ability to prevent user from exporting keys                  │
│  ✗ Ability to freeze, seize, or block user funds                │
│  ✗ Custody of user funds at any point                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Spend Permissions: Limited, Revocable Authorization

Users grant Sippy a **limited permission** to execute transfers—this is **not custody**:

| Property             | Description                            |
| -------------------- | -------------------------------------- |
| **Amount limited**   | Cannot exceed user-defined daily limit |
| **Token limited**    | Applies only to USDC, not other assets |
| **Time limited**     | Permission has explicit expiration     |
| **Revocable**        | User can revoke instantly via settings |
| **Onchain enforced** | Smart contract rejects any violation   |

**Analogy:** This is similar to giving a utility company permission to auto-debit your bank account up to a certain amount—the utility doesn't have custody of your bank account; they have limited, revocable authorization.

### Custodial vs. Sippy's Non-Custodial Model

| Custodial Model                 | Sippy's Non-Custodial Model                    |
| ------------------------------- | ---------------------------------------------- |
| Company holds your private keys | User holds keys in Coinbase TEE                |
| Company can move all your funds | Smart contract limits Sippy to user-set amount |
| Company can freeze your account | User can revoke Sippy access anytime           |
| You must trust the company      | Smart contract enforces rules trustlessly      |
| Keys not exportable             | User can export keys to self-custody anytime   |
| Company performs KYC            | Third-party providers perform KYC              |

---

## Deployed Contracts

| Contract                   | Address                                      | Purpose                         |
| -------------------------- | -------------------------------------------- | ------------------------------- |
| **SpendPermissionManager** | `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` | Enforces user spending limits   |
| **USDC**                   | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Circle's stablecoin on Arbitrum |
| **GasRefuel**              | `0xE4e5474E97E89d990082505fC5708A6a11849936` | Sippy's gas subsidy contract    |
| **Sippy Spender**          | `0xB396805F4C4eb7A45E237A9468FB647C982fBeb1` | Sippy's execution wallet        |

All contracts are deployed on **Arbitrum Mainnet** (Chain ID: 42161).

---

## Regulatory Positioning Summary

| Factor                 | Sippy's Position                                                         |
| ---------------------- | ------------------------------------------------------------------------ |
| **Custody**            | Non-custodial — Coinbase CDP holds keys in TEE; users can export anytime |
| **Money transmission** | Sippy does not hold, transmit, or process fiat currency                  |
| **KYC/AML**            | Sippy does not perform KYC; third-party providers handle compliance      |
| **User consent**       | Explicit onchain permission with user-defined, revocable limits          |
| **Audit trail**        | All transactions recorded on public blockchain                           |
| **User control**       | Full — export keys, revoke permissions, change limits anytime            |

---

## Appendix: Technical Details

### Spend Permission Structure

```solidity
struct SpendPermission {
    address account;    // User's wallet
    address spender;    // Sippy's spender wallet
    address token;      // USDC address
    uint160 allowance;  // Max per period (e.g., $100)
    uint48 period;      // Period in seconds (86400 = 1 day)
    uint48 start;       // Permission start time
    uint48 end;         // Permission end time
    uint256 salt;       // Unique identifier
    bytes extraData;    // Additional data
}
```

### Gas Costs

| Operation               | Typical Cost |
| ----------------------- | ------------ |
| Create spend permission | ~$0.02       |
| Transfer USDC           | ~$0.04       |
| Revoke permission       | ~$0.01       |

---

_Document Version: 3.0_
_Last Updated: January 2026_
_Network: Arbitrum Mainnet_

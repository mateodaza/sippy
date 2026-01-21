# Sippy Flow of Funds

**Document Purpose:** This document explains how money moves through Sippy for lawyers, regulators, and potential partners.

**Key Takeaway:** Sippy is a **non-custodial** platform. Users own their wallets and keys. Sippy only orchestrates transactions within user-approved spending limits.

---

## Executive Summary

| Aspect | Description |
|--------|-------------|
| **Custody Model** | Non-custodial (users own their keys) |
| **Asset** | USDC (USD-backed stablecoin) |
| **Network** | Arbitrum (Ethereum L2) |
| **User Interface** | WhatsApp |
| **Wallet Provider** | Coinbase Developer Platform (CDP) |
| **Permission System** | Onchain Spend Permissions |

---

## Flow of Funds Diagram

```mermaid
---
config:
  layout: elk
---
flowchart TB
    User[User] --> Action{Action}

    Action -->|New user| Onboard
    Action -->|Send money| Transfer
    Action -->|Add funds or Cash out| Ramp

    subgraph Onboard["1. ONBOARDING (No KYC)"]
        O1[Phone number] --> O2[SMS verification]
        O2 --> O3[ToS and consent]
        O3 --> O4[PIN/Passkey setup]
        O4 --> O5[Non-custodial wallet created]
        O5 --> O6[User sets spending limit]
        O6 --> O7[Keys stored in TEE - user owns]
    end

    subgraph Transfer["2. P2P TRANSFER (No KYC, No Key Access)"]
        T1[User sends via WhatsApp] --> T2[Sippy validates request]
        T2 --> T3[KYT screening - future]
        T3 --> T4[Spend permission executes]
        T4 --> T5[Smart contract enforces limit]
        T5 --> T6[USDC transferred to recipient]
        TNote[Sippy never touches private keys]
    end

    subgraph Ramp["3. ON/OFF-RAMP (Fiat Provider)"]
        direction TB
        D1{Direction}
        D1 -->|Buy USDC| OnRamp
        D1 -->|Cash out| OffRamp

        subgraph OnRamp[On-Ramp]
            OA{Amount}
            OA -->|Small| OB[No KYC needed]
            OA -->|Large| OC{KYC Status}
            OC -->|Not verified| OD[KYC verification]
            OC -->|Already verified| OE[Skip KYC]
            OB --> OF[Provider]
            OD --> OF
            OE --> OF
            OF --> R2[USDC in wallet]
        end

        subgraph OffRamp[Off-Ramp - KYC Always Required]
            XA{KYC Status}
            XA -->|Not verified| XB[KYC verification]
            XA -->|Already verified| XC[Skip KYC]
            XB --> XD[Provider]
            XC --> XD
            XD --> X2[Fiat to bank]
        end

        Note[KYC reused across large on-ramps and all off-ramps]
    end

    Onboard --> User
    R2 --> User
    T6 --> User
    X2 --> User
```

![Flow of Funds Diagram](https://i.imgur.com/FNT4URR.png)

### Flow Summary

| Stage | What Happens | KYC Required? | Fee |
|-------|--------------|---------------|-----|
| **Onboarding** | Phone verification, ToS consent, PIN/passkey setup, wallet creation, spend permission | No | Free |
| **P2P Transfer** | Send USDC via WhatsApp | No | Free (gas sponsored) |
| **On-Ramp (small)** | Fiat to USDC | No (under ~$500) | 1.25% |
| **On-Ramp (large)** | Fiat to USDC | Yes (reusable) | 1.25% |
| **Off-Ramp** | USDC to Fiat | Yes (reusable) | 1.25% |

### KYC/KYT Strategy

| Stage | KYC Required? | KYT Screening? | Notes |
|-------|---------------|----------------|-------|
| **Onboarding** | No | No | Phone verification only |
| **P2P Transfer** | No | Yes (future) | Crypto-to-crypto, KYT for compliance |
| **On-Ramp (small)** | No | No | Under ~$500 threshold |
| **On-Ramp (large)** | Yes (reusable) | No | Above threshold, KYC stored |
| **Off-Ramp** | Yes (reusable) | No | Always required (fiat regulations) |

**KYC Reuse Strategy:**
- User completes KYC once (either on large on-ramp or first off-ramp)
- Same KYC applies to all future large on-ramps and off-ramps
- KYC cost (~$1) is only charged once per user
- Provider stores verification status for seamless future transactions

**KYT (Know Your Transaction) - Future:**
- Screens P2P transfers for sanctioned addresses
- Checks wallet risk scores before transfers
- No user friction (automated background check)
- Required for regulatory compliance in some jurisdictions

**Why this works:**
- Onboarding is frictionless (60 seconds, phone only)
- Small on-ramp transactions don't require KYC
- P2P transfers between users never require KYC (but KYT screens wallets)
- KYC done once, reused for all fiat operations

---

## Detailed Flow Explanation

### 1. User Onboarding (One-Time Setup)

```mermaid
sequenceDiagram
    participant User
    participant WhatsApp
    participant Sippy as Sippy Backend
    participant Web as sippy.lat/setup
    participant CDP as Coinbase CDP
    participant Chain as Arbitrum

    User->>WhatsApp: "start"
    WhatsApp->>Sippy: Forward message
    Sippy->>WhatsApp: Setup link
    WhatsApp->>User: "Click to setup: sippy.lat/setup"

    User->>Web: Open setup page
    Web->>CDP: Request SMS OTP
    CDP->>User: SMS with 6-digit code
    User->>Web: Enter code
    Web->>CDP: Verify OTP
    CDP->>CDP: Create Embedded Wallet
    Note over CDP: Keys stored in TEE<br/>Only user can access

    Web->>User: "Set daily spending limit"
    User->>Web: Select $100/day
    Web->>CDP: Create spend permission
    CDP->>Chain: Store permission onchain
    Chain->>Chain: SpendPermissionManager records:<br/>- User wallet<br/>- Sippy spender<br/>- $100/day limit

    Web->>Sippy: Register wallet & permission
    Sippy->>WhatsApp: "Setup complete!"
    WhatsApp->>User: Ready to use Sippy
```

**Key Points:**
- User's private keys are created and stored in Coinbase's Trusted Execution Environment (TEE)
- Sippy **never** has access to user's private keys
- User explicitly approves a spending limit (e.g., $100/day)
- Permission is stored onchain and enforced by smart contract

---

### 2. Sending Money (Daily Usage)

```mermaid
sequenceDiagram
    participant UserA as User A (Sender)
    participant WA as WhatsApp
    participant Sippy as Sippy Backend
    participant Spender as Sippy Spender Wallet
    participant SPM as SpendPermissionManager
    participant USDC as USDC Contract
    participant UserB as User B (Recipient)

    UserA->>WA: "send $10 to +573001234567"
    WA->>Sippy: Forward message

    Sippy->>Sippy: Parse command<br/>Validate recipient exists
    Sippy->>Sippy: Check User A's permission<br/>$10 ≤ $100 remaining? ✓

    Sippy->>Spender: Execute transfer

    Note over Spender,USDC: ATOMIC TRANSACTION (all-or-nothing)

    Spender->>SPM: spend(permission, $10)
    SPM->>SPM: Verify:<br/>- Spender is authorized ✓<br/>- Amount within limit ✓<br/>- Permission not expired ✓
    SPM->>USDC: transferFrom(UserA, Spender, $10)
    USDC->>USDC: Debit User A: -$10
    USDC->>USDC: Credit Spender: +$10

    Spender->>USDC: transfer(UserB, $10)
    USDC->>USDC: Debit Spender: -$10
    USDC->>USDC: Credit User B: +$10

    Note over Spender,USDC: END ATOMIC TRANSACTION

    Sippy->>WA: "Sent $10 to +573001234567"
    WA->>UserA: Confirmation + receipt link

    Sippy->>WA: "You received $10 from +573009876543"
    WA->>UserB: Notification + receipt link
```

**Key Points:**
- Sippy can only move funds **within user-approved limits**
- Smart contract enforces limits - not Sippy
- Both transfers happen atomically (both succeed or both fail)
- Sippy Spender wallet holds funds for **milliseconds** during transfer
- All transactions are recorded on public blockchain

---

### 3. Gas Fee Subsidy (New Users)

```mermaid
sequenceDiagram
    participant User
    participant Sippy as Sippy Backend
    participant Refuel as GasRefuel Contract
    participant Chain as Arbitrum

    User->>Sippy: Complete wallet setup
    Sippy->>Chain: Check user's ETH balance
    Chain->>Sippy: Balance: 0 ETH

    Sippy->>Refuel: refuel(userAddress)
    Refuel->>Refuel: Check:<br/>- User balance < 0.00005 ETH ✓<br/>- Daily limit not exceeded ✓<br/>- Cooldown passed ✓
    Refuel->>User: Send 0.0001 ETH

    Note over User: User now has ETH<br/>to pay for future<br/>transaction fees
```

**Key Points:**
- Sippy subsidizes gas fees for new users
- GasRefuel contract has rate limits (3 refuels/day per user)
- User receives a small ETH subsidy for transaction fees (amount configurable)
- This is a one-time subsidy, not ongoing

---

## Roles & Responsibilities

### Users (Wallet Owners)

| Responsibility | Description |
|----------------|-------------|
| **Own their keys** | Private keys stored in Coinbase TEE, exportable anytime |
| **Set spending limits** | User chooses daily limit (e.g., $100/day) |
| **Approve permissions** | Explicit onchain approval required |
| **Can revoke anytime** | User can disable Sippy access instantly |
| **Full control** | User can export keys and use wallet elsewhere |

### Sippy (Platform Operator)

| Responsibility | Description |
|----------------|-------------|
| **User interface** | WhatsApp bot for commands |
| **Command processing** | Parse and validate user requests |
| **Permission execution** | Execute transfers within user limits |
| **Gas subsidies** | Fund small gas amounts for new users |
| **Receipt generation** | Provide transaction confirmations |

**What Sippy CANNOT do:**
- Access user's private keys
- Move funds beyond approved limits
- Transfer without user's permission
- Block users from exporting keys
- Reverse completed transactions

### Coinbase CDP (Infrastructure)

| Responsibility | Description |
|----------------|-------------|
| **Key management** | Store keys in Trusted Execution Environment |
| **Wallet creation** | Create embedded wallets via SDK |
| **Transaction signing** | Sign transactions when user approves |
| **SMS authentication** | Verify user identity via phone |

### Arbitrum Blockchain (Settlement Layer)

| Responsibility | Description |
|----------------|-------------|
| **Transaction finality** | Immutable record of all transfers |
| **Permission enforcement** | SpendPermissionManager contract |
| **Asset custody** | USDC held in user's smart account |

---

## Deployed Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **SpendPermissionManager** | `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` | Enforces user spending limits |
| **USDC** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Circle's stablecoin on Arbitrum |
| **GasRefuel** | `0xE4e5474E97E89d990082505fC5708A6a11849936` | Sippy's gas subsidy contract |
| **Sippy Spender** | `0xB396805F4C4eb7A45E237A9468FB647C982fBeb1` | Sippy's execution wallet |

All contracts are deployed on **Arbitrum Mainnet** (Chain ID: 42161).

---

## Custody & Compliance Summary

### Non-Custodial Model

```
┌─────────────────────────────────────────────────────────────┐
│                    WHO CONTROLS WHAT                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USER CONTROLS:                                             │
│  ✓ Private keys (stored in Coinbase TEE, user-exportable)  │
│  ✓ Spending limits (user sets and can change anytime)      │
│  ✓ Permission to Sippy (user can revoke anytime)           │
│  ✓ Wallet funds (user's smart account holds USDC)          │
│                                                             │
│  SIPPY CONTROLS:                                            │
│  ✓ WhatsApp interface                                       │
│  ✓ Command processing                                       │
│  ✓ Spender wallet (only for executing approved transfers)  │
│  ✓ Gas subsidy funds                                        │
│                                                             │
│  SIPPY CANNOT:                                              │
│  ✗ Access user private keys                                 │
│  ✗ Move funds beyond user-set limits                        │
│  ✗ Transfer without onchain permission                      │
│  ✗ Prevent user from exporting keys                         │
│  ✗ Freeze or seize user funds                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Regulatory Considerations

| Factor | Sippy's Position |
|--------|------------------|
| **Custody** | Non-custodial - users hold their own keys |
| **Money transmission** | Sippy does not hold or transmit user funds |
| **User consent** | Explicit onchain permission with user-defined limits |
| **Audit trail** | All transactions on public blockchain |
| **User control** | Full - can export keys, revoke permissions anytime |

---

## How Non-Custodial Works: Smart Wallets & TEE

### What Makes Sippy Non-Custodial?

Sippy uses **Coinbase Embedded Wallets** with **Spend Permissions** - a system where:

1. **Users own their private keys** - stored in a Trusted Execution Environment (TEE)
2. **Sippy has NO access to keys** - only permission to spend within user-defined limits
3. **Smart contracts enforce limits** - not Sippy's backend

### Smart Wallet Architecture

Each user gets a **Smart Account** (ERC-4337 contract wallet):

```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S SMART WALLET                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │   Private Key   │    │      Smart Account           │   │
│  │   (EOA Owner)   │───▶│   (Contract Wallet)          │   │
│  │                 │    │                              │   │
│  │  Stored in TEE  │    │  • Holds USDC balance        │   │
│  │  User controls  │    │  • Executes transactions     │   │
│  │  Exportable     │    │  • Enforces spend limits     │   │
│  └─────────────────┘    └──────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why two addresses per user?**
- **EOA (Externally Owned Account)**: The underlying private key that controls the wallet
- **Smart Account**: A contract wallet that provides advanced features (spend permissions, batch transactions)

### Trusted Execution Environment (TEE)

Private keys are stored in Coinbase's **TEE** - a secure hardware enclave:

| Property | Description |
|----------|-------------|
| **Isolation** | Keys are isolated from Coinbase's systems |
| **User-only access** | Only the user (via PIN/passkey) can authorize transactions |
| **Exportable** | Users can export keys anytime to self-custody |
| **No Sippy access** | Sippy cannot read, copy, or use the private keys |

### Spend Permissions: How Sippy Can Move Funds

Users grant Sippy a **limited, revocable permission** to spend on their behalf:

```
┌─────────────────────────────────────────────────────────────┐
│                    SPEND PERMISSION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User grants permission:                                    │
│  "Sippy can spend UP TO $100/day from my wallet"            │
│                                                             │
│  ┌─────────────┐         ┌─────────────────────────┐       │
│  │  User's     │ ──────▶ │  SpendPermissionManager │       │
│  │  Signature  │         │  (Smart Contract)       │       │
│  └─────────────┘         └─────────────────────────┘       │
│                                   │                         │
│                                   ▼                         │
│  Stored onchain with:                                       │
│  • Spender address (Sippy)                                  │
│  • Daily limit ($100)                                       │
│  • Token (USDC only)                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key security properties:**

| Property | Protection |
|----------|------------|
| **Amount limited** | Sippy cannot exceed user-defined daily limit |
| **Token limited** | Permission only applies to USDC, not other assets |
| **Time limited** | Permission expires after set period |
| **Revocable** | User can revoke anytime via settings page |
| **Onchain enforced** | Smart contract rejects any violation |

### Transfer Execution Flow

When a user sends money via WhatsApp:

```
User says "send $10"
        │
        ▼
┌───────────────────┐
│   Sippy Backend   │ ◀── Does NOT have user's private key
│   (Orchestrator)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────┐
│              SpendPermissionManager Contract              │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  1. Verify Sippy is authorized spender       ✓           │
│  2. Verify $10 ≤ daily limit remaining       ✓           │
│  3. Verify permission not expired            ✓           │
│  4. Pull $10 USDC from user's wallet                     │
│  5. Transfer $10 USDC to recipient                       │
│                                                           │
│  If ANY check fails → Transaction reverts                │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Why This Is Non-Custodial

| Custodial Model | Sippy's Non-Custodial Model |
|-----------------|----------------------------|
| Company holds your private keys | User holds keys in TEE |
| Company can move all your funds | Sippy limited to user-set amount |
| Company can freeze your account | User can revoke Sippy access anytime |
| You must trust the company | Smart contract enforces rules trustlessly |
| Keys not exportable | User can export keys anytime |

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

### Atomic Transfer Execution

Each USDC transfer creates **two token movements** in one atomic transaction:

1. **User → Spender**: SpendPermissionManager.spend() pulls USDC from user
2. **Spender → Recipient**: USDC.transfer() sends USDC to recipient

Both happen in the same transaction - if either fails, both are reverted.

### Gas Costs

| Operation | Typical Cost |
|-----------|--------------|
| Create spend permission | ~$0.02 |
| Transfer USDC | ~$0.04 |
| Revoke permission | ~$0.01 |

Gas is paid in ETH. New users receive a small ETH subsidy from Sippy's GasRefuel contract.

**Future Gas Optimizations:**
- Current subsidy amount is configurable and may be reduced based on usage patterns
- Paymaster integration could eliminate user gas costs entirely
- Base (Coinbase L2) offers native gas sponsorship via CDP, but Sippy is currently on Arbitrum for ecosystem reasons
- Migration to paymaster or alternative chain remains an option as the platform scales

---

*Document last updated: January 2026*
*Network: Arbitrum Mainnet*
*Version: 1.0*

# Implementation Plan - SIPPY

## 🎯 Overview

This document outlines the remaining implementation work to complete SIPPY's gasless payment experience and Avail Nexus integration for ETHOnline 2025.

---

## 📊 Current Status

### ✅ What's Working

1. **WhatsApp Bot**

   - `/start` - Wallet creation
   - `/balance` - Check PYUSD balance
   - `/send [amount] to [phone]` - Transfer PYUSD
   - Message parsing and natural language understanding

2. **Wallet Management**

   - Coinbase CDP Server Wallets v2 integration
   - Non-custodial wallets per phone number
   - Persistent storage in `wallets.json`
   - Secure key management via TEE

3. **PYUSD Transfers**

   - Arbitrum mainnet transfers
   - Contract address: `0x46850aD61C2B7d64d08c9C754F45254596696984`
   - Transaction confirmation and explorer links

4. **Security**
   - Daily spending limits
   - Activity tracking
   - Last reset date per user

---

## 🚧 Phase 2: Gasless Experience

### 2.1 Gas Refuel Contract on Arbitrum

**Objective**: Deploy a smart contract on Arbitrum that automatically tops up users' ETH for gas when needed.

**Contract: `GasRefuel.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GasRefuel is Ownable, Pausable, ReentrancyGuard {
    // Minimum ETH balance before refuel is needed
    uint256 public constant MIN_BALANCE = 0.00001 ether; // ~3 PYUSD transfers

    // Amount to refuel (enough for ~25 PYUSD transfers)
    uint256 public constant REFUEL_AMOUNT = 0.00001 ether;

    // Maximum refuels per user per day
    uint256 public constant MAX_DAILY_REFUELS = 1;

    // Cooldown between refuels (1 hour)
    uint256 public constant REFUEL_COOLDOWN = 1 hours;

    // Tracking
    mapping(address => uint256) public lastRefuelTime;
    mapping(address => uint256) public dailyRefuelCount;
    mapping(address => uint256) public lastResetDay;

    // Events
    event Refueled(address indexed user, uint256 amount, uint256 timestamp);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor() {
        // Contract starts paused until funded
        _pause();
    }

    // Deposit ETH to the contract
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    // Main refuel function (called by backend)
    function refuel(address user) external onlyOwner whenNotPaused nonReentrant {
        require(user != address(0), "Invalid user address");
        require(address(this).balance >= REFUEL_AMOUNT, "Insufficient contract balance");
        require(user.balance < MIN_BALANCE, "User balance sufficient");

        // Reset daily counter if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            dailyRefuelCount[user] = 0;
            lastResetDay[user] = currentDay;
        }

        // Check cooldown
        require(
            block.timestamp >= lastRefuelTime[user] + REFUEL_COOLDOWN,
            "Cooldown active"
        );

        // Check daily limit
        require(
            dailyRefuelCount[user] < MAX_DAILY_REFUELS,
            "Daily limit reached"
        );

        // Update state
        lastRefuelTime[user] = block.timestamp;
        dailyRefuelCount[user]++;

        // Transfer ETH
        (bool success, ) = payable(user).call{value: REFUEL_AMOUNT}("");
        require(success, "Transfer failed");

        emit Refueled(user, REFUEL_AMOUNT, block.timestamp);
    }

    // Batch refuel (gas optimization)
    function batchRefuel(address[] calldata users) external onlyOwner whenNotPaused nonReentrant {
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            if (user.balance < MIN_BALANCE && address(this).balance >= REFUEL_AMOUNT) {
                // Skip validation checks for batch (optimistic execution)
                (bool success, ) = payable(user).call{value: REFUEL_AMOUNT}("");
                if (success) {
                    emit Refueled(user, REFUEL_AMOUNT, block.timestamp);
                }
            }
        }
    }

    // Emergency withdraw
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(owner(), balance);
    }

    // Admin functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // View functions
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function canRefuel(address user) external view returns (bool) {
        if (paused()) return false;
        if (address(this).balance < REFUEL_AMOUNT) return false;
        if (user.balance >= MIN_BALANCE) return false;

        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            return true; // New day, counter reset
        }

        if (dailyRefuelCount[user] >= MAX_DAILY_REFUELS) return false;
        if (block.timestamp < lastRefuelTime[user] + REFUEL_COOLDOWN) return false;

        return true;
    }
}
```

**Tasks:**

- [ ] Create Hardhat project structure
- [ ] Write and test contract
- [ ] Deploy to Arbitrum mainnet
- [ ] Verify contract on Arbiscan
- [ ] Fund contract with initial ETH (~0.1 ETH)

---

### 2.2 Backend Refuel Service

**File: `backend/src/services/refuel.service.ts`**

```typescript
import { ethers } from 'ethers';

const REFUEL_CONTRACT_ADDRESS = '0x...'; // After deployment
const REFUEL_ABI = [...]; // Contract ABI

export class RefuelService {
  private contract: ethers.Contract;
  private provider: ethers.providers.Provider;

  constructor() {
    const rpcUrl = process.env.ARBITRUM_RPC_URL;
    const adminKey = process.env.REFUEL_ADMIN_PRIVATE_KEY;

    this.provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
      chainId: 42161,
      name: 'arbitrum',
    });

    const signer = new ethers.Wallet(adminKey, this.provider);
    this.contract = new ethers.Contract(
      REFUEL_CONTRACT_ADDRESS,
      REFUEL_ABI,
      signer
    );
  }

  async checkAndRefuel(userAddress: string): Promise<boolean> {
    try {
      // Check if user needs refuel
      const canRefuel = await this.contract.canRefuel(userAddress);
      if (!canRefuel) {
        console.log(`User ${userAddress} doesn't need refuel`);
        return false;
      }

      // Execute refuel
      console.log(`Refueling ${userAddress}...`);
      const tx = await this.contract.refuel(userAddress);
      await tx.wait();

      console.log(`✅ Refueled! Tx: ${tx.hash}`);
      return true;
    } catch (error) {
      console.error('Refuel failed:', error);
      return false;
    }
  }

  async getContractBalance(): Promise<string> {
    const balance = await this.contract.contractBalance();
    return ethers.utils.formatEther(balance);
  }
}
```

**Integration Points:**

- Call `checkAndRefuel()` before each PYUSD transfer in `cdp-wallet.service.ts`
- Add `/refuel` command to WhatsApp bot (optional manual trigger)
- Monitor contract balance and alert when low

**Tasks:**

- [ ] Create `refuel.service.ts`
- [ ] Integrate with `cdp-wallet.service.ts`
- [ ] Add error handling and logging
- [ ] Test with real transactions

---

## 🌉 Phase 3: Avail Nexus Integration

### 3.1 "Fund My Phone" Feature

**Objective**: Allow anyone with a wallet to send ETH/PYUSD to a phone number from any supported chain using Avail Nexus SDK.

**Frontend Page: `/fund`**

**User Flow:**

1. User visits `/fund`
2. Connects wallet (MetaMask, WalletConnect)
3. Enters recipient phone number
4. Selects token (ETH, USDC, PYUSD) and amount
5. Selects source chain (Base, Ethereum, Polygon, etc.)
6. Clicks "Fund Phone Number"
7. Nexus SDK:
   - Bridges tokens from source chain → Arbitrum
   - Transfers to recipient's phone-linked wallet
8. Shows transaction confirmation

**Technology:**

- Avail `nexus-core` package (headless SDK)
- `wagmi` + `connectkit` for wallet connection
- React hooks for state management

**Key Components:**

```typescript
// components/FundPhone.tsx
import { NexusSDK } from '@avail-project/nexus-core';
import { useAccount } from 'wagmi';

export function FundPhone() {
  const { address, isConnected } = useAccount();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('ETH');
  const [loading, setLoading] = useState(false);

  const handleFund = async () => {
    // 1. Get recipient address from phone via API
    const recipientAddress = await fetch(`/api/resolve-phone?phone=${phone}`);

    // 2. Initialize Nexus SDK
    const sdk = new NexusSDK({ network: 'mainnet' });
    await sdk.initialize(window.ethereum);

    // 3. Execute bridge & transfer
    const result = await sdk.bridgeAndExecute({
      token,
      amount,
      toChainId: 42161, // Arbitrum
      recipient: recipientAddress,
      waitForReceipt: true,
    });

    // 4. Show success
    if (result.success) {
      alert(`Sent ${amount} ${token} to ${phone}!`);
    }
  };

  return (
    <div>
      <h1>Fund a Phone Number</h1>
      <input
        placeholder='+57...'
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        placeholder='Amount'
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select value={token} onChange={(e) => setToken(e.target.value)}>
        <option>ETH</option>
        <option>USDC</option>
        <option>PYUSD</option>
      </select>
      <button onClick={handleFund} disabled={!isConnected || loading}>
        {loading ? 'Sending...' : 'Fund Phone'}
      </button>
    </div>
  );
}
```

**Backend API:**

```typescript
// backend/src/routes/resolve-phone.ts
app.get('/api/resolve-phone', async (req, res) => {
  const { phone } = req.query;

  // Get wallet address for phone number
  const wallet = await getOrCreateWallet(phone);

  res.json({ address: wallet.address });
});
```

**Tasks:**

- [ ] Create `/fund` page with form
- [ ] Integrate `wagmi` + `connectkit` for wallet connection
- [ ] Add `nexus-core` SDK initialization
- [ ] Implement `bridgeAndExecute` flow
- [ ] Create `/api/resolve-phone` endpoint
- [ ] Add transaction status tracking
- [ ] Design UI/UX (keep it simple and clean)
- [ ] Test cross-chain bridging
- [ ] Add error handling and user feedback

---

### 3.2 Documentation for Avail Prize

**File: `AVAIL_INTEGRATION.md`**

Document how Nexus SDK is used:

- SDK initialization with wallet provider
- Bridge & Execute flow
- Cross-chain intent demonstration
- Screenshots/video of demo
- Code snippets showing meaningful use

**Tasks:**

- [ ] Create documentation file
- [ ] Record demo video
- [ ] Take screenshots
- [ ] Add to README

---

## 📝 Additional Tasks

### Documentation

- [ ] Update frontend README
- [ ] Add API documentation
- [ ] Create deployment guide
- [ ] Write testing guide

### Testing

- [ ] Test refuel contract on Arbitrum
- [ ] Test WhatsApp bot end-to-end
- [ ] Test "Fund My Phone" with real tokens
- [ ] Verify all error cases

### Deployment

- [ ] Deploy refuel contract to Arbitrum
- [ ] Configure backend environment variables
- [ ] Deploy frontend to Vercel
- [ ] Set up monitoring/alerts

### Optional Enhancements

- [ ] Transaction history in WhatsApp
- [ ] Group payments
- [ ] Payment requests
- [ ] Multi-currency support

---

## 🎯 Priority Order

1. **HIGH**: Gas Refuel Contract + Backend Integration

   - Critical for gasless UX
   - Straightforward implementation
   - Enables core value prop

2. **HIGH**: "Fund My Phone" with Avail Nexus

   - Required for Avail prize eligibility
   - Demonstrates cross-chain capabilities
   - Adds unique feature

3. **MEDIUM**: Documentation & Testing

   - Needed for hackathon submission
   - Shows thoroughness
   - Helps judges understand project

4. **LOW**: Optional Enhancements
   - Nice to have but not critical
   - Can be added post-hackathon

---

## ⏱️ Estimated Timeline

**Day 1: Gas Refuel (4-6 hours)**

- Contract development and testing: 2 hours
- Deployment and verification: 1 hour
- Backend integration: 2 hours
- Testing: 1 hour

**Day 2: Avail Integration (6-8 hours)**

- Frontend setup (wagmi, connectkit): 2 hours
- Nexus SDK integration: 3 hours
- API endpoint: 1 hour
- UI/UX polish: 2 hours
- Testing and debugging: 2 hours

**Day 3: Polish & Submit (4-6 hours)**

- Documentation: 2 hours
- Demo video: 1 hour
- Final testing: 2 hours
- Submission: 1 hour

---

## 🚀 Ready to Build!

The architecture is solid, the plan is clear. Time to execute! 💪

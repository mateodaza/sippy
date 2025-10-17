# SIPPY - WhatsApp Payments with PYUSD

**Gasless crypto payments via WhatsApp using Coinbase CDP Server Wallets and PYUSD on Arbitrum**

---

## 🎯 Vision

SIPPY enables **anyone with a phone number** to send and receive PYUSD (PayPal USD stablecoin) without:

- Installing wallets
- Buying ETH for gas
- Understanding blockchain

Just send a WhatsApp message: `send 5 to +573001234567`

---

## ✨ Current Features

### 1. **WhatsApp Bot Integration**

- Commands: `/start`, `/balance`, `/send [amount] to [phone]`
- Natural language processing for payments
- Real-time transaction notifications

### 2. **Gasless Wallet Creation**

- Each phone number gets a **non-custodial Coinbase CDP Server Wallet**
- Private keys secured in Trusted Execution Environment (TEE)
- Users never manage keys or seed phrases

### 3. **PYUSD Transfers on Arbitrum**

- Send PYUSD to any phone number (creates wallet if needed)
- Transactions confirmed in seconds
- Arbitrum explorer links for transparency

### 4. **Security & Limits**

- Daily spending limits per user
- Activity tracking
- Persistent storage in `wallets.json`

---

## 🏗️ Architecture

```
┌─────────────┐
│  WhatsApp   │
│    User     │
└──────┬──────┘
       │ Message: "send 5 to +57..."
       ▼
┌─────────────────────────────────┐
│   Backend (Node.js/TypeScript)  │
│                                 │
│  ┌──────────────────────────┐  │
│  │  WhatsApp Service        │  │
│  │  (message parsing)       │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │  CDP Wallet Service      │  │
│  │  (create, send PYUSD)    │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │ Coinbase CDP SDK v2      │  │
│  │ (Server Wallets + TEE)   │  │
│  └────────┬─────────────────┘  │
└───────────┼─────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   Arbitrum    │
    │   Mainnet     │
    │               │
    │  PYUSD Token  │
    └───────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js v20+
- pnpm
- Coinbase Developer Platform (CDP) API credentials

### Backend Setup

1. **Install dependencies**

```bash
cd backend
pnpm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Required environment variables:

```env
# Coinbase CDP v2 Credentials
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
CDP_WALLET_SECRET=your_wallet_secret

# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WEBHOOK_VERIFY_TOKEN=your_verify_token

# RPC Endpoints
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
```

3. **Run the backend**

```bash
pnpm dev
```

### Frontend Setup (Basic Demo)

```bash
cd frontend
pnpm install
pnpm dev
```

---

## 📱 Usage Examples

### Create Wallet

```
User: /start
Bot:  Welcome! Your wallet is ready.
      Address: 0x5Aa5...bcde4
      Balance: 0 PYUSD
```

### Check Balance

```
User: /balance
Bot:  Balance: 10.5 PYUSD
      Address: 0x5Aa5...bcde4
```

### Send PYUSD

```
User: send 5 to +573001234567
Bot:  ✅ Sent 5 PYUSD to +573001234567
      Tx: 0xabc123...
      View: https://arbiscan.io/tx/0xabc123...
```

---

## 🔐 Security Model

### Wallet Security

- **Coinbase CDP Server Wallets**: Private keys stored in Coinbase's Trusted Execution Environment (TEE)
- **No seed phrases**: Users can't lose their keys
- **Server signing**: All transactions signed by CDP infrastructure

### User Protection

- Daily spending limits (configurable per user)
- Transaction confirmations required
- Activity logging and monitoring
- Rate limiting on commands

### Data Storage

- `wallets.json`: Phone → wallet address mapping (no private keys!)
- CDP handles all key material securely
- Local storage for metadata only

---

## 🛠️ Technology Stack

### Backend

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js
- **Blockchain SDK**: Coinbase CDP SDK v2
- **HTTP Client**: Axios
- **Package Manager**: pnpm

### Blockchain

- **Network**: Arbitrum Mainnet
- **Token**: PYUSD (0x46850aD61C2B7d64d08c9C754F45254596696984)
- **Wallet Infrastructure**: Coinbase CDP Server Wallets v2

### Frontend (Demo)

- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm

---

## 📋 Roadmap & Next Steps

### Phase 1: Core Features (Current)

- ✅ WhatsApp bot integration
- ✅ Wallet creation per phone number
- ✅ PYUSD transfers on Arbitrum
- ✅ Balance queries
- ✅ Daily spending limits

### Phase 2: Gasless Experience

- ✅ **Gas Refuel Contract**: Deployed on Arbitrum (`0xC8367a549e05D9184B8e320856cb9A10FDc1DE46`)
- ✅ **Automatic refuel**: Works! Detects balance < 0.00001 ETH and auto-funds before each PYUSD transfer
- ✅ **Tested in production**: Successfully refueled and sent PYUSD in complete flow test
- ✅ **"Fund My Phone"**: Frontend with Avail Nexus SDK for cross-chain ETH bridging

#### Fund My Phone (Cross-Chain ETH Bridge) 🆕

**Send gas to any phone number from ANY supported blockchain!**

**Features:**

- 🔗 **Unified Balance**: Aggregates ETH from Ethereum, Optimism, Base, Polygon & Arbitrum
- 🤖 **Smart Routing**: Automatically selects best source chain for lowest fees
- 🌍 **Professional Phone Input**: Country picker with auto-formatting (+57 311...)
- 🎯 **Simple UX**: Just phone number + transaction count (1, 5, 10, or 20 tx)
- 🔐 **Clear Wallet Connection**: Choose between MetaMask, Coinbase Wallet, WalletConnect

**How to Use:**

1. Go to http://localhost:3000/fund
2. **Connect wallet** - clear modal shows all supported wallets
3. **Enter phone** - use country picker to select code
4. **Choose gas amount** - pick how many transactions (auto-calculates ETH)
5. **Sign once** - clear message explains what you're signing
6. **Done!** - ETH arrives on Arbitrum in ~30 seconds

**Setup:**

```bash
# Frontend
cd frontend
pnpm install
pnpm dev  # runs on http://localhost:3000

# Backend (must be running)
cd backend
pnpm start  # runs on http://localhost:3001

# Environment variables
# Frontend: Create .env.local (optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Backend: Uses existing .env (no changes needed)
```

**Testing:**  
See `frontend/TESTING.md` for detailed testing guide and QA checklist.

**PYUSD Bridge Research:**

- See `PYUSD-RESEARCH.md` for cross-chain options
- See `PYUSD-MAINNET-ARBITRUM.md` for Ethereum→Arbitrum implementation plan

### Phase 3: Advanced Features (Planned)

- ⏳ Multi-currency support (USDC, USDT)
- ⏳ Group payments and splits
- ⏳ Recurring payments
- ⏳ Payment requests
- ⏳ Transaction history in WhatsApp

---

## 🏆 EthGlobal ETHOnline 2025

### Tracks & Prizes

**Avail - Unified Gas Refuel**

- Using Avail Nexus SDK for cross-chain ETH bridging
- "Fund My Phone" feature: Send ETH/PYUSD to a phone number from any chain
- Meaningful use of Bridge & Execute functionality

**Coinbase - CDP Server Wallets**

- Non-custodial wallets for every phone number
- Gasless UX with server-side signing
- PYUSD transfers on Arbitrum

**PayPal - PYUSD Integration**

- Native PYUSD stablecoin for payments
- Arbitrum mainnet deployment
- WhatsApp as payment interface

---

## 📚 Documentation

- [Developer Notes (2025-10-16)](./DEV-NOTES-2025-10-16.md) - Current state and next steps
- [Project Status](./PROJECT-STATUS.md) - What's working, what's next
- [GasRefuel Implementation](./GASREFUEL_IMPLEMENTATION.md) - Complete guide for gas refuel system
- [Backend Refuel Setup](./backend/REFUEL_SETUP.md) - Backend integration guide
- [Contract Documentation](./contracts/gas-refuel/README.md) - Smart contract details

---

## 🤝 Contributing

This is a hackathon project for ETHOnline 2025.

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details

---

## 🔗 Links

- [Coinbase CDP Docs](https://docs.cdp.coinbase.com/)
- [Avail Nexus Docs](https://docs.availproject.org/nexus)
- [Arbitrum Explorer](https://arbiscan.io/)
- [PYUSD on Arbitrum](https://arbiscan.io/token/0x46850aD61C2B7d64d08c9C754F45254596696984)

---

**Built with ❤️ for ETHOnline 2025**

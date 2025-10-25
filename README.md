# Sippy - WhatsApp Payments with PYUSD

**Gasless crypto payments via WhatsApp using Coinbase CDP Server Wallets and PYUSD on Arbitrum**

---

## 🎯 Vision

Sippy enables **anyone with a phone number** to send and receive PYUSD (PayPal USD stablecoin) without:

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

- Each phone number gets a **Coinbase CDP Server Wallet**
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

Create a `.env` file in the backend directory using the template:

```bash
cp ENV-TEMPLATE.txt .env
```

Required environment variables:

```env
# WhatsApp Business API (Meta)
# Get these from: https://developers.facebook.com/apps/
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token_here
WHATSAPP_VERIFY_TOKEN=sippy_hackathon_2025

# Sippy WhatsApp Number (for onboarding links)
# Your Sippy bot's WhatsApp number in international format without + (e.g., 573001234567)
SIPPY_WHATSAPP_NUMBER=573001234567

# Coinbase CDP SDK v2
# Get these from: https://portal.cdp.coinbase.com/
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
CDP_WALLET_SECRET=your_wallet_secret_ec_private_key

# LLM Natural Language Processing (Optional - FREE tier)
# Set to 'false' to disable LLM and use regex-only parsing
USE_LLM=true

# Groq API (FREE tier - only needed if USE_LLM=true)
# Get free API key from: https://console.groq.com
# Note: Bot works perfectly without this (falls back to exact command matching)
GROQ_API_KEY=your_groq_api_key_here

# Arbitrum Network RPC
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Gas Refuel Contract (Optional - for auto gas coverage)
# Deploy contract from /contracts/gas-refuel first
REFUEL_CONTRACT_ADDRESS=0xYourGasRefuelContractAddress
REFUEL_ADMIN_PRIVATE_KEY=0xYourPrivateKeyWithFunds

# Database (Railway PostgreSQL)
# Get this from Railway dashboard → Postgres service → Variables tab
DATABASE_URL=postgresql://postgres:password@region.railway.app:port/railway

# Server Configuration
PORT=3001
NODE_ENV=production

# Frontend URLs (for bot messages)
RECEIPT_BASE_URL=https://www.sippy.lat/receipt/
FUND_URL=https://www.sippy.lat/fund

# Optional: Demo Features
WHATSAPP_BUTTONS=true
DEMO_SHOW_REFUEL=true
```

3. **Run the backend**

```bash
pnpm dev
```

### Frontend Setup

1. **Install dependencies**

```bash
cd frontend
pnpm install
```

2. **Configure environment**

Create a `.env.local` file in the frontend directory:

```bash
cp ENV-TEMPLATE.txt .env.local
```

Required environment variables:

```bash
# Backend API Connection
BACKEND_URL=http://localhost:3001
# In production: BACKEND_URL=https://backend.sippy.lat

# Base URL (for API routes)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
# In production: NEXT_PUBLIC_BASE_URL=https://www.sippy.lat

# Refuel Admin Wallet (Optional - for gas refueling functionality)
REFUEL_ADMIN_PRIVATE_KEY=0x...your_admin_private_key

# RPC URLs
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Avail Nexus Configuration
AVAIL_NETWORK=mainnet

# Blockscout API (for transaction data and activity)
NEXT_PUBLIC_BLOCKSCOUT_API_KEY=your_blockscout_api_key
NEXT_PUBLIC_BLOCKSCOUT_BASE_URL=https://arbitrum.blockscout.com/api/v2
```

> **Note**: The `REFUEL_ADMIN_PRIVATE_KEY` should match the backend's admin key if using gas refueling.

3. **Run the frontend**

```bash
pnpm dev  # runs on http://localhost:3000
```

> **See also**: `frontend/ENV-SETUP.md` for detailed environment configuration and production deployment instructions.

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

- wallets for every phone number
- Gasless UX with server-side signing
- PYUSD transfers on Arbitrum

**PayPal - PYUSD Integration**

- Native PYUSD stablecoin for payments
- Arbitrum mainnet deployment
- WhatsApp as payment interface

---

## 📚 Documentation

- [Project Status](./PROJECT-STATUS.md) - What's working, what's next
- [Backend Refuel Setup](./backend/REFUEL_SETUP.md) - Backend integration guide
- [Contract Documentation](./contracts/gas-refuel/README.md) - Smart contract details

---

## 🤝 Contributing

This is a hackathon project for ETHOnline 2025.

---

## 🔗 Links

- [Coinbase CDP Docs](https://docs.cdp.coinbase.com/)
- [Avail Nexus Docs](https://docs.availproject.org/nexus)
- [Arbitrum Explorer](https://arbiscan.io/)
- [PYUSD on Arbitrum](https://arbiscan.io/token/0x46850aD61C2B7d64d08c9C754F45254596696984)

---

**Built with ❤️ for ETHOnline 2025**

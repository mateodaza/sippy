# 💸 SIPPY - WhatsApp Payments with PYUSD

**Send money via WhatsApp using PYUSD on Arbitrum!**

Built for **EthGlobal Hackathon 2025** 🏆

---

## 🚀 **What is SIPPY?**

SIPPY is a **WhatsApp-native payment system** that allows users to:
- ✅ **Create crypto wallets instantly** via WhatsApp messages
- 💰 **Send PYUSD** to friends using simple commands like `"send 5 to +57XXX"`
- 📱 **Check balances** with `"balance"` command
- 🔐 **Secure infrastructure** powered by Coinbase CDP Server Wallets

**No app downloads, no complex setup - just WhatsApp! 📱**

---

## 🏗️ **Architecture**

```
WhatsApp Message → SIPPY Backend → CDP Server Wallet → Arbitrum Mainnet → PYUSD
```

### **Tech Stack:**
- **Backend**: Express.js + TypeScript + Coinbase CDP SDK
- **Frontend**: Next.js 15 + React 19 + TailwindCSS  
- **Blockchain**: Arbitrum Mainnet (where PYUSD lives)
- **Wallet**: Coinbase CDP Server Wallet v2
- **Integration**: WhatsApp Cloud API + Meta Webhooks

---

## 📱 **User Flow**

1. **User sends**: `"start"` to SIPPY WhatsApp number
2. **SIPPY creates**: Instant crypto wallet on Arbitrum
3. **User receives**: Wallet address + instructions
4. **User can**:
   - `"balance"` - Check PYUSD balance
   - `"send 5 to +573116613414"` - Send money to friends
   - `"help"` - Show all commands

**Everything happens in WhatsApp - no external apps needed! 🎉**

---

## 🛠️ **Setup & Development**

### **Prerequisites:**
- Node.js 18+
- pnpm
- Coinbase CDP API credentials
- WhatsApp Business API access
- ngrok (for webhook testing)

### **Backend Setup:**

```bash
cd backend
pnpm install
cp .env.example .env
```

**Configure `.env` with:**
```bash
# WhatsApp API
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
WHATSAPP_VERIFY_TOKEN=sippy_hackathon_2025
PHONE_NUMBER_ID=your_phone_number_id

# Coinbase CDP
CDP_API_KEY_NAME=your_cdp_key_name
CDP_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END EC PRIVATE KEY-----"

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
```

**Run Backend:**
```bash
pnpm dev
```

### **Frontend Setup:**

```bash
cd frontend  
pnpm install
pnpm dev
```

**Visit**: http://localhost:3000

---

## 🧪 **Testing**

### **Webhook Testing:**
```bash
# Terminal 1: Start backend
cd backend && pnpm dev

# Terminal 2: Expose to internet
ngrok http 3001

# Terminal 3: Test webhook
curl -X POST http://localhost:3001/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "573116613414",
            "text": {"body": "start"}
          }]
        }
      }]
    }]
  }'
```

### **WhatsApp Commands:**
- `start` - Create wallet
- `balance` - Check PYUSD balance  
- `send 5 to +573116613414` - Send money
- `help` - Show commands

---

## 📊 **Current Status**

### ✅ **Completed:**
- ✅ **Backend**: Express server with webhook handling
- ✅ **CDP Integration**: Server Wallet v2 working on Arbitrum
- ✅ **Wallet Management**: Create + reuse wallets per phone number
- ✅ **WhatsApp Integration**: Receiving and sending messages
- ✅ **Commands**: start, balance, send, help implemented
- ✅ **Frontend**: Clean demo landing page
- ✅ **Security**: Daily/transaction limits, session management

### 🚧 **In Progress:**
- 🔧 **WhatsApp Permissions**: Add phone numbers to allowed list
- 🧪 **End-to-end Testing**: With real PYUSD transactions  
- 📱 **Demo Polish**: Screenshots and presentation materials

---

## 🎯 **Prize Targets**

This project targets these **EthGlobal 2025** prizes:
- 🥇 **PayPal - PYUSD Integration Prize**
- 🏆 **Arbitrum - Best L2 Application** 
- 🎖️ **Coinbase - CDP Integration Prize**
- ⭐ **Best Consumer Application**

---

## 🔐 **Security Features**

- 🛡️ **CDP Server Wallet**: Private keys secured by Coinbase TEE
- ⏰ **Session Management**: 24-hour session expiry
- 💰 **Spending Limits**: $500 daily, $100 per transaction  
- 📱 **Phone Verification**: WhatsApp number as identity
- 🔒 **No Private Keys**: Users never handle sensitive data

---

## 📁 **Project Structure**

```
sippy/
├── backend/                 # Express + TypeScript server
│   ├── src/
│   │   ├── commands/       # WhatsApp command handlers
│   │   ├── services/       # CDP, WhatsApp services  
│   │   ├── types/          # TypeScript interfaces
│   │   └── utils/          # Message parsing utilities
│   ├── dist/               # Compiled TypeScript
│   └── server.ts           # Main server entry point
├── frontend/               # Next.js React app
│   ├── app/               # App Router pages
│   └── components/        # React components (cleaned)
├── docs/                  # Documentation and progress
└── README.md             # This file
```

---

## 🎬 **Demo Video**

*Coming soon - will showcase complete WhatsApp payment flow*

---

## 👨‍💻 **Built by**

**Mateo Daza** for **EthGlobal Online Hackathon 2025**

- 🐦 Twitter: @mateodazab
- 💼 GitHub: mateodazab

---

## 🚀 **What's Next?**

See `TOMORROW-PLAN.md` for detailed next steps and demo preparation roadmap.

**Built with ❤️ for EthGlobal Hackathon 2025**
# Frontend Environment Setup

## Required Environment Variables

Create a `.env.local` file in the `frontend/` directory with:

```bash
# Refuel Admin Wallet (has ETH on Base to fund user refuels)
REFUEL_ADMIN_PRIVATE_KEY=0x...your_admin_private_key

# RPC URLs
BASE_RPC_URL=https://mainnet.base.org

# Avail Nexus Configuration
AVAIL_NETWORK=mainnet
```

## Important Notes

- The frontend API route (`/api/refuel`) uses these variables
- The admin private key should be the **same** as in backend/.env
- This allows the Next.js API to execute Avail Nexus SDK calls
- The API runs in the Next.js server, not the browser

## Port Configuration

The frontend runs on port **3001** by default (to avoid conflicts with backend on 3000).

To change this, create/edit `.env.local`:

```bash
PORT=3001
```

Or start with:

```bash
pnpm dev -- -p 3001
```

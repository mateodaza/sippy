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

# Backend API Connection (for phone resolution, etc.)
BACKEND_URL=http://localhost:3001
# In production: BACKEND_URL=https://your-backend-service.com

# Production Base URL (for API routes in server components)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
# In production: NEXT_PUBLIC_BASE_URL=https://www.sippy.lat
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

## Production Deployment

When deploying to production (Vercel, Netlify, etc.), make sure to set these environment variables:

### Required for Production:

- `BACKEND_URL` - Your backend service URL (e.g., `https://your-backend.railway.app`)
- `NEXT_PUBLIC_BASE_URL` - Your frontend URL (e.g., `https://www.sippy.lat`)
- `REFUEL_ADMIN_PRIVATE_KEY` - Same admin wallet as backend
- `BASE_RPC_URL` - RPC endpoint for Base network
- `AVAIL_NETWORK` - Set to `mainnet` for production

### How to Test:

After deploying, test the phone resolution API:

```bash
curl https://www.sippy.lat/api/resolve-phone?phone=%2B573116613414
```

This should return a JSON response with the wallet address if the phone number has a wallet.

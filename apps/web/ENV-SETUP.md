# Frontend Environment Setup

## Required Environment Variables

Create a `.env.local` file in the `apps/web/` directory:

```bash
cp ENV-TEMPLATE.txt .env.local
```

Then fill in your values:

```bash
# Backend API Connection (used by Next.js API routes server-side)
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
# In production: NEXT_PUBLIC_BACKEND_URL=https://backend.sippy.lat

# Production Base URL (for generating shareable fund links)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
# In production: NEXT_PUBLIC_BASE_URL=https://www.sippy.lat

# Fund link signing secret — generate with: openssl rand -hex 32
# Must match FUND_TOKEN_SECRET in apps/backend/.env
FUND_TOKEN_SECRET=your_fund_token_secret_here

# Notification auth secret — generate with: openssl rand -hex 32
# Must match NOTIFY_SECRET in apps/backend/.env
NOTIFY_SECRET=your_notify_secret_here

# Refuel Admin Wallet (has ETH on Base to fund user refuels)
REFUEL_ADMIN_PRIVATE_KEY=0x...your_admin_private_key

# RPC URLs
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Blockscout API (for transaction data and activity)
NEXT_PUBLIC_BLOCKSCOUT_API_KEY=your_blockscout_api_key
NEXT_PUBLIC_BLOCKSCOUT_BASE_URL=https://arbitrum.blockscout.com/api/v2
```

## Important Notes

- `NEXT_PUBLIC_BACKEND_URL` is used server-side in Next.js API routes — do not expose secrets in `NEXT_PUBLIC_` vars
- `FUND_TOKEN_SECRET` and `NOTIFY_SECRET` must be identical in both web and backend `.env` files
- The admin private key should be the **same** as in apps/backend/.env

## Port Configuration

The frontend runs on port **3000** by default. The backend runs on **3001**.

To change this, set in `.env.local`:

```bash
PORT=3000
```

Or start with:

```bash
pnpm dev -- -p 3000
```

## Production Deployment

When deploying to production (Vercel, Railway, etc.), set these environment variables:

### Required for Production:

- `NEXT_PUBLIC_BACKEND_URL` — Backend service URL: `https://backend.sippy.lat`
- `NEXT_PUBLIC_BASE_URL` — Frontend URL: `https://www.sippy.lat`
- `FUND_TOKEN_SECRET` — Fund link signing secret (same as backend)
- `NOTIFY_SECRET` — Notification auth secret (same as backend)
- `REFUEL_ADMIN_PRIVATE_KEY` — Same admin wallet as backend
- `BASE_RPC_URL` — RPC endpoint for Base network
- `ARBITRUM_RPC_URL` — RPC endpoint for Arbitrum network
- `NEXT_PUBLIC_BLOCKSCOUT_API_KEY` — Blockscout API key
- `NEXT_PUBLIC_BLOCKSCOUT_BASE_URL` — `https://arbitrum.blockscout.com/api/v2`

### How to Set in Vercel:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project → **Settings** → **Environment Variables**
3. Add each variable above
4. **Redeploy** your project (Deployments tab → click ⋯ → Redeploy)

### How to Test:

After deploying, test the phone resolution API:

```bash
curl https://www.sippy.lat/api/resolve-phone?phone=%2B573001234567
```

This should return a JSON response with the wallet address if the phone number has a wallet.

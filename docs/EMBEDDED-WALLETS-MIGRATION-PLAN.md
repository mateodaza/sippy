# Sippy Implementation Plan: Embedded Wallets + Spend Permissions

## Implementation Status: ✅ COMPLETE (Jan 2026)

### Deployed Infrastructure

| Component | Address/Value | Network |
|-----------|---------------|---------|
| **GasRefuel Contract** | `0xE4e5474E97E89d990082505fC5708A6a11849936` | Arbitrum |
| **Sippy Spender Wallet** | `0xB396805F4C4eb7A45E237A9468FB647C982fBeb1` | Arbitrum |
| **USDC Token** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Arbitrum |
| **SpendPermissionManager** | `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` | All networks |

### Key Implementation Notes

1. **Two token transfers per send**: When using spend permissions, each USDC send creates TWO token transfers in one atomic transaction:
   - Transfer 1: User → Spender (via SpendPermissionManager.spend)
   - Transfer 2: Spender → Recipient (via USDC.transfer)

2. **Receipt page fix**: The receipt page at `/receipt/[txHash]` uses `transfers[0].from` and `transfers[transfers.length - 1].to` to show the correct user→recipient flow.

3. **CDP creates two addresses per user**: Each embedded wallet user gets:
   - EOA (Externally Owned Account) - the underlying private key
   - Smart Account - the ERC-4337 contract wallet used for all operations

4. **GasRefuel contract is configurable**: Admin can adjust `minBalance`, `refuelAmount`, `maxDailyRefuels`, and `refuelCooldown` without redeployment.

---

## Executive Summary

This document outlines the technical plan to implement **Embedded Wallets + Spend Permissions** for Sippy, providing a **non-custodial model** where users own their keys while maintaining the same WhatsApp-based UX.

> **Note:** This plan assumes no existing production users with custodial server wallets. All current wallets are test-only. If you later need to support migration from legacy custodial wallets, see the "Future: Migration Support" section at the end.

---

## Current Architecture (Server Wallets)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User (WhatsApp)          Sippy Backend           Coinbase CDP  │
│  ──────────────           ─────────────           ────────────  │
│                                                                 │
│  "start" ──────────────► createAccount() ──────► Wallet created │
│                          (Sippy holds             (Keys in TEE) │
│                           Wallet Secret)                        │
│                                                                 │
│  "send $5 to Maria" ───► sendTransaction() ────► Tx executed    │
│                          (No user approval       (Sippy signs)  │
│                           needed)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

WHO HOLDS WHAT:
- Wallet Secret: Sippy backend (.env)
- Private Keys: Coinbase TEE (but Sippy controls via Wallet Secret)
- Custody: Sippy (de facto custodian)
```

### Current Files Involved:
- `backend/src/services/cdp-wallet.service.ts` - Wallet creation & transfers
- `backend/server.ts` - WhatsApp command handling
- `backend/.env` - CDP_WALLET_SECRET, CDP_API_KEY_*

---

## Target Architecture (Embedded Wallets + Spend Permissions)

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEW FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ONBOARDING (one-time, ~60 seconds):                           │
│                                                                 │
│  User (WhatsApp)     Sippy Backend      Web Page      Coinbase │
│  ──────────────      ─────────────      ────────      ──────── │
│                                                                 │
│  "start" ──────────► Generate link ──►                         │
│                                                                 │
│  ◄─── "Click here    ─────────────────►  User opens            │
│        to setup"                         sippy.lat/setup       │
│                                                 │               │
│                                          Enter phone ──► SMS OTP│
│                                          Enter code  ◄── Verify │
│                                                 │               │
│                                          Wallet created (user   │
│                                          owns keys)             │
│                                                 │               │
│                                          "Allow Sippy to send   │
│                                           up to $X/day?"        │
│                                                 │               │
│                                          [Approve] ──► Spend    │
│                                                       Permission│
│                                                       created   │
│                                                 │               │
│  ◄─── "Setup done!   ◄─────────────────  Redirect back         │
│        Start using                                              │
│        Sippy"                                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DAILY USAGE (forever, same as today):                         │
│                                                                 │
│  User (WhatsApp)          Sippy Backend           Blockchain   │
│  ──────────────           ─────────────           ──────────   │
│                                                                 │
│  "send $5 to Maria" ────► useSpendPermission() ──► Tx executed │
│                           (Within user's                        │
│                            approved limit)                      │
│                                                                 │
│  "balance" ─────────────► getBalance() ──────────► Return bal  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

WHO HOLDS WHAT:
- Wallet Secret: Sippy backend (for Sippy's own server wallet only)
- User Private Keys: User's browser/device (encrypted, exportable)
- Spend Permission: Onchain smart contract
- Custody: USER (self-custodial)
```

---

## Implementation Phases

### Phase 1: Setup Infrastructure (Week 1)

#### 1.1 Create Coinbase CDP Project for Embedded Wallets

```bash
# In Coinbase Developer Portal:
# 1. Create new project or update existing
# 2. Enable Embedded Wallets
# 3. Configure allowed auth methods: SMS OTP
# 4. Get Project ID
```

#### 1.2 Install Frontend Dependencies

```bash
cd frontend
pnpm add @coinbase/cdp-core @coinbase/cdp-hooks viem
```

#### 1.3 Create Sippy's Spender Wallet (Server Wallet)

This is the wallet that will USE spend permissions to execute transfers on behalf of users.

```typescript
// backend/src/services/spender-wallet.service.ts
import { CdpClient } from '@coinbase/cdp-sdk';

const cdp = new CdpClient();

// Create ONE server wallet for Sippy to use as the "spender"
export const sippySpenderWallet = await cdp.evm.getOrCreateSmartAccount({
  name: 'sippy-spender',
  owner: await cdp.evm.getOrCreateAccount({ name: 'sippy-spender-owner' }),
});

// Store this address - users will grant permissions to it
export const SIPPY_SPENDER_ADDRESS = sippySpenderWallet.address;
```

---

### Phase 2: Build Onboarding Web Page (Week 1-2)

#### 2.1 Create Setup Page Route

```
frontend/app/setup/page.tsx
```

#### 2.2 Implement Authentication Flow

```tsx
// frontend/app/setup/page.tsx
'use client';

import { useState } from 'react';
import { initialize } from '@coinbase/cdp-core';
import {
  useSignInWithSms,
  useVerifySmsOTP,
  useCreateSpendPermission,
  useCurrentUser,
  useAccessToken
} from '@coinbase/cdp-hooks';
import { parseUnits } from 'viem';

// Initialize CDP SDK
initialize({
  projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID!,
});

const SIPPY_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS!;

// Network constant - reads from env, MUST match backend
const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum';

type Step = 'phone' | 'otp' | 'permission' | 'done';

export default function SetupPage() {
  const searchParams = useSearchParams();

  // Phone number from WhatsApp link - LOCKED (user cannot change)
  const phoneFromUrl = searchParams.get('phone') || '';
  const isMigration = searchParams.get('migrate') === 'true';

  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [dailyLimit, setDailyLimit] = useState('100'); // Default $100/day

  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { createSpendPermission, status: permissionStatus } = useCreateSpendPermission();
  const { currentUser } = useCurrentUser();

  // Security: Phone number must match what was sent in the WhatsApp link
  // This prevents users from setting up wallets for other phone numbers
  const isPhoneLocked = !!phoneFromUrl;

  // Step 1: Send SMS OTP
  const handleSendOtp = async () => {
    try {
      const result = await signInWithSms({ phoneNumber });
      setFlowId(result.flowId);
      setStep('otp');
    } catch (error) {
      console.error('Failed to send OTP:', error);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    if (!flowId) return;
    try {
      const { user, isNewUser } = await verifySmsOTP({ flowId, otp });
      console.log('User authenticated:', user);

      // Register wallet address with Sippy backend
      // Include CDP access token for authentication
      // The useAccessToken hook provides the access token after successful auth
      const { accessToken } = useAccessToken(); // From @coinbase/cdp-hooks
      await fetch('/api/register-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          // Phone number and wallet come from verified token on backend
          // No need to send in body (prevents spoofing)
        }),
      });

      setStep('permission');
    } catch (error) {
      console.error('OTP verification failed:', error);
    }
  };

  // Step 3: Create Spend Permission
  const handleApprovePermission = async () => {
    try {
      const result = await createSpendPermission({
        network: NETWORK, // Use constant - currently 'arbitrum'
        spender: SIPPY_SPENDER_ADDRESS,
        token: 'usdc',
        allowance: parseUnits(dailyLimit, 6), // USDC has 6 decimals
        periodInDays: 1, // Daily limit
        useCdpPaymaster: true, // Sippy pays gas
      });

      // IMPORTANT: Store the permission hash, NOT the userOperationHash
      // The permission hash is needed to look up and use the permission
      // The userOperationHash is just the transaction that created it
      const permissionHash = result.permissionHash; // <-- Correct field

      // Store permission info in Sippy backend
      // Include CDP access token for authentication
      const { accessToken } = useAccessToken();
      await fetch('/api/register-permission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          permissionHash,
          dailyLimit,
        }),
      });

      setStep('done');
    } catch (error) {
      console.error('Permission creation failed:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div>
            <h1 className="text-2xl font-bold mb-4">
              {isMigration ? 'Upgrade Your Wallet' : 'Set Up Your Wallet'}
            </h1>
            <p className="text-gray-600 mb-6">
              {isMigration
                ? 'Upgrade to a self-custodial wallet. Your funds will be transferred automatically.'
                : 'Enter your phone number to create your self-custodial wallet.'}
            </p>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => !isPhoneLocked && setPhoneNumber(e.target.value)}
              placeholder="+573001234567"
              disabled={isPhoneLocked}
              className={`w-full p-3 border rounded-lg mb-4 ${
                isPhoneLocked ? 'bg-gray-100 text-gray-600' : ''
              }`}
            />
            {isPhoneLocked && (
              <p className="text-sm text-gray-500 mb-4">
                Phone number from your WhatsApp link
              </p>
            )}
            <button
              onClick={handleSendOtp}
              className="w-full bg-[#059669] text-white py-3 rounded-lg font-semibold"
            >
              Send Verification Code
            </button>
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <div>
            <h1 className="text-2xl font-bold mb-4">Enter Code</h1>
            <p className="text-gray-600 mb-6">
              We sent a 6-digit code to {phoneNumber}
            </p>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={6}
              className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest"
            />
            <button
              onClick={handleVerifyOtp}
              className="w-full bg-[#059669] text-white py-3 rounded-lg font-semibold"
            >
              Verify
            </button>
          </div>
        )}

        {/* Step 3: Spend Permission */}
        {step === 'permission' && (
          <div>
            <h1 className="text-2xl font-bold mb-4">Set Spending Limit</h1>
            <p className="text-gray-600 mb-6">
              Choose how much Sippy can send per day on your behalf.
              You can change this anytime.
            </p>

            <div className="space-y-3 mb-6">
              {['50', '100', '250', '500'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setDailyLimit(amount)}
                  className={`w-full p-4 rounded-lg border-2 text-left ${
                    dailyLimit === amount
                      ? 'border-[#059669] bg-[#f0fdf4]'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="font-bold">${amount}/day</span>
                  {amount === '100' && (
                    <span className="ml-2 text-sm text-[#059669]">(Recommended)</span>
                  )}
                </button>
              ))}

              <div className="flex items-center gap-2">
                <span>Custom:</span>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-24 p-2 border rounded"
                />
                <span>/day</span>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm">
              <p className="font-semibold text-blue-900">What this means:</p>
              <ul className="mt-2 space-y-1 text-blue-800">
                <li>✓ Sippy can send up to ${dailyLimit} USDC per day</li>
                <li>✓ You own your wallet and keys</li>
                <li>✓ You can revoke this anytime</li>
                <li>✓ You can export your keys anytime</li>
              </ul>
            </div>

            <button
              onClick={handleApprovePermission}
              disabled={permissionStatus === 'pending'}
              className="w-full bg-[#059669] text-white py-3 rounded-lg font-semibold"
            >
              {permissionStatus === 'pending' ? 'Approving...' : 'Approve & Continue'}
            </button>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold mb-4">You're All Set!</h1>
            <p className="text-gray-600 mb-6">
              Your wallet is ready. Return to WhatsApp and start sending dollars!
            </p>
            <div className="bg-gray-100 p-4 rounded-lg text-left text-sm">
              <p className="font-semibold mb-2">Try these commands:</p>
              <ul className="space-y-1 font-mono text-gray-700">
                <li>• balance</li>
                <li>• send $5 to +573001234567</li>
                <li>• history</li>
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
```

---

### Phase 3: Update Backend (Week 2)

#### 3.1 Database Schema

```sql
-- Add columns to phone_registry for spend permissions
ALTER TABLE phone_registry ADD COLUMN spend_permission_hash VARCHAR(66);
ALTER TABLE phone_registry ADD COLUMN daily_limit DECIMAL(18, 6);
ALTER TABLE phone_registry ADD COLUMN permission_created_at TIMESTAMP;
```

#### 3.2 Secure API Endpoints

**Critical Security: These endpoints must verify the request is legitimate.**

```typescript
// backend/src/routes/embedded-wallet.routes.ts
import { Pool } from 'pg';
import { CdpClient } from '@coinbase/cdp-sdk';

// Shared configuration - import from central config
import { NETWORK, USDC_ADDRESSES, SIPPY_SPENDER_ADDRESS } from '../config/network';
// Or define inline if not using central config:
// const NETWORK = process.env.SIPPY_NETWORK || 'arbitrum';
// const SIPPY_SPENDER_ADDRESS = process.env.SIPPY_SPENDER_ADDRESS!;
// const USDC_ADDRESSES: Record<string, string> = {
//   arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
//   base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
// };

// Database pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// CDP client for permission verification
const cdp = new CdpClient();

/**
 * Verify CDP session token using CDP SDK
 *
 * IMPORTANT: CDP does NOT expose a public JWKS endpoint.
 * Instead, use the CDP SDK's validateAccessToken() method which calls:
 * POST https://api.cdp.coinbase.com/platform/v2/end-users/auth/validate-token
 *
 * The JWT issuer is "cdp-api" and user data (phone, wallet addresses) comes
 * from the validation response, not from JWT claims.
 */

/**
 * Verify CDP access token and extract user data
 *
 * Returns the validated user info including phone number and wallet addresses.
 * The CDP SDK handles all JWT verification internally.
 */
async function verifyCdpToken(accessToken: string): Promise<{
  userId: string;
  phoneNumber: string;
  evmSmartAccounts: Array<{ address: string; network: string }>;
}> {
  // Use CDP SDK to validate the token
  // This calls the CDP API endpoint to verify the token and returns user data
  const endUser = await cdp.endUser.validateAccessToken({ accessToken });

  // Extract phone number from authentication methods
  const phoneAuth = endUser.authenticationMethods?.find(
    (m) => m.type === 'phone'
  );

  if (!phoneAuth?.value) {
    throw new Error('No phone number found in authenticated user');
  }

  if (!endUser.evmSmartAccounts || endUser.evmSmartAccounts.length === 0) {
    throw new Error('No smart accounts found for user');
  }

  return {
    userId: endUser.userId,
    phoneNumber: phoneAuth.value,
    evmSmartAccounts: endUser.evmSmartAccounts,
  };
}

// Verify CDP session token and extract phone number
async function verifyCdpSession(authHeader: string): Promise<{
  phoneNumber: string;
  walletAddress: string
}> {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new Error('Missing authorization token');

  // Verify token using CDP SDK and get user data
  const userData = await verifyCdpToken(token);

  // Find the wallet for our network
  const walletForNetwork = userData.evmSmartAccounts.find(
    (account) => account.network === NETWORK
  );

  // Fall back to first account if no network-specific account found
  const walletAddress = walletForNetwork?.address || userData.evmSmartAccounts[0]?.address;

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new Error('Invalid wallet address from CDP');
  }

  return {
    phoneNumber: userData.phoneNumber,
    walletAddress,
  };
}

// Called after user creates embedded wallet
app.post('/api/register-wallet', async (req, res) => {
  try {
    // CRITICAL: Verify the CDP session token
    const { phoneNumber, walletAddress } = await verifyCdpSession(
      req.headers.authorization
    );

    // The phone number comes from the verified token, NOT the request body
    // This prevents an attacker from registering someone else's phone

    const normalizedPhone = phoneNumber.replace(/^\+/, '');

    // Upsert the wallet - all users are embedded (no legacy migration needed)
    await query(
      `INSERT INTO phone_registry (phone_number, wallet_address, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone_number) DO UPDATE SET
         wallet_address = $2`,
      [normalizedPhone, walletAddress]
    );

    res.json({ success: true, network: NETWORK });
  } catch (error) {
    console.error('Register wallet error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Called after user approves spend permission
app.post('/api/register-permission', async (req, res) => {
  try {
    // CRITICAL: Verify the CDP session token
    const { phoneNumber, walletAddress } = await verifyCdpSession(
      req.headers.authorization
    );

    const { permissionHash, dailyLimit } = req.body;

    // Validate permission hash format (should be 66 chars: 0x + 64 hex)
    if (!/^0x[a-fA-F0-9]{64}$/.test(permissionHash)) {
      return res.status(400).json({ error: 'Invalid permission hash format' });
    }

    // SECURITY: Verify this permission actually exists onchain for this wallet
    // This prevents storing invalid/fake permission hashes
    const allPermissions = await cdp.evm.listSpendPermissions({
      address: walletAddress,
    });

    const usdcAddress = USDC_ADDRESSES[NETWORK];
    const matchingPermission = allPermissions.spendPermissions.find(
      (p) =>
        p.permissionHash === permissionHash &&
        p.permission.spender.toLowerCase() === SIPPY_SPENDER_ADDRESS.toLowerCase() &&
        p.permission.token.toLowerCase() === usdcAddress.toLowerCase() &&
        p.network === NETWORK
    );

    if (!matchingPermission) {
      return res.status(400).json({
        error: 'Permission not found onchain or does not match expected spender/token/network'
      });
    }

    // Verified! Store the permission
    await query(
      `UPDATE phone_registry
       SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = NOW()
       WHERE phone_number = $3`,
      [permissionHash, dailyLimit, phoneNumber.replace(/^\+/, '')]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Register permission error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

**Alternative: Signed Request Approach**

If CDP session tokens aren't available server-side, use wallet signatures:

```typescript
// Frontend signs a message with the embedded wallet
const message = JSON.stringify({
  action: 'register-wallet',
  phoneNumber: '+573001234567',
  walletAddress: '0x...',
  timestamp: Date.now(),
});
const signature = await signMessage(message);

// Backend verifies the signature matches the wallet address
// This proves the user controls the wallet
```

#### 3.3 Update Send Logic

```typescript
// backend/src/services/transfer.service.ts
import { CdpClient, parseUnits } from '@coinbase/cdp-sdk';
import { NETWORK, USDC_ADDRESSES, SIPPY_SPENDER_ADDRESS } from '../config/network';

const cdp = new CdpClient();

// Sippy's spender wallet
const sippySpender = await cdp.evm.getOrCreateSmartAccount({
  name: 'sippy-spender',
  owner: await cdp.evm.getOrCreateAccount({ name: 'sippy-spender-owner' }),
});

export async function sendUSDC(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  const userWallet = await getUserWallet(fromPhoneNumber);

  if (!userWallet) {
    throw new Error('User wallet not found. Please set up your wallet first.');
  }

  // All users use spend permissions (no legacy server wallets)
  return await sendWithSpendPermission(userWallet, toAddress, amount);
}

async function sendWithSpendPermission(
  userWallet: UserWallet,
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  // Get user's spend permission
  const allPermissions = await cdp.evm.listSpendPermissions({
    address: userWallet.walletAddress,
  });

  // Find the CORRECT permission: must match spender, token, AND network
  const usdcAddress = USDC_ADDRESSES[NETWORK];
  const permission = allPermissions.spendPermissions.find(
    (p) =>
      p.permission.spender.toLowerCase() === sippySpender.address.toLowerCase() &&
      p.permission.token.toLowerCase() === usdcAddress.toLowerCase() &&
      p.network === NETWORK
  );

  if (!permission) {
    throw new Error(
      `No valid spend permission found for USDC on ${NETWORK}. User needs to re-authorize.`
    );
  }

  // Execute transfer using spend permission
  const spend = await sippySpender.useSpendPermission({
    spendPermission: permission.permission,
    value: parseUnits(amount.toString(), 6),
    network: NETWORK, // Use constant, not hardcoded
  });

  const receipt = await sippySpender.waitForUserOperation(spend);
  const userOp = await sippySpender.getUserOperation({
    userOpHash: receipt.userOpHash,
  });

  return {
    transactionHash: userOp.transactionHash,
    amount,
    recipient: toAddress,
    timestamp: Date.now(),
  };
}
```

#### 3.4 Update WhatsApp Command Handler

```typescript
// backend/server.ts - Update 'start' command

case 'start':
  const existingWallet = await getUserWallet(phoneNumber);

  if (existingWallet) {
    // Already set up
    await sendTextMessage(
      phoneNumber,
      `✅ Your wallet is already set up!\n\n` +
      `Balance: ${await getUserBalance(phoneNumber)} USDC\n\n` +
      `Commands: balance, send, history, settings`
    );
  } else {
    // New user - send setup link
    const setupUrl = `https://sippy.lat/setup?phone=${encodeURIComponent('+' + phoneNumber)}`;
    await sendTextMessage(
      phoneNumber,
      `👋 Welcome to Sippy!\n\n` +
      `To get started, set up your wallet (takes 60 seconds):\n\n` +
      `${setupUrl}\n\n` +
      `You'll:\n` +
      `1. Verify your phone number\n` +
      `2. Set your spending limit\n` +
      `3. Start sending dollars via WhatsApp!`
    );
  }
  break;
```

---

### Phase 4: Settings & Permission Management

#### 4.1 Settings Page Route

```
frontend/app/settings/page.tsx
```

#### 4.2 Settings Page Implementation

```tsx
// frontend/app/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { initialize } from '@coinbase/cdp-core';
import {
  useSignInWithSms,
  useVerifySmsOTP,
  useRevokeSpendPermission,
  useCreateSpendPermission,
  useListSpendPermissions,
  useCurrentUser,
  useAccessToken
} from '@coinbase/cdp-hooks';
import { parseUnits } from 'viem';

initialize({
  projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID!,
});

const SIPPY_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS!;
const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum';

// USDC addresses by network - must match backend
const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentLimit, setCurrentLimit] = useState<string | null>(null);
  const [newLimit, setNewLimit] = useState('');

  const { currentUser } = useCurrentUser();
  const { listSpendPermissions } = useListSpendPermissions();
  const { revokeSpendPermission, status: revokeStatus } = useRevokeSpendPermission();
  const { createSpendPermission, status: createStatus } = useCreateSpendPermission();

  // Fetch current permission on load
  useEffect(() => {
    if (currentUser) {
      loadCurrentPermission();
    }
  }, [currentUser]);

  const loadCurrentPermission = async () => {
    // Get smart account address with proper null checks
    const smartAccounts = currentUser?.evmSmartAccounts;
    if (!smartAccounts || smartAccounts.length === 0) {
      console.error('No smart accounts found');
      return;
    }

    // Handle both string and object formats
    const firstAccount = smartAccounts[0];
    const walletAddress = typeof firstAccount === 'string'
      ? firstAccount
      : firstAccount?.address;

    if (!walletAddress) {
      console.error('Could not extract wallet address');
      return;
    }

    // listSpendPermissions returns { spendPermissions: [...] }
    const result = await listSpendPermissions({ address: walletAddress });
    const permissions = result.spendPermissions || [];

    // Find Sippy's permission matching spender, token, AND network
    // Use USDC_ADDRESSES constant to support network changes
    const usdcAddress = USDC_ADDRESSES[NETWORK];
    if (!usdcAddress) {
      console.error(`No USDC address configured for network: ${NETWORK}`);
      return;
    }

    const sippyPermission = permissions.find(
      (p) =>
        p.permission.spender.toLowerCase() === SIPPY_SPENDER_ADDRESS.toLowerCase() &&
        p.permission.token.toLowerCase() === usdcAddress.toLowerCase() &&
        p.network === NETWORK
    );

    if (sippyPermission) {
      // Convert from smallest unit to human readable (USDC has 6 decimals)
      const limitInUsdc = Number(sippyPermission.permission.allowance) / 1e6;
      setCurrentLimit(limitInUsdc.toString());
      setNewLimit(limitInUsdc.toString());
    }
  };

  // Revoke permission (disable Sippy access)
  const handleRevoke = async () => {
    try {
      await revokeSpendPermission({
        network: NETWORK,
        spender: SIPPY_SPENDER_ADDRESS,
        token: 'usdc',
        useCdpPaymaster: true,
      });

      // Update backend
      const { accessToken } = useAccessToken();
      await fetch('/api/revoke-permission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      setCurrentLimit(null);
    } catch (error) {
      console.error('Revoke failed:', error);
    }
  };

  // Change limit (creates new permission, replacing old one)
  const handleChangeLimit = async () => {
    try {
      const result = await createSpendPermission({
        network: NETWORK,
        spender: SIPPY_SPENDER_ADDRESS,
        token: 'usdc',
        allowance: parseUnits(newLimit, 6),
        periodInDays: 1,
        useCdpPaymaster: true,
      });

      // Update backend with new permission
      const { accessToken } = useAccessToken();
      await fetch('/api/register-permission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          permissionHash: result.permissionHash,
          dailyLimit: newLimit,
        }),
      });

      setCurrentLimit(newLimit);
    } catch (error) {
      console.error('Change limit failed:', error);
    }
  };

  // ... Authentication flow (similar to setup page) ...

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold mb-6">Sippy Settings</h1>

        {/* Current permission status */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Current daily limit</p>
          <p className="text-2xl font-bold">
            {currentLimit ? `$${currentLimit}/day` : 'No permission'}
          </p>
        </div>

        {/* Change limit */}
        {currentLimit && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Change daily limit
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                className="flex-1 p-3 border rounded-lg"
              />
              <button
                onClick={handleChangeLimit}
                disabled={createStatus === 'pending' || newLimit === currentLimit}
                className="px-4 py-2 bg-[#059669] text-white rounded-lg disabled:opacity-50"
              >
                {createStatus === 'pending' ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        )}

        {/* Revoke permission */}
        {currentLimit && (
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-2 text-red-600">
              Disable Sippy Access
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              This will revoke Sippy's permission to send from your wallet.
              You can re-enable anytime.
            </p>
            <button
              onClick={handleRevoke}
              disabled={revokeStatus === 'pending'}
              className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold"
            >
              {revokeStatus === 'pending' ? 'Revoking...' : 'Revoke Permission'}
            </button>
          </div>
        )}

        {/* Re-enable permission */}
        {!currentLimit && (
          <div>
            <p className="text-gray-600 mb-4">
              Sippy doesn't have permission to send from your wallet.
            </p>
            <button
              onClick={() => {/* Navigate to permission step */}}
              className="w-full py-3 bg-[#059669] text-white rounded-lg font-semibold"
            >
              Enable Sippy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 4.3 Backend API for Revocation

```typescript
// backend/src/routes/embedded-wallet.routes.ts

// Called when user revokes permission
app.post('/api/revoke-permission', async (req, res) => {
  try {
    const { phoneNumber } = await verifyCdpSession(req.headers.authorization);

    await query(
      `UPDATE phone_registry
       SET spend_permission_hash = NULL,
           daily_limit = NULL,
           permission_created_at = NULL
       WHERE phone_number = $1`,
      [phoneNumber.replace(/^\+/, '')]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

#### 4.4 WhatsApp Settings Command

```typescript
// backend/server.ts - Add 'settings' command

case 'settings':
  const settingsUrl = `https://sippy.lat/settings?phone=${encodeURIComponent('+' + phoneNumber)}`;
  await sendTextMessage(
    phoneNumber,
    `⚙️ Manage your Sippy settings:\n\n` +
    `${settingsUrl}\n\n` +
    `You can:\n` +
    `• Change your daily spending limit\n` +
    `• Revoke Sippy's permission\n` +
    `• Export your wallet keys`
  );
  break;
```

---

### Phase 5: Testing & Rollout (Week 3)

#### 5.1 Testing Checklist

**Onboarding Flow:**
- [ ] New user onboarding (phone → OTP → wallet → permission)
- [ ] Phone number validation (matches WhatsApp link)
- [ ] CDP token verification (backend receives and validates access token)
- [ ] Spend permission created onchain
- [ ] Permission registered in database

**Core Functionality:**
- [ ] Send USDC within daily limit
- [ ] Send USDC exceeding daily limit (should fail gracefully)
- [ ] Balance check
- [ ] History/activity display
- [ ] Receive USDC from another user

**Settings & Permissions:**
- [ ] Change daily spending limit (creates new permission)
- [ ] Permission revocation (blocks sends)
- [ ] Re-enable permission after revocation
- [ ] Key export

**Error Handling:**
- [ ] Network issues (retry logic, clear error messages)
- [ ] Invalid/expired access token (401 response)
- [ ] No permission found (helpful error message)
- [ ] Timeout handling

#### 5.2 Rollout Strategy

1. **Week 1**: Internal testing with team wallets
2. **Week 2**: Beta with 10-20 trusted users
3. **Week 3**: Open to all users, iterate based on feedback

---

## Environment Variables

### New Variables Required

```bash
# frontend/.env.local
NEXT_PUBLIC_CDP_PROJECT_ID=your-project-id          # From CDP Developer Portal
NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS=0x...             # Sippy's spender wallet address
NEXT_PUBLIC_SIPPY_NETWORK=arbitrum                  # Network for embedded wallets

# backend/.env
# (keep existing CDP_API_KEY_*, CDP_WALLET_SECRET for server wallet operations)
SIPPY_SPENDER_WALLET_NAME=sippy-spender
SIPPY_NETWORK=arbitrum                              # Must match frontend

# CRITICAL: Required for JWT verification
CDP_PROJECT_ID=your-project-id                      # Same as frontend, used to verify JWT audience
```

### CDP Token Verification

The backend verifies CDP session tokens using the CDP SDK's `validateAccessToken()` method.

**No additional env vars needed** - the CDP SDK uses your existing `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` to authenticate with the CDP API.

**How it works:**
1. Frontend sends the user's access token in the `Authorization` header
2. Backend calls `cdp.endUser.validateAccessToken({ accessToken })`
3. CDP API validates the token and returns user data (userId, phone, wallets)
4. Backend uses the validated phone number and wallet address

**Before go-live:**
1. Test token verification with a real embedded wallet session
2. Verify the response shape matches the code expectations
3. Ensure your CDP API key has `endUser` permissions

---

## Database Changes Summary

```sql
-- New columns in phone_registry for spend permissions
spend_permission_hash VARCHAR(66)          -- Permission hash for lookup
daily_limit DECIMAL(18, 6)                 -- User's chosen daily limit
permission_created_at TIMESTAMP            -- When permission was created
```

---

## File Changes Summary

### New Files
- `frontend/app/setup/page.tsx` - Onboarding web page
- `frontend/app/settings/page.tsx` - Settings & permission management page
- `backend/src/services/spender-wallet.service.ts` - Sippy's spender wallet
- `backend/src/services/embedded-wallet.service.ts` - Embedded wallet + spend permission logic
- `backend/src/routes/embedded-wallet.routes.ts` - API endpoints (`/api/register-wallet`, `/api/register-permission`, `/api/revoke-permission`)

### Modified Files
- `backend/server.ts` - Update command handlers (add `settings` command)
- `frontend/package.json` - Add CDP SDK dependencies

### Removed Files (after switching to embedded wallets)
- `backend/src/services/cdp-wallet.service.ts` - No longer needed (was custodial server wallets)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| User loses phone | Keys are in browser - encourage export |
| Permission expires | Alert user before expiry, easy renewal |
| Network issues | Retry logic, clear error messages |
| User confusion | Clear UI, help documentation |

---

## Timeline

| Week | Milestone |
|------|-----------|
| 1 | Infrastructure setup, spender wallet, basic web page |
| 2 | Complete onboarding flow, backend integration, testing |
| 3 | Beta rollout, iterate based on feedback |

---

## Success Metrics

- [ ] New users can onboard in < 90 seconds
- [ ] Daily usage UX unchanged (WhatsApp commands work same)
- [ ] Zero custody liability for Sippy
- [ ] Users can export keys
- [ ] Users can revoke permissions
- [ ] Transaction success rate > 99%

---

## Legal Considerations

This migration fundamentally changes Sippy's legal position:

**Before (Server Wallets):**
- Sippy is de facto custodian
- Potential money transmitter classification
- Liable for lost/stolen funds

**After (Embedded Wallets):**
- Users are self-custodial
- Sippy is software/interface provider
- Users explicitly approve spending limits
- Onchain proof of user consent
- Reduced regulatory burden

*Recommend legal review of: Terms of Service, Privacy Policy, and user consent language on the setup page.*

---

## Fiat Onramp Strategy for Colombia/LATAM

### Coinbase Onramp Availability (Verified via API - Jan 2026)

**API Response for LATAM countries:**

| Country | Payment Methods | Fiat Onramp? |
|---------|-----------------|--------------|
| **CO (Colombia)** | `CRYPTO_ACCOUNT` only | ❌ No |
| BR (Brazil) | `CARD`, `CRYPTO_ACCOUNT`, `FIAT_WALLET` | ✅ Yes |
| AR (Argentina) | `CRYPTO_ACCOUNT` only | ❌ No |
| MX (Mexico) | `CRYPTO_ACCOUNT` only | ❌ No |
| CL (Chile) | `CRYPTO_ACCOUNT` only | ❌ No |
| PE (Peru) | `CRYPTO_ACCOUNT` only | ❌ No |

**What `CRYPTO_ACCOUNT` means:** Users can transfer crypto FROM an existing Coinbase account, but cannot buy with card/bank.

To verify current support, run:
```bash
node backend/check-onramp.mjs
```

### Recommended Onramp Alternatives for Colombian Users

| Method | How It Works | User Experience |
|--------|--------------|-----------------|
| **Binance P2P** | User buys USDC with COP on Binance, sends to Sippy wallet | External app, then paste address |
| **Bitso** | Mexican/LATAM exchange with COP support | Similar to Binance |
| **El Dorado** | Coinbase-backed LATAM stablecoin app | Mobile app for LATAM |
| **Friend sends** | Another Sippy user sends USDC | WhatsApp only |
| **MoonPay/Transak** | Third-party onramp aggregators | Can embed in web |

### Recommended Funding Flow for Colombia

```
┌─────────────────────────────────────────────────────────────────┐
│                     FUNDING FLOW (COLOMBIA)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User (WhatsApp)              Sippy                   External  │
│  ──────────────               ─────                   ────────  │
│                                                                 │
│  "fund" or "agregar fondos" ─► Show instructions:              │
│                                                                 │
│  ◄─── "To add funds:                                           │
│        1. Buy USDC on Binance/Bitso                            │
│        2. Send to your wallet:                                 │
│           0x1234...5678                                        │
│        3. Or ask a friend to send you USDC!"                   │
│                                                                 │
│  Alternative: Open sippy.lat/fund                              │
│               Shows QR code + wallet address                   │
│               + links to exchanges                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Future Enhancement: MoonPay/Transak Integration

If in-app fiat onramp is needed, consider integrating:
- **MoonPay**: Supports Colombia (COP → USDC)
- **Transak**: Supports 100+ countries including Colombia

These require separate API keys and compliance agreements.

---

## Clarifications from Research

### Embedded Wallet vs Smart Account

These are the **same thing** in practice - no code distinction needed:

| Term | What It Is |
|------|-----------|
| **Embedded Wallet** | The authentication system (SMS OTP, email) |
| **Smart Account** | The onchain wallet address created by Embedded Wallet |

The CDP hooks handle this automatically:
- `useSignInWithSms()` → Creates embedded wallet + smart account
- `useCreateSpendPermission()` → Works on that smart account

### Key Confirmation from CDP Docs

1. **Self-Custody**: "Users have full control. Embedded Wallets are self-custodial—only the user can access their private keys. Users can export keys anytime. Coinbase cannot access user funds."

2. **Key Export**: Users can call `exportEvmAccount()` to get their private key

3. **Arbitrum Support**: Confirmed in network enum: `"arbitrum"`, `"base"`, `"optimism"`, etc.

4. **Gas Sponsorship**: `useCdpPaymaster: true` sponsors all gas fees

5. **Spend Permission Periods**: `periodInDays: 1` (daily), `7` (weekly), `30` (monthly)

---

## Architecture Decisions & FAQ

### Q1: Which chain does Sippy use?

**Answer: Arbitrum (chain ID 42161)**

Sippy uses Arbitrum mainnet exclusively:
- USDC contract: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (Native USDC on Arbitrum)
- Configured via `SIPPY_NETWORK=arbitrum` environment variable

### Q2: What authentication proof should register endpoints require?

**Answer: CDP Session JWT + Phone Number Verification**

The `/api/register-wallet` and `/api/register-permission` endpoints must verify:

1. **The request comes from a legitimate CDP embedded wallet session**
2. **The phone number matches what was used for SMS OTP**

See "Phase 3.2: Secure API Endpoints" for implementation.

### Q3: Single or multiple spend permissions per user?

**Answer: Single permission (can be replaced)**

- Users have ONE active spend permission to Sippy at a time
- To change limits, user creates a NEW permission (replaces the old one)
- Old permission is automatically superseded when new one is approved
- Database stores the current `spend_permission_hash`

**Rationale:** Simpler UX, cleaner mental model. "Your limit is $X/day" not "You have 3 permissions."

### Q4: Where should users revoke or change their spending limits?

**Answer: Web page at `sippy.lat/settings`**

Users access settings via:
1. WhatsApp command: `settings` → returns link to `sippy.lat/settings?phone=+573001234567`
2. Direct web access (if they bookmarked it)

See "Phase 4: Settings & Permission Management" for implementation.

### Q5: Permission changes - web-only or WhatsApp-triggered?

**Answer: WhatsApp-triggered with web confirmation**

Current design:
- User types `settings` in WhatsApp → receives link
- Opens web page → changes limit or revokes
- Returns to WhatsApp

This balances:
- **Security**: Onchain changes require explicit web interaction
- **UX**: User initiates from WhatsApp, minimal web time
- **Simplicity**: No complex inline approval flows

### Q6: Should NETWORK be a single env-driven constant or multi-chain per user?

**Answer: Single env-driven constant for now**

```typescript
// backend/src/config/network.ts
export const NETWORK = process.env.SIPPY_NETWORK || 'arbitrum';

// frontend/.env.local
NEXT_PUBLIC_SIPPY_NETWORK=arbitrum
```

**Rationale:**
- Single network simplifies UX ("Your wallet works on Arbitrum")
- Multi-chain adds significant complexity (cross-chain permissions, bridging, etc.)

**Future multi-chain (if needed):**
- Store `network` per user in `phone_registry`
- Allow network selection during onboarding
- Permissions are per-network, so users would need separate permissions per chain

### Q7: What's the exact return shape for useListSpendPermissions?

**Answer: Based on CDP SDK patterns**

```typescript
// useListSpendPermissions return shape
interface ListSpendPermissionsResult {
  spendPermissions: SpendPermissionEntry[];
}

interface SpendPermissionEntry {
  permissionHash: string;  // The unique identifier for this permission
  network: string;         // e.g., 'arbitrum', 'base'
  permission: {
    spender: string;       // Address of the approved spender
    token: string;         // Token contract address
    allowance: bigint;     // Max amount per period (in smallest unit)
    period: number;        // Period in seconds (86400 = 1 day)
    start: number;         // Unix timestamp when permission starts
    end: number;           // Unix timestamp when permission expires
    salt: string;          // Unique salt for this permission
    extraData: string;     // Additional data (usually '0x')
  };
}
```

**Verify with CDP SDK:**
The exact shape may vary by SDK version. Always test with actual SDK responses and update types accordingly.

### Q8: How does CDP token verification work?

**Answer: CDP SDK's validateAccessToken() method**

CDP does **not** expose a public JWKS URL for self-verification. Instead, use the SDK:

```typescript
const cdp = new CdpClient();
const endUser = await cdp.endUser.validateAccessToken({ accessToken });
// Returns: { userId, evmAccounts, evmSmartAccounts, authenticationMethods }
```

**Key details:**
- Endpoint: `POST https://api.cdp.coinbase.com/platform/v2/end-users/auth/validate-token`
- JWT issuer: `"cdp-api"` (not a URL)
- User data (phone, wallets) comes from the validation response, **not** JWT claims
- Requires your existing `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`

**Go-Live Checklist:**
- [ ] Test token verification with real embedded wallet session
- [ ] Verify response shape matches code expectations
- [ ] Ensure CDP API key has `endUser` permissions

---

## Future: Migration Support (If Needed)

> **This section is for reference only.** The current plan assumes no existing production users with custodial server wallets.

If you later need to migrate users from legacy server wallets to embedded wallets, you would:

1. **Add database columns:**
   ```sql
   ALTER TABLE phone_registry ADD COLUMN wallet_type VARCHAR(20) DEFAULT 'embedded';
   ALTER TABLE phone_registry ADD COLUMN old_server_wallet VARCHAR(42);
   ```

2. **Update `/api/register-wallet`** to:
   - Check if `wallet_type === 'server'` (legacy user)
   - Transfer funds from old wallet to new embedded wallet
   - Update `wallet_type = 'embedded'` and store `old_server_wallet`
   - Use row locks (`FOR UPDATE`) to prevent concurrent migrations

3. **Update `sendUSDC`** to:
   - Check `wallet_type` and route to appropriate send function
   - Block sends during migration (`wallet_type === 'migrating'`)

4. **Update WhatsApp `start` command** to detect legacy users and show migration link

For detailed implementation, see the git history of this document or contact the team.

---

## Appendix: Coinbase CDP Documentation

- [Embedded Wallets Overview](https://docs.cdp.coinbase.com/embedded-wallets/welcome)
- [Spend Permissions](https://docs.cdp.coinbase.com/embedded-wallets/evm-features/spend-permissions)
- [Server Wallets (for spender)](https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome)
- [CDP SDK Hooks](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/frontend/@coinbase/cdp-hooks)
- [Onramp Countries & Currencies](https://docs.cdp.coinbase.com/onramp-&-offramp/onramp-apis/countries-&-currencies)
- [Onramp Config API](https://docs.cdp.coinbase.com/onramp/v1/buy/config)

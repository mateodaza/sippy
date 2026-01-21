/**
 * Embedded Wallet API Routes
 *
 * Handles wallet registration and spend permission management
 * for embedded wallets (self-custodial).
 */

import { Router, Request, Response } from 'express';
import { CdpClient } from '@coinbase/cdp-sdk';
import { query } from '../services/db.js';
import { getSippySpenderAccount } from '../services/embedded-wallet.service.js';
import {
  NETWORK,
  USDC_ADDRESSES,
  USDC_DECIMALS,
} from '../config/network.js';
import { ethers } from 'ethers';

const router = Router();

// CDP client for token validation and permission verification
const cdp = new CdpClient();

/**
 * Verify CDP access token and extract user data
 *
 * Uses CDP SDK's validateAccessToken() method which calls:
 * POST https://api.cdp.coinbase.com/platform/v2/end-users/auth/validate-token
 *
 * Returns the validated user info including phone number and wallet addresses.
 */
async function verifyCdpToken(accessToken: string): Promise<{
  userId: string;
  phoneNumber: string;
  evmSmartAccounts: Array<{ address: string; network: string }>;
}> {
  // Use CDP SDK to validate the token
  const endUser = await cdp.endUser.validateAccessToken({ accessToken });

  // Extract phone number from authentication methods
  // AuthenticationMethod type is 'sms' | 'email' | 'jwt' | OAuth2ProviderType
  const smsAuth = endUser.authenticationMethods?.find(
    (m) => m.type === 'sms'
  ) as { type: 'sms'; phoneNumber: string } | undefined;

  if (!smsAuth?.phoneNumber) {
    throw new Error('No phone number found in authenticated user');
  }

  if (!endUser.evmSmartAccounts || endUser.evmSmartAccounts.length === 0) {
    throw new Error('No smart accounts found for user');
  }

  // evmSmartAccounts is an array of strings (addresses)
  // We need to convert to our expected format
  const smartAccounts = endUser.evmSmartAccounts.map((addr) => ({
    address: addr,
    network: NETWORK,
  }));

  return {
    userId: endUser.userId,
    phoneNumber: smsAuth.phoneNumber,
    evmSmartAccounts: smartAccounts,
  };
}

/**
 * Verify CDP session token and extract phone number + wallet
 */
async function verifyCdpSession(authHeader: string | undefined): Promise<{
  phoneNumber: string;
  walletAddress: string;
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
  const walletAddress =
    walletForNetwork?.address || userData.evmSmartAccounts[0]?.address;

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new Error('Invalid wallet address from CDP');
  }

  return {
    phoneNumber: userData.phoneNumber,
    walletAddress,
  };
}

/**
 * POST /api/register-wallet
 *
 * Called after user creates an embedded wallet.
 * Registers the phone → wallet mapping in the database.
 */
router.post('/register-wallet', async (req: Request, res: Response) => {
  try {
    // CRITICAL: Verify the CDP session token
    const { phoneNumber, walletAddress } = await verifyCdpSession(
      req.headers.authorization
    );

    // Normalize phone number (remove leading +)
    const normalizedPhone = phoneNumber.replace(/^\+/, '');

    console.log(
      `\n🔐 Registering embedded wallet for +${normalizedPhone}: ${walletAddress}`
    );

    // Upsert the wallet - all users are embedded (no legacy migration needed)
    await query(
      `INSERT INTO phone_registry (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (phone_number) DO UPDATE SET
         wallet_address = $3,
         last_activity = $5`,
      [
        normalizedPhone,
        `embedded-${normalizedPhone}`, // Use embedded prefix for wallet name
        walletAddress,
        Date.now(),
        Date.now(),
        0,
        new Date().toDateString(),
      ]
    );

    console.log(`✅ Embedded wallet registered for +${normalizedPhone}`);

    res.json({ success: true, network: NETWORK });
  } catch (error) {
    console.error('❌ Register wallet error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

/**
 * POST /api/register-permission
 *
 * Called after user approves a spend permission.
 * Finds the matching permission onchain and stores the hash in the database.
 *
 * NOTE: Frontend sends dailyLimit only. We find the permission by matching
 * spender + token + network, then store its permissionHash.
 */
router.post('/register-permission', async (req: Request, res: Response) => {
  try {
    // CRITICAL: Verify the CDP session token
    const { phoneNumber, walletAddress } = await verifyCdpSession(
      req.headers.authorization
    );

    const { dailyLimit } = req.body;

    console.log(
      `\n🔑 Registering spend permission for +${phoneNumber.replace(/^\+/, '')}`
    );
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Daily limit: $${dailyLimit}`);

    // Get the actual spender address (dynamically created, ensures consistency)
    const spenderAccount = await getSippySpenderAccount();
    const spenderAddress = spenderAccount.address;

    // Find the permission onchain by matching criteria
    const allPermissions = await cdp.evm.listSpendPermissions({
      address: walletAddress as `0x${string}`,
    });

    const usdcAddress = USDC_ADDRESSES[NETWORK];

    // Find all matching permissions and select the most recent one (highest start time)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchingPermissions = (allPermissions.spendPermissions as any[])?.filter(
      (p) =>
        p.permission?.spender?.toLowerCase() ===
          spenderAddress.toLowerCase() &&
        p.permission?.token?.toLowerCase() === usdcAddress.toLowerCase() &&
        p.network === NETWORK
    ) || [];

    if (matchingPermissions.length === 0) {
      console.log(
        '❌ No permission found onchain for this wallet with expected spender/token/network'
      );
      console.log(`   Expected spender: ${spenderAddress}`);
      console.log(`   Expected token: ${usdcAddress}`);
      console.log(`   Expected network: ${NETWORK}`);
      return res.status(400).json({
        error:
          'Permission not found onchain. Please try creating the permission again.',
      });
    }

    // Sort by start time descending to get the most recent permission
    const matchingPermission = matchingPermissions.sort(
      (a, b) => Number(b.permission?.start || 0) - Number(a.permission?.start || 0)
    )[0];

    const permissionHash = matchingPermission.permissionHash;
    const permission = matchingPermission.permission;
    console.log(`   Found ${matchingPermissions.length} permission(s), using most recent: ${permissionHash}`);

    // Derive daily_limit from the onchain permission allowance (source of truth)
    const onchainAllowance = parseFloat(
      ethers.utils.formatUnits(permission.allowance, USDC_DECIMALS)
    );
    console.log(`   Onchain allowance: $${onchainAllowance}/period`);

    // Warn if client-provided limit doesn't match onchain (but use onchain as truth)
    if (dailyLimit && Math.abs(parseFloat(dailyLimit) - onchainAllowance) > 0.01) {
      console.warn(`   ⚠️ Client dailyLimit ($${dailyLimit}) differs from onchain ($${onchainAllowance}), using onchain value`);
    }

    // Store the permission with onchain-derived limit
    const normalizedPhone = phoneNumber.replace(/^\+/, '');
    await query(
      `UPDATE phone_registry
       SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
       WHERE phone_number = $4`,
      [permissionHash, onchainAllowance, Date.now(), normalizedPhone]
    );

    console.log(`✅ Spend permission registered for +${normalizedPhone} with $${onchainAllowance}/day limit`);

    res.json({ success: true, permissionHash, dailyLimit: onchainAllowance });
  } catch (error) {
    console.error('❌ Register permission error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

/**
 * POST /api/revoke-permission
 *
 * Called when user revokes their spend permission.
 * Clears the permission from the database.
 */
router.post('/revoke-permission', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = await verifyCdpSession(req.headers.authorization);

    const normalizedPhone = phoneNumber.replace(/^\+/, '');

    console.log(`\n🚫 Revoking spend permission for +${normalizedPhone}`);

    await query(
      `UPDATE phone_registry
       SET spend_permission_hash = NULL,
           daily_limit = NULL,
           permission_created_at = NULL
       WHERE phone_number = $1`,
      [normalizedPhone]
    );

    console.log(`✅ Spend permission revoked for +${normalizedPhone}`);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Revoke permission error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

/**
 * GET /api/wallet-status
 *
 * Check if a phone number has a wallet and spend permission.
 * Used by frontend to show appropriate UI.
 */
router.get('/wallet-status', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = await verifyCdpSession(req.headers.authorization);
    const normalizedPhone = phoneNumber.replace(/^\+/, '');

    const result = await query<{
      wallet_address: string;
      spend_permission_hash: string | null;
      daily_limit: string | null;
    }>(
      `SELECT wallet_address, spend_permission_hash, daily_limit
       FROM phone_registry
       WHERE phone_number = $1`,
      [normalizedPhone]
    );

    if (result.rows.length === 0) {
      return res.json({
        hasWallet: false,
        hasPermission: false,
      });
    }

    const row = result.rows[0];
    res.json({
      hasWallet: true,
      walletAddress: row.wallet_address,
      hasPermission: !!row.spend_permission_hash,
      dailyLimit: row.daily_limit ? parseFloat(row.daily_limit) : null,
    });
  } catch (error) {
    console.error('❌ Wallet status error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;

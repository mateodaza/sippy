/**
 * CDP Server Wallet Service v2 (PostgreSQL)
 *
 * Handles wallet creation, transfers, and balance queries using Coinbase CDP SDK v2
 * with PostgreSQL storage
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';
import { UserWallet, SecurityLimits, TransferResult } from '../types/index.js';
import { query } from './db.js';

// PYUSD contract on Arbitrum (verified via successful transactions)
const PYUSD_CONTRACT = '0x46850ad61c2b7d64d08c9c754f45254596696984';
const PYUSD_DECIMALS = 6;
const PYUSD_ABI = ['function balanceOf(address owner) view returns (uint256)'];

// CDP v2 Client (singleton)
let cdpClient: CdpClient | null = null;

function getCDPClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient();
    console.log('✅ CDP v2 Client initialized');
  }
  return cdpClient;
}

// Security limits for MVP
const SECURITY_LIMITS: SecurityLimits = {
  dailyLimit: 500, // $500 PYUSD per day
  transactionLimit: 100, // $100 PYUSD per transaction
  sessionDurationHours: 24, // 24 hour sessions
};

/**
 * Create a new wallet for a user
 */
export async function createUserWallet(
  phoneNumber: string
): Promise<UserWallet> {
  try {
    console.log(`\n🏦 Creating CDP wallet for +${phoneNumber}...`);

    const cdp = getCDPClient();

    // Sanitize phone number for CDP wallet name (alphanumeric and hyphens only, 2-36 chars)
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const accountName = `wallet-${sanitizedPhone}`;

    console.log(`   Sanitized account name: ${accountName}`);

    // Create new account using CDP v2
    const account = await cdp.evm.createAccount({ name: accountName });
    const walletAddress = account.address;

    console.log(`✅ CDP Wallet created:`);
    console.log(`   Account Name: ${accountName}`);
    console.log(`   Address: ${walletAddress}`);

    // Create user wallet record
    const userWallet: UserWallet = {
      phoneNumber,
      cdpWalletId: accountName,
      walletAddress,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
    };

    // Store in database
    await query(
      `INSERT INTO phone_registry 
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (phone_number) 
       DO UPDATE SET 
         cdp_wallet_name = EXCLUDED.cdp_wallet_name,
         wallet_address = EXCLUDED.wallet_address,
         last_activity = EXCLUDED.last_activity`,
      [
        phoneNumber,
        accountName,
        walletAddress,
        userWallet.createdAt,
        userWallet.lastActivity,
        userWallet.dailySpent,
        userWallet.lastResetDate,
      ]
    );

    console.log(`✅ User wallet registered in database for +${phoneNumber}`);
    return userWallet;
  } catch (error) {
    console.error(`❌ Failed to create wallet for +${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Get user wallet by phone number
 */
export async function getUserWallet(
  phoneNumber: string
): Promise<UserWallet | null> {
  try {
    const result = await query<{
      phone_number: string;
      cdp_wallet_name: string;
      wallet_address: string;
      created_at: string;
      last_activity: string;
      daily_spent: string;
      last_reset_date: string;
    }>('SELECT * FROM phone_registry WHERE phone_number = $1', [phoneNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      phoneNumber: row.phone_number,
      cdpWalletId: row.cdp_wallet_name,
      walletAddress: row.wallet_address,
      createdAt: parseInt(row.created_at),
      lastActivity: parseInt(row.last_activity),
      dailySpent: parseFloat(row.daily_spent),
      lastResetDate: row.last_reset_date,
    };
  } catch (error) {
    console.error(`❌ Failed to get wallet for +${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Update user's last activity (for session management)
 */
export async function updateLastActivity(
  phoneNumber: string
): Promise<boolean> {
  try {
    const userWallet = await getUserWallet(phoneNumber);
    if (!userWallet) return false;

    const now = Date.now();
    const today = new Date().toDateString();

    // Reset daily spending if it's a new day
    let dailySpent = userWallet.dailySpent;
    if (userWallet.lastResetDate !== today) {
      dailySpent = 0;
      console.log(`📅 Daily spending reset for +${phoneNumber}`);
    }

    await query(
      `UPDATE phone_registry 
       SET last_activity = $1, daily_spent = $2, last_reset_date = $3
       WHERE phone_number = $4`,
      [now, dailySpent, today, phoneNumber]
    );

    return true;
  } catch (error) {
    console.error(`❌ Failed to update activity for +${phoneNumber}:`, error);
    return false;
  }
}

/**
 * Check if user session is still valid
 */
export async function isSessionValid(phoneNumber: string): Promise<boolean> {
  const userWallet = await getUserWallet(phoneNumber);
  if (!userWallet) return false;

  const sessionAge = Date.now() - userWallet.lastActivity;
  const sessionLimit = SECURITY_LIMITS.sessionDurationHours * 60 * 60 * 1000;

  return sessionAge < sessionLimit;
}

/**
 * Check if transfer amount is within security limits
 */
export async function checkSecurityLimits(
  phoneNumber: string,
  amount: number
): Promise<{ allowed: boolean; reason?: string }> {
  const userWallet = await getUserWallet(phoneNumber);
  if (!userWallet) {
    return { allowed: false, reason: 'User wallet not found' };
  }

  // Check transaction limit
  if (amount > SECURITY_LIMITS.transactionLimit) {
    return {
      allowed: false,
      reason: `Transaction limit exceeded. Max: $${SECURITY_LIMITS.transactionLimit} per transaction`,
    };
  }

  // Check daily limit
  if (userWallet.dailySpent + amount > SECURITY_LIMITS.dailyLimit) {
    const remaining = SECURITY_LIMITS.dailyLimit - userWallet.dailySpent;
    return {
      allowed: false,
      reason: `Daily limit exceeded. Remaining: $${remaining.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

/**
 * Get PYUSD balance for user using ethers.js
 */
export async function getUserBalance(phoneNumber: string): Promise<number> {
  const userWallet = await getUserWallet(phoneNumber);
  if (!userWallet) {
    throw new Error('User wallet not found');
  }

  try {
    console.log(`\n💰 Getting PYUSD balance for +${phoneNumber}...`);

    // Use ethers to check PYUSD balance directly
    const provider = new ethers.providers.JsonRpcProvider(
      'https://arb1.arbitrum.io/rpc'
    );
    const pyusdContract = new ethers.Contract(
      PYUSD_CONTRACT,
      PYUSD_ABI,
      provider
    );

    const balance = await pyusdContract.balanceOf(userWallet.walletAddress);
    const balanceAmount = parseFloat(
      ethers.utils.formatUnits(balance, PYUSD_DECIMALS)
    );

    console.log(`✅ Balance: ${balanceAmount} PYUSD`);
    return balanceAmount;
  } catch (error) {
    console.error(`❌ Failed to get balance for +${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Send PYUSD to another address using CDP SDK v2
 */
export async function sendPYUSD(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  const userWallet = await getUserWallet(fromPhoneNumber);
  if (!userWallet) {
    throw new Error('Sender wallet not found');
  }

  try {
    console.log(
      `\n💸 Sending ${amount} PYUSD from +${fromPhoneNumber} to ${toAddress}...`
    );

    const cdp = getCDPClient();

    // Get account by name
    const accountName = userWallet.cdpWalletId;
    const account = await cdp.evm.getOrCreateAccount({ name: accountName });

    console.log(`✅ Account loaded: ${account.address}`);

    // Prepare PYUSD transfer call data
    console.log(`📝 Preparing PYUSD transfer...`);

    // Use ethers.utils.parseUnits for precise decimal handling
    const amountBigNumber = ethers.utils.parseUnits(
      amount.toString(),
      PYUSD_DECIMALS
    );
    const selector = '0xa9059cbb'; // transfer(address,uint256)
    const toAddressPadded = ethers.utils.hexZeroPad(toAddress, 32).slice(2);
    const amountPadded = ethers.utils
      .hexZeroPad(amountBigNumber.toHexString(), 32)
      .slice(2);
    const callData =
      `${selector}${toAddressPadded}${amountPadded}` as `0x${string}`;

    console.log(
      `   Amount: ${amount} PYUSD (${amountBigNumber.toString()} units)`
    );
    console.log(`   Sending transaction...\n`);

    // Send transaction via CDP v2
    const result = await cdp.evm.sendTransaction({
      address: account.address,
      transaction: {
        to: PYUSD_CONTRACT as `0x${string}`,
        data: callData,
      },
      network: 'arbitrum' as any,
    });

    console.log(`✅ Transfer successful! Hash: ${result.transactionHash}`);

    // Update daily spending in database
    const newDailySpent = userWallet.dailySpent + amount;
    await query(
      'UPDATE phone_registry SET daily_spent = $1, last_activity = $2 WHERE phone_number = $3',
      [newDailySpent, Date.now(), fromPhoneNumber]
    );

    return {
      transactionHash: result.transactionHash,
      amount,
      recipient: toAddress,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`❌ Failed to send PYUSD:`, error);
    throw error;
  }
}

/**
 * Send PYUSD to another user by phone number
 */
export async function sendPYUSDToUser(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number
): Promise<TransferResult> {
  const toUserWallet = await getUserWallet(toPhoneNumber);
  if (!toUserWallet) {
    throw new Error('Recipient not registered with Sippy');
  }

  return await sendPYUSD(fromPhoneNumber, toUserWallet.walletAddress, amount);
}

/**
 * Get all registered wallets (for debugging)
 */
export async function getAllWallets(): Promise<
  Array<{
    phone: string;
    wallet: string;
    address: string;
  }>
> {
  try {
    const result = await query<{
      phone_number: string;
      cdp_wallet_name: string;
      wallet_address: string;
    }>(
      'SELECT phone_number, cdp_wallet_name, wallet_address FROM phone_registry ORDER BY phone_number'
    );

    return result.rows.map((row) => ({
      phone: `+${row.phone_number}`,
      wallet: row.cdp_wallet_name,
      address: row.wallet_address,
    }));
  } catch (error) {
    console.error('❌ Failed to get all wallets:', error);
    return [];
  }
}

/**
 * Get security limits (for info display)
 */
export function getSecurityLimits(): SecurityLimits {
  return { ...SECURITY_LIMITS };
}

/**
 * CDP Server Wallet Service v2
 *
 * Handles wallet creation, transfers, and balance queries using Coinbase CDP SDK v2
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';
import { UserWallet, SecurityLimits, TransferResult } from '../types/index.js';
import { promises as fs } from 'fs';
import path from 'path';

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

// Persistent storage for wallets (JSON file for MVP - use database in production)
const WALLET_STORAGE_PATH = path.join(process.cwd(), 'wallets.json');
const userWallets = new Map<string, UserWallet>();

// Load wallets from persistent storage on startup
async function loadWallets(): Promise<void> {
  try {
    const data = await fs.readFile(WALLET_STORAGE_PATH, 'utf8');
    const walletsData = JSON.parse(data);

    for (const [phoneNumber, walletData] of Object.entries(walletsData)) {
      userWallets.set(phoneNumber, walletData as UserWallet);
    }

    console.log(`✅ Loaded ${userWallets.size} wallets from storage`);
  } catch (error: any) {
    // CRITICAL: Only swallow file-not-found errors
    if (error.code === 'ENOENT') {
      console.log('📂 No existing wallet storage found - starting fresh');
      return;
    }

    // Critical error - don't start service with corrupted/unreadable wallet data
    console.error('💥 CRITICAL: Failed to load wallet storage!');
    console.error('💥 Error:', error.message);
    console.error(
      '💥 This could indicate corrupted wallets.json or permission issues'
    );
    console.error('💥 Service startup aborted to prevent data loss');
    throw error;
  }
}

// Save wallets to persistent storage
async function saveWallets(): Promise<void> {
  try {
    const walletsData = Object.fromEntries(userWallets.entries());
    await fs.writeFile(
      WALLET_STORAGE_PATH,
      JSON.stringify(walletsData, null, 2)
    );
    console.log(`💾 Saved ${userWallets.size} wallets to storage`);
  } catch (error) {
    console.error('❌ Failed to save wallets:', error);
  }
}

// Initialize wallet storage - MUST complete before serving requests
let walletsReady = false;
let walletInitPromise: Promise<void>;

async function initializeWalletStorage(): Promise<void> {
  if (walletsReady) return;

  try {
    await loadWallets();
    walletsReady = true;
    console.log('🔥 Wallet service ready - safe to handle requests');
  } catch (error) {
    console.error('💥 Failed to initialize wallet storage:', error);
    throw error;
  }
}

// Start initialization immediately
walletInitPromise = initializeWalletStorage();

// Export function to ensure wallets are ready before operations
export async function ensureWalletsReady(): Promise<void> {
  await walletInitPromise;
}

/**
 * Create a new wallet for a user
 */
export async function createUserWallet(
  phoneNumber: string
): Promise<UserWallet> {
  await ensureWalletsReady();

  try {
    console.log(`\n🏦 Creating CDP wallet for +${phoneNumber}...`);

    const cdp = getCDPClient();
    const accountName = `wallet-${phoneNumber}`;

    // Create new account using CDP v2
    const account = await cdp.evm.createAccount({ name: accountName });
    const walletAddress = account.address;

    console.log(`✅ CDP Wallet created:`);
    console.log(`   Account Name: ${accountName}`);
    console.log(`   Address: ${walletAddress}`);

    // Create user wallet record
    const userWallet: UserWallet = {
      phoneNumber,
      cdpWalletId: accountName, // Store account name instead of wallet ID for v2
      walletAddress,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
    };

    // Store in memory and persist to file
    userWallets.set(phoneNumber, userWallet);
    await saveWallets();

    console.log(`✅ User wallet registered and saved for +${phoneNumber}`);
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
  await ensureWalletsReady();
  return userWallets.get(phoneNumber) || null;
}

/**
 * Update user's last activity (for session management)
 */
export async function updateLastActivity(
  phoneNumber: string
): Promise<boolean> {
  await ensureWalletsReady();
  const userWallet = userWallets.get(phoneNumber);
  if (!userWallet) return false;

  userWallet.lastActivity = Date.now();

  // Reset daily spending if it's a new day
  const today = new Date().toDateString();
  if (userWallet.lastResetDate !== today) {
    userWallet.dailySpent = 0;
    userWallet.lastResetDate = today;
    console.log(`📅 Daily spending reset for +${phoneNumber}`);
  }

  // Persist changes
  await saveWallets();
  return true;
}

/**
 * Check if user session is still valid
 */
export async function isSessionValid(phoneNumber: string): Promise<boolean> {
  await ensureWalletsReady();
  const userWallet = userWallets.get(phoneNumber);
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
  await ensureWalletsReady();
  const userWallet = userWallets.get(phoneNumber);
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
  await ensureWalletsReady();

  const userWallet = userWallets.get(phoneNumber);
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
  await ensureWalletsReady();

  const userWallet = userWallets.get(fromPhoneNumber);
  if (!userWallet) {
    throw new Error('Sender wallet not found');
  }

  try {
    console.log(
      `\n💸 Sending ${amount} PYUSD from +${fromPhoneNumber} to ${toAddress}...`
    );

    const cdp = getCDPClient();

    // Get account by name
    const accountName = userWallet.cdpWalletId; // This is the account name
    const account = await cdp.evm.getOrCreateAccount({ name: accountName });

    console.log(`✅ Account loaded: ${account.address}`);

    // Prepare PYUSD transfer call data
    console.log(`📝 Preparing PYUSD transfer...`);

    // Use ethers.utils.parseUnits for precise decimal handling (avoids float precision issues)
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

    // Update daily spending and persist
    userWallet.dailySpent += amount;
    await updateLastActivity(fromPhoneNumber);

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
  await ensureWalletsReady();

  const toUserWallet = userWallets.get(toPhoneNumber);
  if (!toUserWallet) {
    throw new Error('Recipient not registered with SIPPY');
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
  await ensureWalletsReady();
  return Array.from(userWallets.entries()).map(([phone, wallet]) => ({
    phone: `+${phone}`,
    wallet: wallet.cdpWalletId,
    address: wallet.walletAddress,
  }));
}

/**
 * Get security limits (for info display)
 */
export function getSecurityLimits(): SecurityLimits {
  return { ...SECURITY_LIMITS };
}

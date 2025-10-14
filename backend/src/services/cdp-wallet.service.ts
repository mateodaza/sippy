/**
 * CDP Server Wallet Service
 *
 * Handles wallet creation, transfers, and balance queries using Coinbase CDP Server Wallet v2
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { UserWallet, SecurityLimits, TransferResult } from '../types';
import { promises as fs } from 'fs';
import path from 'path';

// Configure CDP (do this once at startup)
let cdpConfigured = false;

function configureCDP() {
  if (cdpConfigured) return;

  try {
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_NAME || '',
      privateKey: process.env.CDP_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
      useServerSigner: false, // REVERT: Server Signer requires AWS infrastructure deployment
    });
    cdpConfigured = true;
    console.log('✅ CDP configured successfully');
  } catch (error) {
    console.error('❌ Failed to configure CDP:', error);
    throw error;
  }
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
const walletInstances = new Map<string, Wallet>(); // Cache wallet instances

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
    // All other errors (corruption, permission, parse failures) should bubble up
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

// Rehydrate wallet instance from CDP using wallet ID
async function rehydrateWallet(
  phoneNumber: string
): Promise<Wallet | undefined> {
  const userWallet = userWallets.get(phoneNumber);
  if (!userWallet) return undefined;

  try {
    console.log(
      `🔄 Rehydrating wallet ${userWallet.cdpWalletId} for +${phoneNumber}`
    );
    const wallet = await Wallet.fetch(userWallet.cdpWalletId);
    walletInstances.set(phoneNumber, wallet);
    return wallet;
  } catch (error) {
    console.error(`❌ Failed to rehydrate wallet for +${phoneNumber}:`, error);
    return undefined;
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
  configureCDP();
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before operation

  try {
    console.log(`\n🏦 Creating CDP wallet for +${phoneNumber}...`);

    // Create new CDP wallet on Arbitrum Mainnet (where PYUSD is available)
    const wallet = await Wallet.create({ networkId: 'arbitrum-mainnet' });
    const defaultAddress = await wallet.getDefaultAddress();
    const walletAddress = defaultAddress.getId();

    const walletId = wallet.getId();
    if (!walletId) {
      throw new Error('Failed to get wallet ID');
    }

    console.log(`✅ CDP Wallet created:`);
    console.log(`   Wallet ID: ${walletId}`);
    console.log(`   Address: ${walletAddress}`);

    // Cache wallet instance for future use
    walletInstances.set(phoneNumber, wallet);

    // Create user wallet record
    const userWallet: UserWallet = {
      phoneNumber,
      cdpWalletId: walletId,
      walletAddress,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
    };

    // Store in memory and persist to file
    userWallets.set(phoneNumber, userWallet);
    await saveWallets(); // Persist to storage

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
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before lookup
  return userWallets.get(phoneNumber) || null;
}

/**
 * Update user's last activity (for session management)
 */
export async function updateLastActivity(
  phoneNumber: string
): Promise<boolean> {
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before lookup
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
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before lookup
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
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before lookup
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
 * Get PYUSD balance for user
 */
export async function getUserBalance(phoneNumber: string): Promise<number> {
  configureCDP();
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before operation

  const userWallet = userWallets.get(phoneNumber);
  if (!userWallet) {
    throw new Error('User wallet not found');
  }

  try {
    console.log(`\n💰 Getting balance for +${phoneNumber}...`);

    // Try to get cached wallet instance first, then rehydrate if needed
    let wallet = walletInstances.get(phoneNumber);
    if (!wallet) {
      console.log(`🔄 Wallet not in cache, rehydrating from CDP...`);
      wallet = await rehydrateWallet(phoneNumber);
      if (!wallet) {
        throw new Error('Failed to rehydrate wallet from CDP');
      }
    }

    const defaultAddress = await wallet.getDefaultAddress();

    // Get PYUSD balance on Arbitrum
    const balance = await defaultAddress.getBalance('PYUSD');
    const balanceAmount = parseFloat(balance.toString());

    console.log(`✅ Balance: ${balanceAmount} PYUSD`);
    return balanceAmount;
  } catch (error) {
    console.error(`❌ Failed to get balance for +${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Send PYUSD to another address
 */
export async function sendPYUSD(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  configureCDP();
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before operation

  const userWallet = userWallets.get(fromPhoneNumber);
  if (!userWallet) {
    throw new Error('Sender wallet not found');
  }

  try {
    console.log(
      `\n💸 Sending ${amount} PYUSD from +${fromPhoneNumber} to ${toAddress}...`
    );

    // Try to get cached wallet instance first, then rehydrate if needed
    let wallet = walletInstances.get(fromPhoneNumber);
    if (!wallet) {
      console.log(`🔄 Wallet not in cache, rehydrating from CDP...`);
      wallet = await rehydrateWallet(fromPhoneNumber);
      if (!wallet) {
        throw new Error('Failed to rehydrate wallet from CDP');
      }
    }

    // Create gasless transfer (no ETH needed for gas fees)
    const transfer = await wallet.createTransfer({
      amount: amount,
      assetId: 'PYUSD',
      destination: toAddress,
      gasless: true, // EXPERIMENT: Test if gasless works with Smart Accounts/Paymasters
    });

    // Wait for completion
    await transfer.wait();
    const transactionHash = transfer.getTransactionHash();

    // Update daily spending and persist
    userWallet.dailySpent += amount;
    await updateLastActivity(fromPhoneNumber); // This now persists automatically

    console.log(`✅ Transfer completed! Hash: ${transactionHash}`);

    return {
      transactionHash: transactionHash || '',
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
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before operation

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
  await ensureWalletsReady(); // CRITICAL: Ensure wallets loaded before lookup
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

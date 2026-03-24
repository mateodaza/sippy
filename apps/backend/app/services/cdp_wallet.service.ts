/**
 * CDP Server Wallet Service v2 (PostgreSQL)
 *
 * Handles wallet creation, transfers, and balance queries using Coinbase CDP SDK v2
 * with PostgreSQL storage
 */

import logger from '@adonisjs/core/services/logger'
import { CdpClient } from '@coinbase/cdp-sdk'
import { ethers } from 'ethers'
import { type UserWallet, type SecurityLimits, type TransferResult } from '#types/index'
import { query } from '#services/db'
import { registerWalletWithIndexer } from '#services/indexer.service'
import { getRpcUrl } from '#config/network'
import { maskPhone } from '#utils/phone'

const CDP_TIMEOUT_MS = 30_000

export class CdpTimeoutError extends Error {
  constructor(label: string) {
    super(`CDP timeout: ${label} exceeded ${CDP_TIMEOUT_MS}ms`)
    this.name = 'CdpTimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new CdpTimeoutError(label)), CDP_TIMEOUT_MS)
    ),
  ])
}

/**
 * Compatibility helper: queries phone_registry with canonical phone first,
 * falls back to bare-digit format for pre-SH-003 rows.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function lookupByPhone(phoneNumber: string): Promise<{ rows: any[] }> {
  const result = await query('SELECT * FROM phone_registry WHERE phone_number = $1', [phoneNumber])
  if (result.rows.length > 0 || !phoneNumber.startsWith('+')) return result
  return query('SELECT * FROM phone_registry WHERE phone_number = $1', [phoneNumber.slice(1)])
}

// USDC contract on Arbitrum (native USDC)
const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const USDC_DECIMALS = 6
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)']

// CDP v2 Client (singleton)
let cdpClient: CdpClient | null = null

function getCDPClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient()
    logger.info('CDP v2 Client initialized')
  }
  return cdpClient
}

export const DAILY_LIMIT_UNVERIFIED = 50 // $50 USD
export const DAILY_LIMIT_VERIFIED = 500 // $500 USD

// Security limits for MVP
const SECURITY_LIMITS: SecurityLimits = {
  dailyLimit: DAILY_LIMIT_VERIFIED, // $500 USD per day
  transactionLimit: 100, // $100 USD per transaction
  sessionDurationHours: 24, // 24 hour sessions
}

/**
 * Create a new wallet for a user
 */
export async function createUserWallet(phoneNumber: string): Promise<UserWallet> {
  try {
    logger.info(`Creating CDP wallet for ${maskPhone(phoneNumber)}...`)

    const cdp = getCDPClient()

    // Sanitize phone number for CDP wallet name (alphanumeric and hyphens only, 2-36 chars)
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '')
    const accountName = `wallet-${sanitizedPhone}`

    logger.info(`   Sanitized account name: ${accountName}`)

    // Create new account using CDP v2
    const account = await withTimeout(cdp.evm.createAccount({ name: accountName }), 'createAccount')
    const walletAddress = account.address

    logger.info(`CDP Wallet created:`)
    logger.info(`   Account Name: ${accountName}`)
    logger.info(`   Address: ${walletAddress}`)

    // Create user wallet record
    const userWallet: UserWallet = {
      phoneNumber,
      cdpWalletId: accountName,
      walletAddress,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
    }

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
    )

    logger.info(`User wallet registered in database for ${maskPhone(phoneNumber)}`)

    // Register with indexer (fire-and-forget — never blocks wallet creation)
    registerWalletWithIndexer(walletAddress, phoneNumber).catch((err) =>
      logger.warn('Indexer registration failed (non-blocking): %o', err)
    )

    return userWallet
  } catch (error) {
    logger.error(`Failed to create wallet for ${phoneNumber}: %o`, error)
    throw error
  }
}

/**
 * Get user wallet by phone number
 */
export async function getUserWallet(phoneNumber: string): Promise<UserWallet | null> {
  try {
    const result = (await lookupByPhone(phoneNumber)) as {
      rows: Array<{
        phone_number: string
        cdp_wallet_name: string
        wallet_address: string
        created_at: string
        last_activity: string
        daily_spent: string
        last_reset_date: string
      }>
    }

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      phoneNumber: row.phone_number,
      cdpWalletId: row.cdp_wallet_name,
      walletAddress: row.wallet_address,
      createdAt: Number.parseInt(row.created_at),
      lastActivity: Number.parseInt(row.last_activity),
      dailySpent: Number.parseFloat(row.daily_spent),
      lastResetDate: row.last_reset_date,
    }
  } catch (error) {
    logger.error(`Failed to get wallet for ${phoneNumber}: %o`, error)
    throw error
  }
}

/**
 * Update user's last activity (for session management)
 */
export async function updateLastActivity(phoneNumber: string): Promise<boolean> {
  try {
    const userWallet = await getUserWallet(phoneNumber)
    if (!userWallet) return false

    const now = Date.now()
    const today = new Date().toDateString()

    // Reset daily spending if it's a new day
    let dailySpent = userWallet.dailySpent
    if (userWallet.lastResetDate !== today) {
      dailySpent = 0
      logger.info(`Daily spending reset for ${maskPhone(phoneNumber)}`)
    }

    let updateResult = await query(
      `UPDATE phone_registry
       SET last_activity = $1, daily_spent = $2, last_reset_date = $3
       WHERE phone_number = $4`,
      [now, dailySpent, today, phoneNumber]
    )

    // Compatibility: fall back to bare-digit format for pre-SH-003 rows.
    // Remove after SH-003 backfill is confirmed complete.
    if (updateResult.rowCount === 0 && phoneNumber.startsWith('+')) {
      updateResult = await query(
        `UPDATE phone_registry
         SET last_activity = $1, daily_spent = $2, last_reset_date = $3
         WHERE phone_number = $4`,
        [now, dailySpent, today, phoneNumber.slice(1)]
      )
    }

    return true
  } catch (error) {
    logger.error(`Failed to update activity for ${phoneNumber}: %o`, error)
    return false
  }
}

/**
 * Check if user session is still valid
 */
export async function isSessionValid(phoneNumber: string): Promise<boolean> {
  const userWallet = await getUserWallet(phoneNumber)
  if (!userWallet) return false

  const sessionAge = Date.now() - userWallet.lastActivity
  const sessionLimit = SECURITY_LIMITS.sessionDurationHours * 60 * 60 * 1000

  return sessionAge < sessionLimit
}

/**
 * Pure helper: compute whether a transfer is allowed given email verification status.
 * No DB calls — directly unit-testable.
 */
export function computeSecurityLimits(
  emailVerified: boolean,
  dailySpent: number,
  amount: number
): {
  allowed: boolean
  reason?: string
  emailVerified?: boolean
  limitType?: 'transaction' | 'daily'
} {
  const effectiveLimit = emailVerified ? DAILY_LIMIT_VERIFIED : DAILY_LIMIT_UNVERIFIED

  if (amount > SECURITY_LIMITS.transactionLimit) {
    return {
      allowed: false,
      reason: `Transaction limit exceeded. Max: $${SECURITY_LIMITS.transactionLimit} per transaction`,
      limitType: 'transaction',
    }
  }

  if (dailySpent + amount > effectiveLimit) {
    const remaining = effectiveLimit - dailySpent
    return {
      allowed: false,
      reason: `Daily limit exceeded. Remaining: $${remaining.toFixed(2)}`,
      emailVerified,
      limitType: 'daily',
    }
  }

  return { allowed: true, emailVerified }
}

/**
 * Check if transfer amount is within security limits
 */
export async function checkSecurityLimits(
  phoneNumber: string,
  amount: number
): Promise<{
  allowed: boolean
  reason?: string
  emailVerified?: boolean
  limitType?: 'transaction' | 'daily'
}> {
  const userWallet = await getUserWallet(phoneNumber)
  if (!userWallet) {
    return { allowed: false, reason: 'User wallet not found' }
  }

  // Look up email_verified from user_preferences.
  // During SH-003 transition, a canonical (+...) row with email_verified = false/null
  // can coexist with a bare-digit row with email_verified = true (documented at
  // db.ts — setUserLanguage comment). Check both formats: if either has email_verified
  // = true, treat the user as verified. Remove after SH-003 backfill confirmed complete.
  const canonicalResult = await query(
    'SELECT email_verified FROM user_preferences WHERE phone_number = $1',
    [phoneNumber]
  )
  let emailVerified = canonicalResult.rows[0]?.email_verified === true
  if (!emailVerified && phoneNumber.startsWith('+')) {
    const bareResult = await query(
      'SELECT email_verified FROM user_preferences WHERE phone_number = $1',
      [phoneNumber.slice(1)]
    )
    if (bareResult.rows[0]?.email_verified === true) {
      emailVerified = true
    }
  }

  // Reset daily spending if it's a new day (same logic as updateLastActivity)
  const today = new Date().toDateString()
  const dailySpent = userWallet.lastResetDate !== today ? 0 : userWallet.dailySpent

  return computeSecurityLimits(emailVerified, dailySpent, amount)
}

/**
 * Get USDC balance for user using ethers.js
 */
export async function getUserBalance(phoneNumber: string): Promise<number> {
  const userWallet = await getUserWallet(phoneNumber)
  if (!userWallet) {
    throw new Error('User wallet not found')
  }

  try {
    logger.info(`Getting USDC balance for ${maskPhone(phoneNumber)}...`)

    // Use ethers to check USDC balance directly
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
    const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, provider)

    const balance = await usdcContract.balanceOf(userWallet.walletAddress)
    const balanceAmount = Number.parseFloat(ethers.utils.formatUnits(balance, USDC_DECIMALS))

    logger.info(`Balance: ${balanceAmount} USDC`)
    return balanceAmount
  } catch (error) {
    logger.error(`Failed to get balance for ${phoneNumber}: %o`, error)
    throw error
  }
}

/**
 * Send USDC to another address using CDP SDK v2
 */
export async function sendUSDC(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<TransferResult> {
  const userWallet = await getUserWallet(fromPhoneNumber)
  if (!userWallet) {
    throw new Error('Sender wallet not found')
  }

  try {
    logger.info(`Sending ${amount} USDC from ${maskPhone(fromPhoneNumber)} to ${toAddress}...`)

    const cdp = getCDPClient()

    // Get account by name
    const accountName = userWallet.cdpWalletId
    const account = await withTimeout(
      cdp.evm.getOrCreateAccount({ name: accountName }),
      'getOrCreateAccount'
    )

    logger.info(`Account loaded: ${account.address}`)

    // Prepare USDC transfer call data
    logger.info(`Preparing USDC transfer...`)

    // Use ethers.utils.parseUnits for precise decimal handling
    const amountBigNumber = ethers.utils.parseUnits(amount.toString(), USDC_DECIMALS)
    const selector = '0xa9059cbb' // transfer(address,uint256)
    const toAddressPadded = ethers.utils.hexZeroPad(toAddress, 32).slice(2)
    const amountPadded = ethers.utils.hexZeroPad(amountBigNumber.toHexString(), 32).slice(2)
    const callData = `${selector}${toAddressPadded}${amountPadded}` as `0x${string}`

    logger.info(`   Amount: ${amount} USDC (${amountBigNumber.toString()} units)`)
    logger.info(`   Sending transaction...`)

    // Send transaction via CDP v2
    const result = await withTimeout(
      cdp.evm.sendTransaction({
        address: account.address,
        transaction: {
          to: USDC_CONTRACT as `0x${string}`,
          data: callData,
        },
        network: 'arbitrum' as any,
      }),
      'sendTransaction'
    )

    logger.info(`Transfer successful! Hash: ${result.transactionHash}`)

    // Update daily spending in database
    const newDailySpent = userWallet.dailySpent + amount
    const updateResult = await query(
      'UPDATE phone_registry SET daily_spent = $1, last_activity = $2 WHERE phone_number = $3',
      [newDailySpent, Date.now(), fromPhoneNumber]
    )
    // SH-003 fallback: retry with bare-digit format. Remove after backfill confirmed.
    if ((updateResult.rowCount ?? 0) === 0 && fromPhoneNumber.startsWith('+')) {
      const fallbackResult = await query(
        'UPDATE phone_registry SET daily_spent = $1, last_activity = $2 WHERE phone_number = $3',
        [newDailySpent, Date.now(), fromPhoneNumber.slice(1)]
      )
      if ((fallbackResult.rowCount ?? 0) === 0) {
        const maskedPhone = maskPhone(fromPhoneNumber)
        logger.error(
          { alert: 'spend-tracking-failure', phone: maskedPhone, amount },
          'Daily spend update failed after successful transfer — spend limits may not advance'
        )
      }
    } else if ((updateResult.rowCount ?? 0) === 0) {
      const maskedPhone = maskPhone(fromPhoneNumber)
      logger.error(
        { alert: 'spend-tracking-failure', phone: maskedPhone, amount },
        'Daily spend update failed after successful transfer — spend limits may not advance'
      )
    }

    return {
      transactionHash: result.transactionHash,
      amount,
      recipient: toAddress,
      timestamp: Date.now(),
    }
  } catch (error) {
    logger.error(`Failed to send USDC: %o`, error)
    throw error
  }
}

/**
 * Send USDC to another user by phone number
 */
export async function sendUSDCToUser(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number
): Promise<TransferResult> {
  const toUserWallet = await getUserWallet(toPhoneNumber)
  if (!toUserWallet) {
    throw new Error('Recipient not registered with Sippy')
  }

  return await sendUSDC(fromPhoneNumber, toUserWallet.walletAddress, amount)
}

/**
 * Get all registered wallets (for debugging)
 */
export async function getAllWallets(): Promise<
  Array<{
    phone: string
    wallet: string
    address: string
  }>
> {
  try {
    const result = await query<{
      phone_number: string
      cdp_wallet_name: string
      wallet_address: string
    }>(
      'SELECT phone_number, cdp_wallet_name, wallet_address FROM phone_registry ORDER BY phone_number'
    )

    return result.rows.map((row) => ({
      phone: row.phone_number.startsWith('+') ? row.phone_number : `+${row.phone_number}`,
      wallet: row.cdp_wallet_name,
      address: row.wallet_address,
    }))
  } catch (error) {
    logger.error('Failed to get all wallets: %o', error)
    throw error
  }
}

/**
 * Get security limits (for info display)
 */
export function getSecurityLimits(): SecurityLimits {
  return { ...SECURITY_LIMITS }
}

/**
 * Pure helper: compute accumulated daily_spent after a transfer.
 * Resets to `amount` if `lastResetDate` differs from `today`; otherwise accumulates.
 */
export function computeNewDailySpent(
  currentDailySpent: number,
  lastResetDate: string,
  amount: number,
  today: string
): number {
  return lastResetDate !== today ? amount : currentDailySpent + amount
}

/**
 * Get the security limit status for a user (daily spent, effective limit, remaining).
 * Works for both legacy and embedded wallet users.
 * Never returns null.
 */
export async function getSecurityLimitStatus(phoneNumber: string): Promise<{
  dailySpent: number
  effectiveLimit: number
  remaining: number
  emailVerified: boolean
}> {
  // Dual-format email_verified lookup (SH-003 transition)
  const canonicalResult = await query(
    'SELECT email_verified FROM user_preferences WHERE phone_number = $1',
    [phoneNumber]
  )
  let emailVerified = canonicalResult.rows[0]?.email_verified === true
  if (!emailVerified && phoneNumber.startsWith('+')) {
    const bareResult = await query(
      'SELECT email_verified FROM user_preferences WHERE phone_number = $1',
      [phoneNumber.slice(1)]
    )
    if (bareResult.rows[0]?.email_verified === true) {
      emailVerified = true
    }
  }

  const userWallet = await getUserWallet(phoneNumber)
  const today = new Date().toDateString()
  let dailySpent = userWallet?.dailySpent ?? 0
  if (userWallet && userWallet.lastResetDate !== today) {
    dailySpent = 0
  }

  const effectiveLimit = emailVerified ? DAILY_LIMIT_VERIFIED : DAILY_LIMIT_UNVERIFIED

  return {
    dailySpent,
    effectiveLimit,
    remaining: Math.max(0, effectiveLimit - dailySpent),
    emailVerified,
  }
}

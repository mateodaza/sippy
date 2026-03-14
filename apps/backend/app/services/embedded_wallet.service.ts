/**
 * Embedded Wallet Service
 *
 * Handles transfers using spend permissions for embedded (self-custodial) wallets.
 * This replaces the old server wallet approach where Sippy held custody.
 *
 * Key insight: SpendPermissionManager.spend() always sends tokens to the spender.
 * To send to a recipient, we batch two calls in one atomic user operation:
 * 1. SpendPermissionManager.spend() - pulls USDC from user to spender
 * 2. USDC.transfer() - sends USDC from spender to recipient
 */

import logger from '@adonisjs/core/services/logger'
import { CdpClient } from '@coinbase/cdp-sdk'
import { ethers } from 'ethers'
import { query } from '#services/db'

/**
 * Compatibility helper: queries phone_registry with canonical phone first,
 * falls back to bare-digit format for pre-SH-003 rows.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function lookupByPhone(phoneNumber: string): Promise<{ rows: any[] }> {
  const result = await query(
    `SELECT phone_number, wallet_address, spend_permission_hash, daily_limit
     FROM phone_registry WHERE phone_number = $1`,
    [phoneNumber]
  )
  if (result.rows.length > 0 || !phoneNumber.startsWith('+')) return result
  return query(
    `SELECT phone_number, wallet_address, spend_permission_hash, daily_limit
     FROM phone_registry WHERE phone_number = $1`,
    [phoneNumber.slice(1)]
  )
}
import {
  NETWORK,
  SIPPY_SPENDER_ADDRESS,
  USDC_DECIMALS,
  getRpcUrl,
  getUsdcAddress,
} from '#config/network'
import { type TransferResult } from '#types/index'

// SpendPermissionManager contract address (same on all supported networks)
const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad'

// ABIs for encoding contract calls (ethers format)
const SPEND_PERMISSION_MANAGER_ABI = [
  'function spend((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) spendPermission, uint160 value)',
  'function getCurrentPeriod((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) spendPermission) view returns (uint48 start, uint48 end, uint160 spend)',
]

const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)']

/** Shape of a spend permission entry returned by CDP listSpendPermissions */
interface SpendPermissionEntry {
  permissionHash: string
  network: string
  permission: {
    account: string
    spender: string
    token: string
    allowance: bigint | string
    period: bigint | number
    start: bigint | number
    end: bigint | number
    salt: bigint | string
    extraData: string
  }
}

/**
 * Extended transfer result with remaining allowance info
 */
export interface ExtendedTransferResult extends TransferResult {
  remainingAllowance?: number
  periodEndsAt?: number
}

// CDP client (singleton)
let cdpClient: CdpClient | null = null

function getCdpClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient()
    logger.info('CDP Client initialized for embedded wallets')
  }
  return cdpClient
}

// Sippy's spender smart account (uses spend permissions)

type SmartAccount = Awaited<ReturnType<CdpClient['evm']['getOrCreateSmartAccount']>>

let sippySpenderAccount: SmartAccount | null = null

export async function getSippySpenderAccount(): Promise<SmartAccount> {
  if (!sippySpenderAccount) {
    const cdp = getCdpClient()

    // Get or create Sippy's spender owner account (EOA)
    const ownerAccount = await cdp.evm.getOrCreateAccount({
      name: 'sippy-spender-owner',
    })

    // Get or create Sippy's spender smart account
    // This smart account will be granted spend permissions by users
    sippySpenderAccount = await cdp.evm.getOrCreateSmartAccount({
      name: 'sippy-spender',
      owner: ownerAccount,
    })

    logger.info(`Sippy spender wallet: ${sippySpenderAccount.address}`)
  }
  return sippySpenderAccount!
}

// USDC ABI for balance queries
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)']

/**
 * User wallet info from database
 */
interface EmbeddedUserWallet {
  phoneNumber: string
  walletAddress: string
  spendPermissionHash: string | null
  dailyLimit: number | null
}

/**
 * Get embedded wallet info by phone number
 */
export async function getEmbeddedWallet(phoneNumber: string): Promise<EmbeddedUserWallet | null> {
  try {
    const result = (await lookupByPhone(phoneNumber)) as {
      rows: Array<{
        phone_number: string
        wallet_address: string
        spend_permission_hash: string | null
        daily_limit: string | null
      }>
    }

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      phoneNumber: row.phone_number,
      walletAddress: row.wallet_address,
      spendPermissionHash: row.spend_permission_hash,
      dailyLimit: row.daily_limit ? Number.parseFloat(row.daily_limit) : null,
    }
  } catch (error) {
    logger.error(`Failed to get embedded wallet for ${phoneNumber}: %o`, error)
    throw error
  }
}

/**
 * Get USDC balance for embedded wallet
 */
export async function getEmbeddedBalance(phoneNumber: string): Promise<number> {
  const wallet = await getEmbeddedWallet(phoneNumber)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  try {
    logger.info(`Getting USDC balance for ${phoneNumber}...`)

    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
    const usdcContract = new ethers.Contract(getUsdcAddress(), USDC_ABI, provider)

    const balance = await usdcContract.balanceOf(wallet.walletAddress)
    const balanceAmount = Number.parseFloat(ethers.utils.formatUnits(balance, USDC_DECIMALS))

    logger.info(`Balance: ${balanceAmount} USDC`)
    return balanceAmount
  } catch (error) {
    logger.error(`Failed to get balance: %o`, error)
    throw error
  }
}

/**
 * Send USDC using spend permission
 *
 * This is the main transfer function for embedded wallets.
 * It batches two calls into ONE atomic user operation:
 * 1. SpendPermissionManager.spend() - pulls USDC from user to spender
 * 2. USDC.transfer() - sends USDC from spender to recipient
 *
 * This is atomic - either both succeed or both fail.
 */
export async function sendWithSpendPermission(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<ExtendedTransferResult> {
  const userWallet = await getEmbeddedWallet(fromPhoneNumber)

  if (!userWallet) {
    throw new Error('User wallet not found. Please set up your wallet first.')
  }

  if (!userWallet.spendPermissionHash) {
    throw new Error('No spend permission found. Please set up your wallet at sippy.lat/setup')
  }

  try {
    logger.info(
      `Sending ${amount} USDC from +${fromPhoneNumber} to ${toAddress} (via spend permission)...`
    )

    const cdp = getCdpClient()
    const spenderAccount = await getSippySpenderAccount()

    // Get all permissions for the user's wallet
    const allPermissions = await cdp.evm.listSpendPermissions({
      address: userWallet.walletAddress as `0x${string}`,
    })

    // Find the matching permission - prefer stored hash, fall back to most recent
    const usdcAddress = getUsdcAddress()

    const matchingPermissions =
      ((allPermissions.spendPermissions ?? []) as SpendPermissionEntry[])?.filter(
        (p) =>
          p.permission?.spender?.toLowerCase() === spenderAccount.address.toLowerCase() &&
          p.permission?.token?.toLowerCase() === usdcAddress.toLowerCase() &&
          p.network === NETWORK
      ) || []

    if (matchingPermissions.length === 0) {
      throw new Error(
        `No valid spend permission found for USDC on ${NETWORK}. User needs to re-authorize at sippy.lat/settings`
      )
    }

    // Use stored permission hash if available and still valid
    let permissionEntry = matchingPermissions.find(
      (p) => p.permissionHash === userWallet.spendPermissionHash
    )

    // Fall back to most recent permission (highest start time)
    if (!permissionEntry) {
      permissionEntry = matchingPermissions.sort(
        (a, b) => Number(b.permission?.start || 0) - Number(a.permission?.start || 0)
      )[0]
      logger.warn(`Stored permission hash not found, using most recent permission`)
    }

    logger.info(`Found spend permission: ${permissionEntry.permissionHash}`)

    // Pre-check remaining allowance for current period (better UX than generic onchain failure)
    const allowanceInfo = await getRemainingAllowance(fromPhoneNumber)
    if (allowanceInfo) {
      if (amount > allowanceInfo.remaining) {
        const hoursUntilReset = Math.ceil(
          (allowanceInfo.periodEndsAt - Date.now()) / (1000 * 60 * 60)
        )
        throw new Error(
          `Insufficient allowance. You have $${allowanceInfo.remaining.toFixed(2)} remaining today. ` +
            `Limit resets in ${hoursUntilReset} hour${hoursUntilReset === 1 ? '' : 's'}. ` +
            `Change your limit at sippy.lat/settings`
        )
      }
      logger.info(
        `Allowance check passed: $${amount} <= $${allowanceInfo.remaining.toFixed(2)} remaining`
      )
    }

    // Convert amount to USDC units (6 decimals)
    // Defense-in-depth: reject amounts with more than 6 decimal places before
    // passing to ethers — prevents opaque BigNumber errors from callers that
    // bypass controller-layer schema validation.
    const decimalParts = amount.toString().split('.')
    if (decimalParts[1] && decimalParts[1].length > 6) {
      throw new Error('Amount has too many decimal places (max 6 for USDC)')
    }
    const amountInUnits = BigInt(
      ethers.utils.parseUnits(amount.toString(), USDC_DECIMALS).toString()
    )

    // Extract the permission struct for the contract call
    const permission = permissionEntry.permission

    // Create interface for encoding
    const spendInterface = new ethers.utils.Interface(SPEND_PERMISSION_MANAGER_ABI)
    const erc20Interface = new ethers.utils.Interface(ERC20_TRANSFER_ABI)

    // Encode the spend() call to SpendPermissionManager
    const spendCallData = spendInterface.encodeFunctionData('spend', [
      {
        account: permission.account,
        spender: permission.spender,
        token: permission.token,
        allowance: permission.allowance,
        period: permission.period,
        start: permission.start,
        end: permission.end,
        salt: permission.salt,
        extraData: permission.extraData || '0x',
      },
      amountInUnits.toString(),
    ])

    // Encode the transfer() call to USDC
    const transferCallData = erc20Interface.encodeFunctionData('transfer', [
      toAddress,
      amountInUnits.toString(),
    ])

    logger.info(`Executing batched spend + transfer in one transaction...`)

    // Execute both calls atomically in a single user operation

    const userOpResult = await cdp.evm.sendUserOperation({
      smartAccount: spenderAccount,
      network: NETWORK as any, // Network string validated at config level
      calls: [
        {
          to: SPEND_PERMISSION_MANAGER as `0x${string}`,
          value: 0n,
          data: spendCallData as `0x${string}`,
        },
        {
          to: usdcAddress as `0x${string}`,
          value: 0n,
          data: transferCallData as `0x${string}`,
        },
      ],
    })

    // Wait for the user operation to complete
    const receipt = await spenderAccount.waitForUserOperation(userOpResult)
    const userOp = await spenderAccount.getUserOperation({
      userOpHash: receipt.userOpHash,
    })

    const txHash = userOp.transactionHash ?? receipt.userOpHash
    logger.info(`Transfer complete! Hash: ${txHash}`)

    // Track daily spend for embedded wallet users (mirrors updateLastActivity pattern)
    const { getUserWallet: getWallet, computeNewDailySpent } = await import('#services/cdp_wallet.service')
    const wallet = await getWallet(fromPhoneNumber)
    const today = new Date().toDateString()
    const newDailySpent = computeNewDailySpent(
      wallet?.dailySpent ?? 0,
      wallet?.lastResetDate ?? '',
      amount,
      today
    )

    let updateResult = await query(
      `UPDATE phone_registry
       SET last_activity = $1, daily_spent = $2, last_reset_date = $3
       WHERE phone_number = $4`,
      [Date.now(), newDailySpent, today, fromPhoneNumber]
    )

    // SH-003 transition fallback: retry with bare-digit format
    if (updateResult.rowCount === 0 && fromPhoneNumber.startsWith('+')) {
      await query(
        `UPDATE phone_registry
         SET last_activity = $1, daily_spent = $2, last_reset_date = $3
         WHERE phone_number = $4`,
        [Date.now(), newDailySpent, today, fromPhoneNumber.slice(1)]
      )
    }

    // Get remaining allowance after the transfer
    const postTransferAllowance = await getRemainingAllowance(fromPhoneNumber)

    return {
      transactionHash: txHash,
      amount,
      recipient: toAddress,
      timestamp: Date.now(),
      remainingAllowance: postTransferAllowance?.remaining,
      periodEndsAt: postTransferAllowance?.periodEndsAt,
    }
  } catch (error) {
    logger.error(`Failed to send USDC: %o`, error)
    throw error
  }
}

/**
 * Send USDC to another user by phone number
 *
 * Supports both embedded wallet recipients and legacy wallet recipients.
 */
export async function sendToPhoneNumber(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number
): Promise<ExtendedTransferResult> {
  // Try embedded wallet first
  const toEmbeddedWallet = await getEmbeddedWallet(toPhoneNumber)

  if (toEmbeddedWallet) {
    return await sendWithSpendPermission(fromPhoneNumber, toEmbeddedWallet.walletAddress, amount)
  }

  // Fall back to legacy wallet lookup
  // Import dynamically to avoid circular dependency
  const { getUserWallet } = await import('#services/cdp_wallet.service')
  const toLegacyWallet = await getUserWallet(toPhoneNumber)

  if (!toLegacyWallet) {
    throw new Error('Recipient not registered with Sippy')
  }

  return await sendWithSpendPermission(fromPhoneNumber, toLegacyWallet.walletAddress, amount)
}

/**
 * Send USDC to a specific wallet address
 */
export async function sendToAddress(
  fromPhoneNumber: string,
  toAddress: string,
  amount: number
): Promise<ExtendedTransferResult> {
  return await sendWithSpendPermission(fromPhoneNumber, toAddress, amount)
}

/**
 * Check if user has a valid spend permission
 */
export async function hasSpendPermission(phoneNumber: string): Promise<boolean> {
  const wallet = await getEmbeddedWallet(phoneNumber)
  return !!(wallet && wallet.spendPermissionHash)
}

/**
 * Get remaining allowance for a user's spend permission
 * Returns { remaining, allowance, periodEndsAt } or null if no permission
 */
export async function getRemainingAllowance(phoneNumber: string): Promise<{
  remaining: number
  allowance: number
  periodEndsAt: number
} | null> {
  const wallet = await getEmbeddedWallet(phoneNumber)
  if (!wallet || !wallet.spendPermissionHash) {
    return null
  }

  try {
    const cdp = getCdpClient()
    const spenderAccount = await getSippySpenderAccount()

    // Get the permission from CDP
    const allPermissions = await cdp.evm.listSpendPermissions({
      address: wallet.walletAddress as `0x${string}`,
    })

    // Find matching permission - prefer stored hash, fall back to most recent
    const usdcAddress = getUsdcAddress()

    const matchingPermissions =
      ((allPermissions.spendPermissions ?? []) as SpendPermissionEntry[])?.filter(
        (p) =>
          p.permission?.spender?.toLowerCase() === spenderAccount.address.toLowerCase() &&
          p.permission?.token?.toLowerCase() === usdcAddress.toLowerCase() &&
          p.network === NETWORK
      ) || []

    if (matchingPermissions.length === 0) {
      return null
    }

    // Use stored permission hash if available
    let permissionEntry = matchingPermissions.find(
      (p) => p.permissionHash === wallet.spendPermissionHash
    )

    // Fall back to most recent permission
    if (!permissionEntry) {
      permissionEntry = matchingPermissions.sort(
        (a, b) => Number(b.permission?.start || 0) - Number(a.permission?.start || 0)
      )[0]
    }

    const permission = permissionEntry.permission

    // Query the contract for current period spend
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
    const spendPermissionManager = new ethers.Contract(
      SPEND_PERMISSION_MANAGER,
      SPEND_PERMISSION_MANAGER_ABI,
      provider
    )

    const [, periodEnd, periodSpend] = await spendPermissionManager.getCurrentPeriod({
      account: permission.account,
      spender: permission.spender,
      token: permission.token,
      allowance: permission.allowance,
      period: permission.period,
      start: permission.start,
      end: permission.end,
      salt: permission.salt,
      extraData: permission.extraData || '0x',
    })

    const allowanceAmount = Number.parseFloat(
      ethers.utils.formatUnits(permission.allowance, USDC_DECIMALS)
    )
    const spentAmount = Number.parseFloat(ethers.utils.formatUnits(periodSpend, USDC_DECIMALS))
    const remainingAmount = allowanceAmount - spentAmount

    return {
      remaining: Math.max(0, remainingAmount),
      allowance: allowanceAmount,
      periodEndsAt: Number(periodEnd) * 1000, // Convert to ms
    }
  } catch (error) {
    logger.error(`Failed to get remaining allowance: %o`, error)
    return null
  }
}

/**
 * Initialize Sippy's spender wallet on startup
 */
export async function initSpenderWallet(): Promise<void> {
  try {
    const spenderAccount = await getSippySpenderAccount()
    logger.info(`Sippy Spender Wallet initialized:`)
    logger.info(`   Address: ${spenderAccount.address}`)
    logger.info(`   Network: ${NETWORK}`)

    // Validate environment
    if (!SIPPY_SPENDER_ADDRESS) {
      logger.warn('SIPPY_SPENDER_ADDRESS not set in env. Using dynamically created wallet.')
      logger.info(`   Set SIPPY_SPENDER_ADDRESS=${spenderAccount.address} in .env`)
    } else if (SIPPY_SPENDER_ADDRESS.toLowerCase() !== spenderAccount.address.toLowerCase()) {
      logger.warn('SIPPY_SPENDER_ADDRESS in env does not match created wallet!')
      logger.info(`   Env: ${SIPPY_SPENDER_ADDRESS}`)
      logger.info(`   Created: ${spenderAccount.address}`)
    }
  } catch (error) {
    logger.error('Failed to initialize spender wallet: %o', error)
    throw error
  }
}

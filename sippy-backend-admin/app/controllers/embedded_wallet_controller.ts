/**
 * Embedded Wallet Controller
 *
 * Handles wallet registration, spend permission management, gas refueling,
 * wallet status checks, export audit logging, authenticated phone resolution,
 * and web send logging for embedded (self-custodial) wallets.
 *
 * All routes require CDP auth middleware which populates ctx.cdpUser.
 */

import crypto from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import '#types/container'
import env from '#start/env'
import { CdpClient } from '@coinbase/cdp-sdk'
import { ethers } from 'ethers'
import { query, logExportEvent, logWebSend } from '#services/db'
import { getSippySpenderAccount } from '#services/embedded_wallet.service'
import { getUserWallet } from '#services/cdp_wallet.service'
import { getRefuelService } from '#services/refuel.service'
import { registerWalletWithIndexer } from '#services/indexer.service'
import { exportEventSchema, webSendEventSchema } from '#types/schemas'
import { NETWORK, USDC_ADDRESSES, USDC_DECIMALS } from '#config/network'

// CDP client for spend permission queries
const cdp = new CdpClient()

// Required for phone hashing in export audit logs and web send logs
const EXPORT_AUDIT_SECRET = env.get('EXPORT_AUDIT_SECRET', '')
if (!EXPORT_AUDIT_SECRET) {
  logger.warn('EXPORT_AUDIT_SECRET is not set — POST /api/log-export-event will return 503')
}

export default class EmbeddedWalletController {
  /**
   * POST /api/register-wallet
   *
   * Called after user creates an embedded wallet.
   * Registers the phone -> wallet mapping in the database and auto-refuels.
   */
  async registerWallet({ response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber, walletAddress } = cdpUser!

      // Normalize phone number (remove leading +)
      const normalizedPhone = phoneNumber.replace(/^\+/, '')

      logger.info(`Registering embedded wallet for +${normalizedPhone}: ${walletAddress}`)

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
      )

      logger.info(`Embedded wallet registered for +${normalizedPhone}`)

      // Auto-refuel new wallet so user has gas for spend permission creation
      const refuelService = getRefuelService()
      if (refuelService.isAvailable()) {
        logger.info('Checking if wallet needs refuel...')
        const refuelResult = await refuelService.checkAndRefuel(walletAddress)
        if (refuelResult.success) {
          logger.info(`Wallet refueled: ${refuelResult.txHash}`)
        } else {
          logger.warn(`Refuel failed or skipped: ${refuelResult.error}`)
        }
      } else {
        logger.warn('Refuel service not available - user will need ETH for gas')
      }

      // Register with indexer (fire-and-forget — never blocks signup)
      registerWalletWithIndexer(walletAddress, normalizedPhone).catch(() => {})

      return response.json({ success: true, network: NETWORK })
    } catch (error) {
      logger.error('Register wallet error: %o', error)
      return response.status(401).json({ error: 'Unauthorized' })
    }
  }

  /**
   * POST /api/register-permission
   *
   * Called after user approves a spend permission.
   * Finds the matching permission onchain and stores the hash in the database.
   *
   * NOTE: Frontend sends dailyLimit only. We find the permission by matching
   * spender + token + network, then store its permissionHash.
   */
  async registerPermission({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber, walletAddress } = cdpUser!
      const { dailyLimit } = request.body()

      logger.info(`Registering spend permission for +${phoneNumber.replace(/^\+/, '')}`)
      logger.info(`   Wallet: ${walletAddress}`)
      logger.info(`   Daily limit: $${dailyLimit}`)

      // Get the actual spender address (dynamically created, ensures consistency)
      const spenderAccount = await getSippySpenderAccount()
      const spenderAddress = spenderAccount.address

      // Find the permission onchain by matching criteria
      const allPermissions = await cdp.evm.listSpendPermissions({
        address: walletAddress as `0x${string}`,
      })

      const usdcAddress = USDC_ADDRESSES[NETWORK]

      // Find all matching permissions and select the most recent one (highest start time)
      const matchingPermissions =
        (allPermissions.spendPermissions as any[])?.filter(
          (p) =>
            p.permission?.spender?.toLowerCase() === spenderAddress.toLowerCase() &&
            p.permission?.token?.toLowerCase() === usdcAddress.toLowerCase() &&
            p.network === NETWORK
        ) || []

      if (matchingPermissions.length === 0) {
        logger.error(
          'No permission found onchain for this wallet with expected spender/token/network'
        )
        logger.info(`   Expected spender: ${spenderAddress}`)
        logger.info(`   Expected token: ${usdcAddress}`)
        logger.info(`   Expected network: ${NETWORK}`)
        return response.status(400).json({
          error: 'Permission not found onchain. Please try creating the permission again.',
        })
      }

      // Sort by start time descending to get the most recent permission
      const matchingPermission = matchingPermissions.sort(
        (a, b) => Number(b.permission?.start || 0) - Number(a.permission?.start || 0)
      )[0]

      const permissionHash = matchingPermission.permissionHash
      const permission = matchingPermission.permission
      logger.info(
        `   Found ${matchingPermissions.length} permission(s), using most recent: ${permissionHash}`
      )

      // Derive daily_limit from the onchain permission allowance (source of truth)
      const onchainAllowance = Number.parseFloat(
        ethers.utils.formatUnits(permission.allowance, USDC_DECIMALS)
      )
      logger.info(`   Onchain allowance: $${onchainAllowance}/period`)

      // Warn if client-provided limit doesn't match onchain (but use onchain as truth)
      if (dailyLimit && Math.abs(Number.parseFloat(dailyLimit) - onchainAllowance) > 0.01) {
        logger.warn(
          `   Client dailyLimit ($${dailyLimit}) differs from onchain ($${onchainAllowance}), using onchain value`
        )
      }

      // Store the permission with onchain-derived limit
      const normalizedPhone = phoneNumber.replace(/^\+/, '')
      await query(
        `UPDATE phone_registry
         SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
         WHERE phone_number = $4`,
        [permissionHash, onchainAllowance, Date.now(), normalizedPhone]
      )

      logger.info(
        `Spend permission registered for +${normalizedPhone} with $${onchainAllowance}/day limit`
      )

      return response.json({ success: true, permissionHash, dailyLimit: onchainAllowance })
    } catch (error) {
      logger.error('Register permission error: %o', error)
      return response.status(401).json({ error: 'Unauthorized' })
    }
  }

  /**
   * POST /api/revoke-permission
   *
   * Called when user revokes their spend permission.
   * Clears the permission from the database.
   */
  async revokePermission({ response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber } = cdpUser!
      const normalizedPhone = phoneNumber.replace(/^\+/, '')

      logger.info(`Revoking spend permission for +${normalizedPhone}`)

      await query(
        `UPDATE phone_registry
         SET spend_permission_hash = NULL,
             daily_limit = NULL,
             permission_created_at = NULL
         WHERE phone_number = $1`,
        [normalizedPhone]
      )

      logger.info(`Spend permission revoked for +${normalizedPhone}`)

      return response.json({ success: true })
    } catch (error) {
      logger.error('Revoke permission error: %o', error)
      return response.status(401).json({ error: 'Unauthorized' })
    }
  }

  /**
   * POST /api/ensure-gas
   *
   * Ensures wallet has sufficient gas for transactions.
   * Triggers refuel if needed and waits for it to complete.
   * Returns when wallet is ready or after timeout.
   */
  async ensureGas({ response, cdpUser }: HttpContext) {
    try {
      const { walletAddress } = cdpUser!

      logger.info(`Ensuring gas for wallet: ${walletAddress}`)

      const refuelService = getRefuelService()
      if (!refuelService.isAvailable()) {
        logger.warn('Refuel service not available')
        return response.json({
          ready: false,
          error: 'Refuel service not available',
          balance: '0',
        })
      }

      // Check current balance
      let balance = await refuelService.getUserBalance(walletAddress)
      const minBalance = 0.00005 // Same as contract MIN_BALANCE (50k gwei for UserOp)

      if (Number.parseFloat(balance) >= minBalance) {
        logger.info(`Wallet already has sufficient balance: ${balance} ETH`)
        return response.json({
          ready: true,
          balance,
          alreadyFunded: true,
        })
      }

      // Attempt refuel
      logger.info(`Wallet needs refuel (balance: ${balance} ETH)`)
      const refuelResult = await refuelService.checkAndRefuel(walletAddress)

      if (refuelResult.success) {
        // tx.wait() already confirmed the transaction, so user has gas now
        logger.info(`Refueled wallet: ${refuelResult.txHash}`)
        balance = await refuelService.getUserBalance(walletAddress)
        return response.json({
          ready: true,
          balance,
          txHash: refuelResult.txHash,
        })
      } else {
        logger.warn(`Refuel failed: ${refuelResult.error}`)
        return response.json({
          ready: false,
          balance,
          error: refuelResult.error,
        })
      }
    } catch (error) {
      logger.error('Ensure gas error: %o', error)
      return response.status(500).json({ error: 'Failed to ensure gas' })
    }
  }

  /**
   * GET /api/wallet-status
   *
   * Check if a phone number has a wallet and spend permission.
   * Used by frontend to show appropriate UI.
   */
  async walletStatus({ response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber } = cdpUser!
      const normalizedPhone = phoneNumber.replace(/^\+/, '')

      const result = await query<{
        wallet_address: string
        spend_permission_hash: string | null
        daily_limit: string | null
      }>(
        `SELECT wallet_address, spend_permission_hash, daily_limit
         FROM phone_registry
         WHERE phone_number = $1`,
        [normalizedPhone]
      )

      if (result.rows.length === 0) {
        return response.json({
          hasWallet: false,
          hasPermission: false,
          phoneNumber,
        })
      }

      const row = result.rows[0]
      return response.json({
        hasWallet: true,
        walletAddress: row.wallet_address,
        hasPermission: !!row.spend_permission_hash,
        dailyLimit: row.daily_limit ? Number.parseFloat(row.daily_limit) : null,
        phoneNumber,
      })
    } catch (error) {
      logger.error('Wallet status error: %o', error)
      return response.status(401).json({ error: 'Unauthorized' })
    }
  }

  /**
   * POST /api/log-export-event
   *
   * Logs export audit events with HMAC-hashed phone numbers.
   * Used by frontend during wallet private key export flow.
   */
  async logExportEvent({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber, walletAddress } = cdpUser!

      // Validate request body
      const parsed = exportEventSchema.safeParse(request.body())
      if (!parsed.success) {
        return response.status(400).json({ error: 'Invalid request body' })
      }

      // Require audit secret
      if (!EXPORT_AUDIT_SECRET) {
        return response.status(503).json({ error: 'Export audit unavailable' })
      }

      const { event, attemptId } = parsed.data
      const phoneHash = crypto
        .createHmac('sha256', EXPORT_AUDIT_SECRET)
        .update(phoneNumber)
        .digest('hex')

      await logExportEvent({
        attemptId,
        event,
        phoneHash,
        walletAddress,
      })

      return response.json({ success: true })
    } catch (error) {
      const isAuthError =
        error instanceof Error &&
        (error.message.includes('authorization') || error.message.includes('token'))
      logger.error('Log export event error: %o', error)
      return response.status(isAuthError ? 401 : 500).json({
        error: isAuthError ? 'Unauthorized' : 'Internal server error',
      })
    }
  }

  /**
   * POST /api/resolve-phone
   *
   * Authenticated phone -> wallet resolution for the /wallet page.
   * Prevents enumeration by requiring CDP auth + per-user throttle.
   */
  async resolvePhone({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber: callerPhone } = cdpUser!

      // Per-user throttle via container-bound rateLimitService
      const rateLimitService = await app.container.make('rateLimitService')
      if (!rateLimitService.checkUserResolveThrottle(callerPhone)) {
        return response.status(429).json({ error: 'Too many lookups. Try again later.' })
      }

      const { phone } = request.body()
      if (!phone || typeof phone !== 'string') {
        return response.status(400).json({ error: 'Phone number is required' })
      }

      const cleanPhone = phone.replace(/^\+/, '')

      const wallet = await getUserWallet(cleanPhone)

      if (!wallet) {
        const sippyWhatsAppNumber = env.get('SIPPY_WHATSAPP_NUMBER', '')
        const whatsappLink = sippyWhatsAppNumber
          ? `https://wa.me/${sippyWhatsAppNumber}?text=start`
          : undefined

        return response.status(404).json({
          error: 'Wallet not found',
          message: `This phone number hasn't started using Sippy yet.`,
          phone: `+${cleanPhone}`,
          ...(whatsappLink && { whatsappLink }),
        })
      }

      return response.json({
        address: wallet.walletAddress,
        phone: `+${cleanPhone}`,
        isNew: !wallet.lastActivity || wallet.lastActivity === wallet.createdAt,
      })
    } catch (error) {
      logger.error('Authenticated resolve-phone error: %o', error)
      return response.status(401).json({ error: 'Unauthorized' })
    }
  }

  /**
   * POST /api/log-web-send
   *
   * Logs web wallet send events for audit trail.
   * Fire-and-forget from frontend after a successful USDC transfer.
   */
  async logWebSend({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber, walletAddress } = cdpUser!

      // Validate request body with dedicated schema
      const parsed = webSendEventSchema.safeParse(request.body())
      if (!parsed.success) {
        return response.status(400).json({ error: 'Invalid request body' })
      }

      // Require audit secret for phone hashing
      if (!EXPORT_AUDIT_SECRET) {
        return response.status(503).json({ error: 'Audit logging unavailable' })
      }

      const { toAddress, amount, txHash } = parsed.data
      const phoneHash = crypto
        .createHmac('sha256', EXPORT_AUDIT_SECRET)
        .update(phoneNumber)
        .digest('hex')

      await logWebSend({
        phoneHash,
        walletAddress,
        toAddress,
        amount,
        txHash,
      })

      return response.json({ success: true })
    } catch (error) {
      const isAuthError =
        error instanceof Error &&
        (error.message.includes('authorization') || error.message.includes('token'))
      logger.error('Log web send error: %o', error)
      return response.status(isAuthError ? 401 : 500).json({
        error: isAuthError ? 'Unauthorized' : 'Internal server error',
      })
    }
  }
}

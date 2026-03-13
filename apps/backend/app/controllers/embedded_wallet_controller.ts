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
import {
  getSippySpenderAccount,
  sendToAddress,
  sendToPhoneNumber,
} from '#services/embedded_wallet.service'
import { getUserWallet } from '#services/cdp_wallet.service'
import { getRefuelService } from '#services/refuel.service'
import { registerWalletWithIndexer } from '#services/indexer.service'
import { exportEventSchema, webSendEventSchema, sendFromWebBodySchema } from '#types/schemas'
import { NETWORK, USDC_ADDRESSES, USDC_DECIMALS } from '#config/network'
import UserPreference from '#models/user_preference'
import { emailService } from '#services/email_service'
import { canonicalizePhone } from '#utils/phone'

/**
 * Compatibility helper: tries canonical phone then bare-digit fallback.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function findEmbeddedUserPref(phoneNumber: string): Promise<UserPreference | null> {
  const pref = await UserPreference.findBy('phoneNumber', phoneNumber)
  if (pref || !phoneNumber.startsWith('+')) return pref
  return UserPreference.findBy('phoneNumber', phoneNumber.slice(1))
}

/**
 * Returns the phone key to use for updateOrCreate on user_preferences.
 * If a bare-digit row already exists, returns bare digits to avoid creating a duplicate row.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function resolveEmbeddedUserPrefKey(phoneNumber: string): Promise<string> {
  if (phoneNumber.startsWith('+')) {
    const existing = await UserPreference.findBy('phoneNumber', phoneNumber.slice(1))
    if (existing) return phoneNumber.slice(1)
  }
  return phoneNumber
}

// CDP client for spend permission queries — lazy to avoid crashing on import
// when CDP credentials are not configured (e.g., in test environments)
let _cdp: CdpClient | null = null
function getCdpClient(): CdpClient {
  if (!_cdp) _cdp = new CdpClient()
  return _cdp
}

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

      const canonicalPhone = canonicalizePhone(phoneNumber)
      if (!canonicalPhone) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      logger.info(`Registering embedded wallet for ${canonicalPhone}: ${walletAddress}`)

      // Compatibility: if a bare-digit row exists (pre-SH-003), update it in place to
      // avoid creating a duplicate row (ON CONFLICT won't match bare-digit vs canonical key).
      // Remove after SH-003 backfill is confirmed complete.
      let registered = false
      if (canonicalPhone.startsWith('+')) {
        const bareResult = await query(
          `UPDATE phone_registry
           SET cdp_wallet_name = $1, wallet_address = $2, last_activity = $3
           WHERE phone_number = $4`,
          [`embedded-${canonicalPhone}`, walletAddress, Date.now(), canonicalPhone.slice(1)]
        )
        registered = bareResult.rowCount > 0
      }

      if (!registered) {
        // No pre-SH-003 row — upsert with canonical phone
        await query(
          `INSERT INTO phone_registry (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (phone_number) DO UPDATE SET
             wallet_address = $3,
             last_activity = $5`,
          [
            canonicalPhone,
            `embedded-${canonicalPhone}`,
            walletAddress,
            Date.now(),
            Date.now(),
            0,
            new Date().toDateString(),
          ]
        )
      }

      logger.info(`Embedded wallet registered for ${canonicalPhone}`)

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
      registerWalletWithIndexer(walletAddress, canonicalPhone).catch((err) =>
        logger.warn('Indexer registration failed (non-blocking): %o', err)
      )

      return response.json({ success: true, network: NETWORK })
    } catch (error) {
      logger.error('Register wallet error: %o', error)
      const isAuth = error instanceof Error && (error.message.includes('authorization') || error.message.includes('token'))
      return response.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Unauthorized' : 'Internal server error' })
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

      logger.info(`Registering spend permission for ${phoneNumber}`)
      logger.info(`   Wallet: ${walletAddress}`)
      logger.info(`   Daily limit: $${dailyLimit}`)

      // Get the actual spender address (dynamically created, ensures consistency)
      const spenderAccount = await getSippySpenderAccount()
      const spenderAddress = spenderAccount.address

      // Find the permission onchain by matching criteria
      const allPermissions = await getCdpClient().evm.listSpendPermissions({
        address: walletAddress as `0x${string}`,
      })

      const usdcAddress = USDC_ADDRESSES[NETWORK]

      // Find all matching permissions and select the most recent one (highest start time)
      const matchingPermissions =
        ((allPermissions.spendPermissions ?? []) as unknown as Array<{ permissionHash: string; network: string; permission: { spender: string; token: string; allowance: bigint | string; start: number } }>).filter(
          (p) =>
            p.permission?.spender?.toLowerCase() === spenderAddress.toLowerCase() &&
            p.permission?.token?.toLowerCase() === usdcAddress.toLowerCase() &&
            p.network === NETWORK
        )

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
      const canonicalPhone = phoneNumber  // already canonical from cdpUser JWT

      // Try UPDATE with canonical phone; fall back to bare-digit for pre-SH-003 rows
      let updateResult = await query(
        `UPDATE phone_registry
         SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
         WHERE phone_number = $4`,
        [permissionHash, onchainAllowance, Date.now(), canonicalPhone]
      )
      if (updateResult.rowCount === 0 && canonicalPhone.startsWith('+')) {
        updateResult = await query(
          `UPDATE phone_registry
           SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
           WHERE phone_number = $4`,
          [permissionHash, onchainAllowance, Date.now(), canonicalPhone.slice(1)]
        )
      }

      logger.info(
        `Spend permission registered for ${canonicalPhone} with $${onchainAllowance}/day limit`
      )

      return response.json({ success: true, permissionHash, dailyLimit: onchainAllowance })
    } catch (error) {
      logger.error('Register permission error: %o', error)
      const isAuth = error instanceof Error && (error.message.includes('authorization') || error.message.includes('token'))
      return response.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Unauthorized' : 'Internal server error' })
    }
  }

  /**
   * POST /api/revoke-permission
   *
   * Called when user revokes their spend permission.
   * If the user has a verified email, requires a valid gateToken in the request body.
   * Clears the permission from the database after gate check passes.
   */
  async revokePermission({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber } = cdpUser!
      const dbPhone = phoneNumber  // already canonical from cdpUser JWT

      // Gate enforcement: if user has a verified email, require a valid gateToken.
      const pref = await findEmbeddedUserPref(dbPhone)
      if (pref?.emailVerified === true) {
        const gateToken = request.body()?.gateToken
        if (!gateToken || typeof gateToken !== 'string') {
          return response.status(403).json({ error: 'gate_required' })
        }
        const valid = emailService.consumeGateToken(dbPhone, gateToken)
        if (!valid) {
          return response.status(403).json({ error: 'gate_required' })
        }
      }

      logger.info(`Revoking spend permission for ${dbPhone}`)

      // Try UPDATE with canonical phone; fall back to bare-digit for pre-SH-003 rows
      let revokeResult = await query(
        `UPDATE phone_registry
         SET spend_permission_hash = NULL,
             daily_limit = NULL,
             permission_created_at = NULL
         WHERE phone_number = $1`,
        [dbPhone]
      )
      if (revokeResult.rowCount === 0 && dbPhone.startsWith('+')) {
        await query(
          `UPDATE phone_registry
           SET spend_permission_hash = NULL,
               daily_limit = NULL,
               permission_created_at = NULL
           WHERE phone_number = $1`,
          [dbPhone.slice(1)]
        )
      }

      logger.info(`Spend permission revoked for ${dbPhone}`)

      return response.json({ success: true })
    } catch (error) {
      logger.error('Revoke permission error: %o', error)
      const isAuth = error instanceof Error && (error.message.includes('authorization') || error.message.includes('token'))
      return response.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Unauthorized' : 'Internal server error' })
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
      const normalizedPhone = phoneNumber  // already canonical from cdpUser JWT

      let result = await query<{
        wallet_address: string
        spend_permission_hash: string | null
        daily_limit: string | null
      }>(
        `SELECT wallet_address, spend_permission_hash, daily_limit
         FROM phone_registry
         WHERE phone_number = $1`,
        [normalizedPhone]
      )

      // Compatibility: fall back to bare-digit format for pre-SH-003 rows
      if (result.rows.length === 0 && normalizedPhone.startsWith('+')) {
        result = await query<{
          wallet_address: string
          spend_permission_hash: string | null
          daily_limit: string | null
        }>(
          `SELECT wallet_address, spend_permission_hash, daily_limit
           FROM phone_registry
           WHERE phone_number = $1`,
          [normalizedPhone.slice(1)]
        )
      }

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
      const isAuth = error instanceof Error && (error.message.includes('authorization') || error.message.includes('token'))
      return response.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Unauthorized' : 'Internal server error' })
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

      const canonicalPhone = canonicalizePhone(phone)
      if (!canonicalPhone) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      const wallet = await getUserWallet(canonicalPhone)

      if (!wallet) {
        const sippyWhatsAppNumber = env.get('SIPPY_WHATSAPP_NUMBER', '')
        const whatsappLink = sippyWhatsAppNumber
          ? `https://wa.me/${sippyWhatsAppNumber}?text=start`
          : undefined

        return response.status(404).json({
          error: 'Wallet not found',
          message: `This phone number hasn't started using Sippy yet.`,
          phone: canonicalPhone,
          ...(whatsappLink && { whatsappLink }),
        })
      }

      return response.json({
        address: wallet.walletAddress,
        phone: canonicalPhone,
        isNew: !wallet.lastActivity || wallet.lastActivity === wallet.createdAt,
      })
    } catch (error) {
      logger.error('Authenticated resolve-phone error: %o', error)
      const isAuth = error instanceof Error && (error.message.includes('authorization') || error.message.includes('token'))
      return response.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Unauthorized' : 'Internal server error' })
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

  /**
   * POST /api/send
   *
   * Send USDC from the caller's WhatsApp wallet (EOA) using the existing
   * SpendPermission on-chain. Accepts a phone number or 0x address as recipient.
   */
  async sendFromWeb({ request, response, cdpUser }: HttpContext) {
    try {
      const { phoneNumber } = cdpUser!
      const fromPhone = phoneNumber  // already canonical from cdpUser JWT

      const parsed = sendFromWebBodySchema.safeParse(request.body())
      if (!parsed.success) {
        return response.status(422).json({ error: 'Invalid request', details: parsed.error.issues })
      }

      const { to, amount: numAmount } = parsed.data

      const isAddress = /^0x[a-fA-F0-9]{40}$/.test(to)

      if (!isAddress) {
        const canonicalRecipient = canonicalizePhone(to)
        if (!canonicalRecipient) {
          return response.status(422).json({ error: 'Recipient must be a phone number or 0x address' })
        }
        const result = await sendToPhoneNumber(fromPhone, canonicalRecipient, numAmount)
        return response.json({
          success: true,
          txHash: result.transactionHash,
          remainingAllowance: result.remainingAllowance,
        })
      }

      const result = await sendToAddress(fromPhone, to, numAmount)

      return response.json({
        success: true,
        txHash: result.transactionHash,
        remainingAllowance: result.remainingAllowance,
      })
    } catch (error) {
      logger.error('sendFromWeb error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/set-privacy
   *
   * Updates the phone_visible preference for the authenticated user.
   */
  async setPrivacy(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const body = request.body() as { phoneVisible?: unknown }
      if (typeof body.phoneVisible !== 'boolean') {
        return response.status(422).json({ error: 'phoneVisible must be a boolean' })
      }
      const dbPhone = ctx.cdpUser!.phoneNumber
      const prefKey = await resolveEmbeddedUserPrefKey(dbPhone)
      await UserPreference.updateOrCreate(
        { phoneNumber: prefKey },
        { phoneVisible: body.phoneVisible }
      )
      return response.status(200).json({ success: true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/privacy-status
   *
   * Returns the phone_visible preference for the authenticated user.
   */
  async privacyStatus(ctx: HttpContext) {
    const { response } = ctx
    try {
      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findEmbeddedUserPref(dbPhone)
      return response.status(200).json({ phoneVisible: pref?.phoneVisible ?? true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/profile
   *
   * Public endpoint — returns wallet address, canonical phone, and phone_visible
   * preference for the given phone number. Used by public profile pages.
   */
  async getProfile({ request, response }: HttpContext) {
    try {
      const phone = request.input('phone') as string | undefined
      if (!phone || typeof phone !== 'string') {
        return response.status(400).json({ error: 'Phone number is required' })
      }

      const canonicalPhone = canonicalizePhone(phone)
      if (!canonicalPhone) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      // Query phone_registry for wallet_address
      let result = await query<{ wallet_address: string }>(
        `SELECT wallet_address FROM phone_registry WHERE phone_number = $1`,
        [canonicalPhone]
      )

      // Compatibility: bare-digit fallback for pre-SH-003 rows
      if (result.rows.length === 0 && canonicalPhone.startsWith('+')) {
        result = await query<{ wallet_address: string }>(
          `SELECT wallet_address FROM phone_registry WHERE phone_number = $1`,
          [canonicalPhone.slice(1)]
        )
      }

      if (result.rows.length === 0) {
        return response.status(404).json({ error: 'Wallet not found' })
      }

      const row = result.rows[0]

      // Query user_preferences for phone_visible (with pre-SH-003 fallback)
      const pref = await findEmbeddedUserPref(canonicalPhone)
      const phoneVisible = pref?.phoneVisible ?? true

      return response.json({
        address: row.wallet_address,
        phone: canonicalPhone,
        phoneVisible,
      })
    } catch (error) {
      logger.error('Get profile error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}

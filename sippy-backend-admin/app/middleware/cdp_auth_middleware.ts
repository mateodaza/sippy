/**
 * CDP Auth Middleware
 *
 * Validates CDP access tokens from the Authorization header.
 * Extracts user phone number and wallet address from the CDP SDK
 * and stores them on ctx.cdpUser for downstream route handlers.
 *
 * This is the AdonisJS equivalent of verifyCdpSession() from
 * the Express backend (embedded-wallet.routes.ts).
 */

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { CdpClient } from '@coinbase/cdp-sdk'

import '#types/cdp_auth'

/**
 * Module-level CDP client singleton.
 * Reused across requests to avoid re-initializing on every call.
 */
let cdpClient: CdpClient | null = null

function getCdpClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient({
      apiKeyId: env.get('CDP_API_KEY_ID'),
      apiKeySecret: env.get('CDP_API_KEY_SECRET'),
      walletSecret: env.get('CDP_WALLET_SECRET'),
    })
  }
  return cdpClient
}

/**
 * Network for wallet address resolution.
 * Matches the Express backend's NETWORK constant from config/network.ts.
 */
const NETWORK = env.get('SIPPY_NETWORK', 'arbitrum')

/**
 * Ethereum address validation pattern (0x + 40 hex chars).
 */
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

export default class CdpAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const authHeader = ctx.request.header('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return ctx.response.unauthorized({ error: 'Unauthorized' })
    }

    try {
      const cdp = getCdpClient()

      // Validate the access token via CDP SDK
      // Calls: POST https://api.cdp.coinbase.com/platform/v2/end-users/auth/validate-token
      const endUser = await cdp.endUser.validateAccessToken({ accessToken: token })

      // Extract phone number from SMS authentication method
      const smsAuth = endUser.authenticationMethods?.find(
        (m: { type: string }) => m.type === 'sms'
      ) as { type: 'sms'; phoneNumber: string } | undefined

      if (!smsAuth?.phoneNumber) {
        logger.warn('CDP auth: no phone number found in authenticated user')
        return ctx.response.unauthorized({ error: 'Unauthorized' })
      }

      // Validate smart accounts exist
      if (!endUser.evmSmartAccounts || endUser.evmSmartAccounts.length === 0) {
        logger.warn('CDP auth: no smart accounts found for user')
        return ctx.response.unauthorized({ error: 'Unauthorized' })
      }

      // Map smart accounts to our format with network info
      const smartAccounts = endUser.evmSmartAccounts.map((addr: string) => ({
        address: addr,
        network: NETWORK,
      }))

      // Find wallet for our network, fall back to first account
      const walletForNetwork = smartAccounts.find(
        (account: { address: string; network: string }) => account.network === NETWORK
      )
      const walletAddress = walletForNetwork?.address || smartAccounts[0]?.address

      // Validate wallet address format
      if (!walletAddress || !ETH_ADDRESS_REGEX.test(walletAddress)) {
        logger.warn('CDP auth: invalid wallet address from CDP: %s', walletAddress)
        return ctx.response.unauthorized({ error: 'Unauthorized' })
      }

      // Store authenticated user data on the context
      ctx.cdpUser = {
        phoneNumber: smsAuth.phoneNumber,
        walletAddress,
      }

      return await next()
    } catch (error) {
      logger.error({ err: error }, 'CDP auth: token validation failed')
      return ctx.response.unauthorized({ error: 'Unauthorized' })
    }
  }
}

/**
 * Onramp Bridge Service
 *
 * Called by the R2P poller after a Colurs payment succeeds.
 *
 * Current path (LiFi bridge — COLURS_DIRECT_USDC=false, default):
 *   Colurs sends USDT to SIPPY_ETH_DEPOSIT_ADDRESS on ETH mainnet.
 *   This service:
 *     1. Fetches a LiFi quote (USDT ETH mainnet → USDC Arbitrum)
 *     2. Signs and broadcasts the tx using ethers Wallet (backend hot wallet)
 *     3. Marks order as 'completed' once source tx confirms (1 confirmation)
 *   Alchemy webhook separately credits the user's balance when USDC lands.
 *
 *   Note: 'completed' is set on source-chain confirmation, not destination
 *   arrival. This is a known semantic gap — true destination confirmation
 *   would require correlating Alchemy transfer webhooks back to onramp_orders.
 *   For now, source confirmation is the best available signal and the Alchemy
 *   transfer webhook handles the actual balance credit independently.
 *
 * Future path (COLURS_DIRECT_USDC=true):
 *   Blocked at the controller level until a trustworthy completion/correlation
 *   path is implemented. See the guard in triggerBridge() for details.
 *
 * LiFi integration note:
 *   We use @lifi/sdk's getQuote() for routing, then extract transactionRequest
 *   and sign it directly with ethers v5. This avoids any viem/wagmi dependency
 *   on the server side. The same @lifi/sdk version used by apps/fund.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { ethers } from 'ethers'
import OnrampOrderModel from '#models/onramp_order'
import PhoneRegistry from '#models/phone_registry'
import { createConfig, getQuote } from '@lifi/sdk'
import { exchangeRateService } from '#services/exchange_rate_service'
import { notifyFundReceived } from '#services/notification.service'
import { getUserLanguage } from '#services/db'
import { getLanguageForPhone } from '#utils/phone'
import { Resend } from 'resend'

// ── Admin alert (ETH low gas) ─────────────────────────────────────────────────

const ETH_LOW_BALANCE_THRESHOLD = 0.05 // ETH — alert if hot wallet drops below this
const LOW_GAS_ALERT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between alerts
let lastLowGasAlertAt = 0

async function sendLowGasAlert(balanceEth: number, walletAddress: string): Promise<void> {
  const resendKey = env.get('RESEND_API_KEY', '')
  if (!resendKey) {
    logger.warn('onramp_bridge: RESEND_API_KEY not set — cannot send low-gas alert')
    return
  }
  const resend = new Resend(resendKey)
  await resend.emails.send({
    from: 'noreply@sippy.lat',
    to: 'mateo@sippy.lat',
    subject: `[SIPPY ALERT] Hot wallet low on ETH — ${balanceEth.toFixed(4)} ETH remaining`,
    text: [
      'The Sippy hot wallet is running low on ETH.',
      '',
      `Wallet:  ${walletAddress}`,
      `Balance: ${balanceEth.toFixed(6)} ETH`,
      `Threshold: ${ETH_LOW_BALANCE_THRESHOLD} ETH`,
      '',
      'Top up the wallet to ensure bridge transactions can be executed.',
    ].join('\n'),
  })
  logger.warn(
    `onramp_bridge: low-gas alert sent — wallet=${walletAddress} balance=${balanceEth.toFixed(6)} ETH`
  )
}

/**
 * Checks the hot wallet ETH balance and sends an admin alert if it drops
 * below ETH_LOW_BALANCE_THRESHOLD. Throttled to once per hour.
 */
async function checkEthBalanceAndAlert(wallet: ethers.Wallet): Promise<void> {
  try {
    const balance = await wallet.getBalance()
    const balanceEth = Number.parseFloat(ethers.utils.formatEther(balance))

    if (balanceEth < ETH_LOW_BALANCE_THRESHOLD) {
      const now = Date.now()
      if (now - lastLowGasAlertAt > LOW_GAS_ALERT_COOLDOWN_MS) {
        lastLowGasAlertAt = now
        await sendLowGasAlert(balanceEth, await wallet.getAddress())
      } else {
        logger.warn(
          `onramp_bridge: low ETH balance (${balanceEth.toFixed(4)} ETH) — alert suppressed (cooldown)`
        )
      }
    }
  } catch (err) {
    // Non-fatal — don't let alert failure block the bridge
    logger.error({ err }, 'onramp_bridge: failed to check ETH balance for alert')
  }
}

// ── Token addresses ───────────────────────────────────────────────────────────

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const CHAIN_ETH = 1
const CHAIN_ARB = 42161

// ABIs for ERC20 allowance + approval
const ERC20_APPROVAL_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

// ── LiFi SDK config (lazy, once) ─────────────────────────────────────────────

let lifiConfigured = false

function ensureLifiConfig() {
  if (lifiConfigured) return
  createConfig({ integrator: 'sippy' })
  lifiConfigured = true
}

// ── ethers provider + signer (lazy) ──────────────────────────────────────────

let provider: ethers.providers.JsonRpcProvider | null = null
let signer: ethers.Wallet | null = null

function getSigner(): ethers.Wallet {
  if (signer) return signer

  // Bridge signs on ETH mainnet. Replace default with an Alchemy/Infura endpoint via ETH_MAINNET_RPC_URL.
  const ethRpcUrl = env.get('ETH_MAINNET_RPC_URL', 'https://ethereum.publicnode.com')
  const privateKey = env.get('SIPPY_ETH_DEPOSIT_PRIVATE_KEY', '')

  if (!privateKey) {
    throw new Error('SIPPY_ETH_DEPOSIT_PRIVATE_KEY not configured')
  }

  provider = new ethers.providers.JsonRpcProvider(ethRpcUrl)
  signer = new ethers.Wallet(privateKey, provider)
  return signer
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type OnrampOrderRow = InstanceType<typeof OnrampOrderModel>

async function fetchOrder(externalId: string): Promise<OnrampOrderRow | null> {
  return OnrampOrderModel.query().where('externalId', externalId).first()
}

async function getUserWallet(phoneNumber: string): Promise<string | null> {
  const row = await PhoneRegistry.find(phoneNumber)
  return row?.walletAddress ?? null
}

async function setOrderStatus(
  externalId: string,
  status: string,
  extra: { lifi_tx_hash?: string; usdc_received?: string; error?: string } = {}
) {
  const updates: Record<string, unknown> = { status }
  if (extra.lifi_tx_hash !== undefined) updates.lifiTxHash = extra.lifi_tx_hash
  if (extra.usdc_received !== undefined) updates.usdcReceived = extra.usdc_received
  if (extra.error !== undefined) updates.error = extra.error
  await OnrampOrderModel.query().where('externalId', externalId).update(updates)
}

// ── USDT amount resolution ────────────────────────────────────────────────────

/**
 * Returns the USDT amount to bridge (in wei as bigint).
 * Uses amount_usdt from DB if set by webhook; otherwise estimates from COP.
 * USDT has 6 decimals on Ethereum mainnet.
 */
async function resolveUsdtAmountWei(order: OnrampOrderRow): Promise<bigint> {
  if (order.amountUsdt) {
    const usdt = Number.parseFloat(order.amountUsdt)
    return BigInt(Math.floor(usdt * 1e6))
  }

  // Fallback: estimate from COP amount via exchange rate
  const copRate = await exchangeRateService.getLocalRate('COP')
  if (!copRate) throw new Error('Exchange rate unavailable for USDT estimation')

  const usdAmount = Number.parseFloat(order.amountCop) / copRate
  logger.warn(
    `onramp_bridge: amount_usdt not set for order, estimating ${usdAmount.toFixed(6)} USDT from COP`
  )
  return BigInt(Math.floor(usdAmount * 1e6))
}

// ── LiFi bridge ───────────────────────────────────────────────────────────────

/**
 * Builds, approves, and broadcasts the LiFi USDT→USDC bridge tx.
 * Returns the tx hash immediately after broadcast so callers can persist it
 * before waiting for on-chain confirmation (survivable across process restarts).
 */
async function broadcastLiFiBridgeTx(
  amountWei: bigint,
  fromAddress: string,
  toAddress: string
): Promise<{ hash: string; waitForConfirmation: () => Promise<boolean> }> {
  ensureLifiConfig()

  logger.info(
    `onramp_bridge: getting LiFi quote — ${amountWei} USDT (ETH mainnet) → USDC (Arbitrum) → ${toAddress}`
  )

  const quote = await getQuote({
    fromChain: CHAIN_ETH,
    fromToken: USDT_ETH,
    toChain: CHAIN_ARB,
    toToken: USDC_ARB,
    fromAmount: amountWei.toString(),
    fromAddress,
    toAddress,
  })

  const txReq = quote.transactionRequest
  if (!txReq || !txReq.to || !txReq.data) {
    throw new Error('LiFi quote returned no transactionRequest')
  }

  const wallet = getSigner()

  // Sanity check: signer address must match the fromAddress
  const signerAddress = await wallet.getAddress()
  if (signerAddress.toLowerCase() !== fromAddress.toLowerCase()) {
    throw new Error(`Signer address ${signerAddress} does not match fromAddress ${fromAddress}`)
  }

  // ── ERC20 approval ──────────────────────────────────────────────────────────
  // LiFi routes require the hot wallet to have approved the spender contract.
  // The approval target is quote.estimate.approvalAddress when present,
  // falling back to txReq.to (the LiFi diamond contract).
  //
  // We use MaxUint256 approval (standard pattern for trusted router contracts)
  // instead of exact-amount approval. This avoids two problems:
  //   1. USDT quirk: the original USDT contract on Ethereum does not allow
  //      changing a non-zero allowance directly to another non-zero value.
  //      With MaxUint256, we only ever need to approve once per spender.
  //   2. Concurrent bridge calls: if two triggerBridge calls race from the same
  //      hot wallet, exact-amount approval causes one to revoke the other's
  //      allowance mid-flight. MaxUint256 is safe for concurrent use.
  //
  // The spender is LiFi's diamond/router contract — a well-audited, immutable
  // contract that only transfers the exact amount specified in the route.
  const approvalTarget: string = (quote as any).estimate?.approvalAddress ?? (txReq.to as string)
  const MAX_UINT256 = ethers.constants.MaxUint256

  const usdtContract = new ethers.Contract(USDT_ETH, ERC20_APPROVAL_ABI, wallet)
  const currentAllowance: ethers.BigNumber = await usdtContract.allowance(
    signerAddress,
    approvalTarget
  )

  if (currentAllowance.lt(amountWei)) {
    if (currentAllowance.gt(0)) {
      // USDT requires reset to 0 before setting a new non-zero value
      logger.info(`onramp_bridge: resetting USDT allowance to 0 for ${approvalTarget}`)
      const resetTx = await usdtContract.approve(approvalTarget, 0)
      await resetTx.wait(1)
    }
    logger.info(`onramp_bridge: approving MaxUint256 USDT for spender ${approvalTarget}`)
    const approveTx = await usdtContract.approve(approvalTarget, MAX_UINT256)
    await approveTx.wait(1)
  } else {
    logger.info(`onramp_bridge: USDT allowance already sufficient for ${approvalTarget}`)
  }
  // ── end approval ──────────────────────────��─────────────────────────────────

  logger.info(`onramp_bridge: sending LiFi tx from ${signerAddress}`)

  const tx = await wallet.sendTransaction({
    to: txReq.to as string,
    data: txReq.data as string,
    value: txReq.value ? ethers.BigNumber.from(txReq.value) : ethers.BigNumber.from(0),
    gasLimit: txReq.gasLimit ? ethers.BigNumber.from(txReq.gasLimit) : undefined,
  })

  logger.info(`onramp_bridge: tx broadcast — hash=${tx.hash}`)

  // Return hash immediately — caller saves it to DB before waiting for confirmation
  // so a process crash after broadcast doesn't lose the tx reference.
  return {
    hash: tx.hash,
    waitForConfirmation: async (): Promise<boolean> => {
      const receipt = await tx.wait(1)
      logger.info(`onramp_bridge: tx confirmed — hash=${tx.hash}`)
      return receipt.status === 1
    },
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Main entry point called by WebhookColursController after payment.completed.
 *
 * Reads the onramp order, picks the right path based on COLURS_DIRECT_USDC,
 * and drives the order through to completion (or awaiting_onchain_usdc).
 */
export async function triggerBridge(externalId: string): Promise<void> {
  const order = await fetchOrder(externalId)
  if (!order) {
    throw new Error(`onramp_bridge: order not found for external_id=${externalId}`)
  }

  // ── Direct USDC path (future — NOT YET WIRED) ──────────────────────────────
  // When Colurs supports sending USDC directly to the user's Arbitrum wallet,
  // this flag will skip the LiFi bridge. Before enabling, you MUST implement a
  // trustworthy completion/correlation path. Options:
  //   1. Colurs callback/webhook with our external_id on USDC delivery
  //   2. Queryable Colurs status API keyed by external_id for USDC settlement
  //   3. Reconciliation rule: destination wallet + expected amount + time window
  //      + one-open-order invariant
  // Without one of these, orders would strand in an intermediate state forever.
  if (env.get('COLURS_DIRECT_USDC') === 'true') {
    throw new Error(
      'COLURS_DIRECT_USDC=true is not yet supported. ' +
        'The completion/correlation path for direct USDC delivery has not been implemented. ' +
        'See onramp_bridge.service.ts for the requirements.'
    )
  }

  // ── LiFi bridge path (default) ──────────────────────────────────────────────
  const depositAddress = env.get('SIPPY_ETH_DEPOSIT_ADDRESS', '')
  if (!depositAddress) {
    throw new Error('SIPPY_ETH_DEPOSIT_ADDRESS not configured')
  }

  const userWallet = await getUserWallet(order.phoneNumber)
  if (!userWallet) {
    throw new Error(`onramp_bridge: no wallet found for order ${externalId}`)
  }

  const amountWei = await resolveUsdtAmountWei(order)

  // Status is already 'initiating_bridge' — the webhook controller atomically claimed
  // paid → initiating_bridge via db.rawQuery() before calling triggerBridge().
  // Statuses:
  //   'paid'               — broadcast was never attempted → safe to retry
  //   'initiating_bridge'  — process died between this write and saving the hash
  //                          → broadcast MAY have occurred → manual review only
  //   'bridging' + hash    — broadcast confirmed, hash known → normal confirmation path

  // Check ETH balance — fire-and-forget so a slow Resend/RPC call never gates the bridge
  checkEthBalanceAndAlert(getSigner()).catch((err) => {
    logger.error({ err }, 'onramp_bridge: ETH balance check failed (non-fatal)')
  })

  const { hash, waitForConfirmation } = await broadcastLiFiBridgeTx(
    amountWei,
    depositAddress,
    userWallet
  )

  // Persist the tx hash before returning — this is the durability marker.
  // Order is now 'bridging'; if the process restarts here, the hash is recoverable.
  await setOrderStatus(externalId, 'bridging', { lifi_tx_hash: hash })

  // triggerBridge returns here — the webhook can now acknowledge Colurs with 200.
  // tx.wait(1) is the slow part (~15-60s) and runs in the background. If this
  // process dies before confirmation: the hash is in DB and Alchemy webhook detects
  // USDC landing on Arbitrum for recovery. Notification fires after on-chain confirm.
  waitForConfirmation()
    .then(async (confirmed) => {
      if (!confirmed) {
        logger.error(
          `onramp_bridge: LiFi tx reverted on-chain — hash=${hash}, marking bridge_failed`
        )
        await setOrderStatus(externalId, 'bridge_failed', {
          error: `LiFi tx reverted on-chain — hash=${hash}`,
        })
        return
      }

      // Mark completed: source-chain tx confirmed. This is the best completion
      // signal available while using the LiFi bridge path. True destination-side
      // confirmation (USDC landing on Arbitrum) would require an Alchemy webhook
      // handler that correlates inbound transfers back to onramp_orders — not yet
      // implemented. For now, source confirmation + Alchemy crediting the user's
      // balance (via the existing transfer webhook) is the functional equivalent.
      await setOrderStatus(externalId, 'completed')
      logger.info(`onramp_bridge: order ${externalId} completed — lifi_tx=${hash} → ${userWallet}`)

      // Notify user (non-fatal — order is already completed)
      try {
        const amountUsdc = order.amountUsdt ? Number.parseFloat(order.amountUsdt).toFixed(2) : null
        if (amountUsdc) {
          const lang =
            (await getUserLanguage(order.phoneNumber)) || getLanguageForPhone(order.phoneNumber)
          await notifyFundReceived({
            recipientPhone: order.phoneNumber,
            amount: amountUsdc,
            type: 'usdc',
            txHash: externalId,
            lang,
          })
        }
      } catch (notifyErr) {
        logger.error({ err: notifyErr }, `onramp_bridge: notification failed for ${externalId}`)
      }
    })
    .catch((err) => {
      logger.error({ err }, `onramp_bridge: confirmation failed for ${externalId}`)
      setOrderStatus(externalId, 'bridge_failed', {
        error: err instanceof Error ? err.message : 'Confirmation error',
      }).catch(async (e) => {
        // DB is down — order is stuck in 'bridging' with no way to self-heal.
        // Alert ops immediately rather than waiting for the 2h recovery sweep.
        logger.error(
          { err: e },
          `onramp_bridge: CRITICAL — failed to persist bridge_failed for ${externalId}, alerting ops`
        )
        try {
          const resendKey = env.get('RESEND_API_KEY', '')
          if (resendKey) {
            const resend = new Resend(resendKey)
            await resend.emails.send({
              from: 'noreply@sippy.lat',
              to: 'mateo@sippy.lat',
              subject: `[SIPPY CRITICAL] Bridge failure not persisted — order ${externalId}`,
              text: [
                'A bridge confirmation failed but the bridge_failed status could not be saved to DB.',
                '',
                `Order: ${externalId}`,
                `LiFi tx: ${hash}`,
                `Confirmation error: ${err instanceof Error ? err.message : String(err)}`,
                `DB error: ${e instanceof Error ? e.message : String(e)}`,
                '',
                'The order is stuck in "bridging" status. Manual intervention required.',
              ].join('\n'),
            })
          }
        } catch (alertErr) {
          logger.error({ err: alertErr }, `onramp_bridge: alert send also failed for ${externalId}`)
        }
      })
    })
}

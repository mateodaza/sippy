/**
 * Onramp Bridge Service
 *
 * Called by WebhookColursController after payment.completed fires.
 *
 * COLURS_DIRECT_USDC=false (default)
 *   Colurs sent USDT to SIPPY_ETH_DEPOSIT_ADDRESS on ETH mainnet.
 *   This service:
 *     1. Fetches a LiFi quote (USDT ETH mainnet → USDC Arbitrum)
 *     2. Signs and broadcasts the tx using ethers Wallet (backend hot wallet)
 *     3. Marks order as 'bridging' then 'completed' once tx confirms
 *   Alchemy webhook separately credits the user's account when USDC lands.
 *
 * COLURS_DIRECT_USDC=true (future, when Colurs supports direct USDC)
 *   Colurs sends USDC directly to the user's Arbitrum wallet.
 *   No LiFi step — set order to awaiting_onchain_usdc.
 *   Alchemy webhook picks up USDC arrival and marks the order completed.
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
  // ⚠ UNKNOWN: confirm that (quote as any).estimate?.approvalAddress is the
  // correct field. If LiFi SDK types change, this may need updating.
  //
  // USDT quirk: the original USDT contract on Ethereum does not allow changing
  // a non-zero allowance directly to another non-zero value. We must set it to
  // 0 first if there is an existing allowance that differs from the target.
  const approvalTarget: string = (quote as any).estimate?.approvalAddress ?? (txReq.to as string)

  const usdtContract = new ethers.Contract(USDT_ETH, ERC20_APPROVAL_ABI, wallet)
  const currentAllowance: ethers.BigNumber = await usdtContract.allowance(
    signerAddress,
    approvalTarget
  )
  const requiredAllowance = ethers.BigNumber.from(amountWei)

  if (!currentAllowance.eq(requiredAllowance)) {
    if (currentAllowance.gt(0)) {
      // USDT requires reset to 0 before setting a new non-zero value
      logger.info(`onramp_bridge: resetting USDT allowance to 0 for ${approvalTarget}`)
      const resetTx = await usdtContract.approve(approvalTarget, 0)
      await resetTx.wait(1)
    }
    logger.info(`onramp_bridge: approving ${amountWei} USDT for spender ${approvalTarget}`)
    const approveTx = await usdtContract.approve(approvalTarget, requiredAllowance)
    await approveTx.wait(1)
  } else {
    logger.info(`onramp_bridge: USDT allowance already sufficient for ${approvalTarget}`)
  }
  // ── end approval ────────────────────────────────────────────────────────────

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

  // ── Direct USDC path (future) ───────────────────────────────────────────────
  if (env.get('COLURS_DIRECT_USDC') === 'true') {
    logger.info(
      `onramp_bridge: COLURS_DIRECT_USDC=true — setting awaiting_onchain_usdc for ${externalId}`
    )
    await setOrderStatus(externalId, 'awaiting_onchain_usdc')
    // Alchemy webhook handles USDC arrival on Arbitrum and marks completed
    return
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

  // Mark 'initiating_bridge' before broadcasting so the webhook recovery path can
  // distinguish three cases:
  //   'paid'               — broadcast was never attempted → safe to retry
  //   'initiating_bridge'  — process died between this write and saving the hash
  //                          → broadcast MAY have occurred → manual review only
  //   'bridging' + hash    — broadcast confirmed, hash known → normal confirmation path
  await setOrderStatus(externalId, 'initiating_bridge')

  const { hash, waitForConfirmation } = await broadcastLiFiBridgeTx(
    amountWei,
    depositAddress,
    userWallet
  )
  await setOrderStatus(externalId, 'bridging', { lifi_tx_hash: hash })

  const confirmed = await waitForConfirmation()
  if (!confirmed) {
    throw new Error(`LiFi tx reverted — hash=${hash}`)
  }

  await setOrderStatus(externalId, 'completed')

  logger.info(`onramp_bridge: order ${externalId} completed — lifi_tx=${hash} → ${userWallet}`)
}

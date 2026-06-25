/**
 * Gas → AA staging test-send (dev trigger, NO WhatsApp).
 *
 *   node ace gas-aa:test-send --from=<phone|0xwallet> --to=<phone|0xwallet> --amount=0.01
 *
 * Runs ONE real spender free-send by invoking the EXACT same service the
 * WhatsApp flow calls (`embedded_wallet.service` → `sendToPhoneNumber` /
 * `sendToAddress` → `sendWithSpendPermission`). It does NOT reimplement the send,
 * so when GAS_AA_ENABLED is on the full path runs: submitFreeSend → Pimlico
 * sponsorship webhook → gas_aa_prepared_user_ops ledger → on-chain. The send path
 * itself is untouched; this only triggers it and reports.
 *
 * Reports: path taken (AA-sponsored vs legacy fallback), tx hash, userOp hash,
 * prepared-op id, spender ETH before/after, and the prepared-op row timeline.
 *
 * Safety (layered): refuses on a prod Railway env; caps the amount at 1 USDC;
 * refuses when GAS_AA_ENABLED is off unless --allow-legacy (so a real send isn't
 * wasted on the wrong path); the sender must be a deliberately-set-up test user
 * with an on-chain spend permission + USDC. The send moves the USER's USDC via
 * their permission — staging only, tiny amounts.
 */

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { ethers } from 'ethers'
import env from '#start/env'
import { query } from '#services/db'
import { getRpcUrl } from '#config/network'
import { maskPhone } from '#utils/phone'
import { isGasAaEnabled } from '#services/gas_aa/flag'
import {
  getSippySpenderAccount,
  getEmbeddedWallet,
  sendToPhoneNumber,
  sendToAddress,
} from '#services/embedded_wallet.service'

const MAX_TEST_AMOUNT = 1.0 // hard cap — tiny test sends only

export default class GasAaTestSendCommand extends BaseCommand {
  static commandName = 'gas-aa:test-send'
  static description =
    'Trigger ONE real spender free-send (no WhatsApp) to exercise the gas_aa path on staging'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: "Sender: a registered test user's phone (+...) or 0x wallet" })
  declare from: string

  @flags.string({ description: 'Recipient: a phone (+...) or 0x wallet' })
  declare to: string

  @flags.string({ description: 'Amount in USDC (tiny; capped at 1.0)', default: '0.01' })
  declare amount: string

  @flags.boolean({
    description: 'Send even if GAS_AA_ENABLED is off (exercises the legacy path)',
    default: false,
  })
  declare allowLegacy: boolean

  async run() {
    // ── Guards ──────────────────────────────────────────────────────────────
    const railwayEnv = (env.get('RAILWAY_ENVIRONMENT', '') || '').toLowerCase()
    if (railwayEnv.includes('prod')) {
      this.logger.error(
        `RAILWAY_ENVIRONMENT="${railwayEnv}" looks like prod — refusing. Staging only.`
      )
      this.exitCode = 1
      return
    }
    if (!this.from || !this.to) {
      this.logger.error('require --from and --to')
      this.exitCode = 1
      return
    }
    const amount = Number(this.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.error(`invalid --amount "${this.amount}"`)
      this.exitCode = 1
      return
    }
    if (amount > MAX_TEST_AMOUNT) {
      this.logger.error(`--amount ${amount} exceeds the ${MAX_TEST_AMOUNT} USDC test cap`)
      this.exitCode = 1
      return
    }
    const flagOn = isGasAaEnabled()
    if (!flagOn && !this.allowLegacy) {
      this.logger.error(
        'GAS_AA_ENABLED is off → this would exercise the LEGACY path, not gas_aa. ' +
          'Set GAS_AA_ENABLED=true on staging, or pass --allow-legacy to test the flag-off path.'
      )
      this.exitCode = 1
      return
    }

    // ── Resolve sender (phone or wallet) ──────────────────────────────────────
    const fromPhone = await this.resolveFromPhone(this.from)
    if (!fromPhone) {
      this.logger.error(`sender "${this.from}" is not registered (no phone_registry row)`)
      this.exitCode = 1
      return
    }
    const fromEmbedded = await getEmbeddedWallet(fromPhone)
    const fromWallet = fromEmbedded?.walletAddress
    if (!fromWallet) {
      this.logger.error(`sender ${maskPhone(fromPhone)} has no wallet`)
      this.exitCode = 1
      return
    }

    // ── Spender + ETH before ──────────────────────────────────────────────────
    const spender = await getSippySpenderAccount()
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
    const ethBefore = await provider.getBalance(spender.address)

    this.logger.info('──────────────── gas_aa test-send ────────────────')
    this.logger.info(`  RAILWAY env       : ${railwayEnv || '(local/unset)'}`)
    this.logger.info(`  GAS_AA_ENABLED    : ${flagOn}`)
    this.logger.info(`  from              : ${maskPhone(fromPhone)}  (${fromWallet})`)
    this.logger.info(`  to                : ${this.to}`)
    this.logger.info(`  amount            : ${amount} USDC`)
    this.logger.info(`  spender (sender)  : ${spender.address}`)
    this.logger.info(`  spender ETH before: ${ethers.utils.formatEther(ethBefore)}`)
    this.logger.info('  → invoking the real free-send path…')

    // ── THE REAL SEND (same entry points as the WhatsApp flow) ────────────────
    const toIsAddress = /^0x[0-9a-fA-F]{40}$/.test(this.to)
    let txHash: string
    try {
      const result = toIsAddress
        ? await sendToAddress(fromPhone, this.to, amount)
        : await sendToPhoneNumber(fromPhone, this.to, amount)
      txHash = result.transactionHash
    } catch (e) {
      this.logger.error(`send FAILED: ${e instanceof Error ? e.message : String(e)}`)
      this.exitCode = 1
      return
    }

    const ethAfter = await provider.getBalance(spender.address)

    // ── The gas_aa ledger row(s) created by this send ─────────────────────────
    const ledgerResult = await query<any>(
      `SELECT id, status, sender_nonce, user_op_hash, meta,
              to_char(created_at, 'HH24:MI:SS') AS created,
              to_char(updated_at, 'HH24:MI:SS') AS updated
         FROM gas_aa_prepared_user_ops
        WHERE sender = $1 AND decoded_user = $2 AND created_at > NOW() - interval '5 minutes'
        ORDER BY created_at DESC
        LIMIT 5`,
      [spender.address.toLowerCase(), fromWallet.toLowerCase()]
    )
    const rows = ledgerResult.rows
    const row = rows[0]

    let path: string
    if (!flagOn) path = 'LEGACY (GAS_AA_ENABLED off)'
    else if (!row) path = '⚠️ no gas_aa row found — did the flag-on path run?'
    else if (row.status === 'landed') path = 'AA-SPONSORED ✅'
    else if (row.status === 'failed')
      path = `LEGACY FALLBACK (pre-broadcast: ${row.meta?.failed_reason ?? '?'})`
    else path = `gas_aa row status=${row.status} (in-flight/unexpected)`

    const delta = ethAfter.sub(ethBefore)
    this.logger.info('')
    this.logger.success('──────────────── result ────────────────')
    this.logger.info(`  path taken        : ${path}`)
    this.logger.info(`  tx hash           : ${txHash}`)
    this.logger.info(`  userOp hash       : ${row?.user_op_hash ?? '(n/a — legacy)'}`)
    this.logger.info(`  prepared-op id    : ${row?.id ?? '(n/a — legacy)'}`)
    this.logger.info(`  spender ETH after : ${ethers.utils.formatEther(ethAfter)}`)
    this.logger.info(
      `  spender ETH delta : ${ethers.utils.formatEther(delta)} ${delta.isZero() ? '(flat ✅ — sponsored)' : '(non-zero — refuel/legacy gas)'}`
    )
    if (rows.length) {
      this.logger.info('')
      this.logger.info('  gas_aa_prepared_user_ops (newest first):')
      for (const r of rows) {
        this.logger.info(
          `    ${r.id}  ${String(r.status).padEnd(10)} nonce=${r.sender_nonce ?? '-'} ` +
            `hash=${r.user_op_hash ?? '-'} tx=${r.meta?.tx_hash ?? '-'} [${r.created}→${r.updated}]`
        )
      }
    }
    this.logger.info('──────────────────────────────────────────')
  }

  /** Resolve a phone from --from (a phone passes through; a 0x wallet is looked up). */
  private async resolveFromPhone(from: string): Promise<string | null> {
    if (/^0x[0-9a-fA-F]{40}$/.test(from)) {
      const r = await query<{ phone_number: string }>(
        `SELECT phone_number FROM phone_registry WHERE LOWER(wallet_address) = $1 LIMIT 1`,
        [from.toLowerCase()]
      )
      return r.rows[0]?.phone_number ?? null
    }
    return from
  }
}

/**
 * WebhookController
 *
 * Ported from Express server.ts: GET /webhook/whatsapp and POST /webhook/whatsapp
 *
 * The GET endpoint handles Meta webhook verification.
 * The POST endpoint receives incoming WhatsApp messages, responds 200 immediately,
 * then processes the message asynchronously (Meta requirement).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import type { WebhookPayload, ParsedCommand, PendingTransaction, PartialSend } from '#types/index'
import '#types/container'
import type { Lang } from '#utils/messages'
import { parseMessage, parseAndValidateAmount } from '#utils/message_parser'
import { sendTextMessage, markAsReadWithTyping } from '#services/whatsapp.service'
import {
  getUserLanguage,
  setUserLanguage,
  getConversationContext,
  appendConversationMessage,
} from '#services/db'
import { detectLanguage, PERSIST_THRESHOLD } from '#utils/language'
import {
  formatHelpMessage,
  formatAboutMessage,
  formatInvalidSendFormat,
  formatHistoryMessage,
  formatSettingsMessage,
  formatUnknownCommandMessage,
  formatLanguageSetMessage,
  formatCommandErrorMessage,
  formatGreetingMessage,
  formatSocialReplyMessage,
  formatTextOnlyMessage,
  formatPrivacySetMessage,
  formatTransferCancelled,
  formatSelfSendMessage,
  formatConcurrentSendMessage,
  formatAmountError,
  formatInvalidPhoneNumberMessage,
  formatConfirmationPromptWithWarning,
  formatAskForAmount,
  formatAskForRecipient,
  formatAccountSuspendedMessage,
  formatMaintenanceMessage,
  formatHelpNewUser,
  formatHelpIncomplete,
  formatNudgeSetup,
  formatNudgeFinishSetup,
  formatGreetingNewUser,
  formatGreetingIncomplete,
  formatFundMessage,
  formatOnrampMessage,
  formatWithdrawMessage,
  formatInviteSentToSender,
  formatInviteDeliveryFailed,
  formatInviteAlreadyPending,
  formatInviteDailyLimitReached,
  formatInviteAlreadyOnSippy,
  formatEmailNudge,
  formatInsufficientBalanceMessage,
  formatContactNotFound,
} from '#utils/messages'

import { DateTime } from 'luxon'
import UserPreference from '#models/user_preference'
import { handleStartCommand } from '#commands/start_command'
import { handleBalanceCommand } from '#commands/balance_command'
import { handleSendCommand } from '#commands/send_command'
import { createInvite } from '#services/invite.service'
import { getUserWallet } from '#services/cdp_wallet.service'
import { generateResponse } from '#services/llm.service'
import {
  type SetupStatus,
  getSetupStatus,
  getEmbeddedWallet,
  getEmbeddedBalance,
} from '#services/embedded_wallet.service'
import { exchangeRateService } from '#services/exchange_rate_service'
import { canonicalizePhone, getLanguageForPhone, maskPhone } from '#utils/phone'
import { getIsPaused } from '#controllers/admin/moderation_controller'
import { findUserPrefByPhone, resolveUserPrefKey } from '#utils/user_pref_lookup'
import { getDialect, dialectHint, type Dialect } from '#utils/dialect'
import { validateLLMResponse } from '#services/llm_validator.service'
import { smartResolveAlias, updateContact } from '#services/contact.service'
import { sanitizeAlias } from '#utils/contact_sanitizer'
import {
  handleSaveContact,
  handleDeleteContact,
  handleListContacts,
  handleContactCard,
} from '#commands/contact_command'

// Exported so tests can seed/inspect state directly
export const pendingTransactions = new Map<string, PendingTransaction>()
export const partialSends = new Map<string, PartialSend>()
export const activeSends = new Set<string>()
export const pendingContactOverwrites = new Map<
  string,
  { alias: string; newPhone: string; timestamp: number }
>()

const FUND_URL = env.get('FUND_URL', 'https://fund.sippy.lat')
const FUND_TOKEN_SECRET = env.get('FUND_TOKEN_SECRET', '')

/**
 * Generate a signed fund URL for a phone number.
 * If FUND_TOKEN_SECRET is set, generates the token locally (no network dependency).
 * Otherwise falls back to calling the fund app's API.
 */
async function generateFundUrl(phoneNumber: string): Promise<string> {
  // Local token generation — same algorithm as apps/fund/lib/fund-token.ts
  if (FUND_TOKEN_SECRET) {
    try {
      const { createHmac: hmac } = await import('node:crypto')
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      const payload = `${phoneNumber}|${expiry}`
      const encoded = Buffer.from(payload).toString('base64url')
      const signature = hmac('sha256', FUND_TOKEN_SECRET).update(encoded).digest('base64url')
      const token = `${encoded}.${signature}`
      return `${FUND_URL}?t=${token}`
    } catch (err) {
      logger.warn('Local fund token generation failed: %o', err)
    }
  }

  // Fallback: call fund app API
  try {
    const res = await fetch(`${FUND_URL}/api/fund-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber }),
    })
    if (res.ok) {
      const data = (await res.json()) as { url?: string }
      if (data.url) return data.url
    }
  } catch (err) {
    logger.warn('Fund token generation failed, falling back to base URL: %o', err)
  }
  return FUND_URL
}

/**
 * Format amount string with optional local currency equivalent.
 * "$2.70 (~10,000 COP)" when converted from local, or just "$5" when in USD.
 */
function formatAmountWithLocal(
  usdcAmount: number,
  localAmount?: number,
  localCurrency?: string,
  senderCurrency?: string | null
): string {
  const usdcStr = `$${usdcAmount}`
  if (!localAmount || !localCurrency) return usdcStr
  const currency = localCurrency === 'LOCAL' ? (senderCurrency ?? '') : localCurrency
  const localStr = localAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return `${usdcStr} (~${localStr} ${currency})`
}

const CONFIRM_THRESHOLD_DEFAULT = 5
const ACTIVE_SEND_TIMEOUT_MS = 60_000 // safety valve — clears stuck sends
const PENDING_TX_TTL_MS = 2 * 60 * 1000 // 2 minutes
const PENDING_OVERWRITE_TTL_MS = 60_000 // 60 seconds for contact overwrite confirmation

// GC interval — removes entries that were never confirmed/cancelled.
// Correctness is NOT reliant on this interval; expiry is enforced lazily
// on access in the confirm handler.
// .unref() allows process to exit naturally without the interval keeping
// the event loop alive. Pattern matches exchange_rate_service.ts:80-86.
const pendingTxCleanupInterval = setInterval(() => {
  try {
    const now = Date.now()
    for (const [phone, tx] of pendingTransactions.entries()) {
      if (now - tx.timestamp > PENDING_TX_TTL_MS) {
        pendingTransactions.delete(phone)
      }
    }
    for (const [phone, ps] of partialSends.entries()) {
      if (now - ps.timestamp > PENDING_TX_TTL_MS) {
        partialSends.delete(phone)
      }
    }
    for (const [phone, ow] of pendingContactOverwrites.entries()) {
      if (now - ow.timestamp > PENDING_OVERWRITE_TTL_MS) {
        pendingContactOverwrites.delete(phone)
      }
    }
  } catch (err) {
    logger.error('pendingTx cleanup error: %o', err)
  }
}, 30_000)
pendingTxCleanupInterval.unref()

function clearPendingIfUnrelated(
  from: string,
  command: ParsedCommand,
  pendingTxs: Map<string, PendingTransaction>
): void {
  if (command.command !== 'confirm' && command.command !== 'cancel') {
    if (pendingTxs.has(from)) {
      pendingTxs.delete(from)
      logger.info('Pending tx cancelled due to new command from %s', maskPhone(from))
    }
    // Clear pending contact overwrites on non-confirm commands
    if (pendingContactOverwrites.has(from)) {
      pendingContactOverwrites.delete(from)
      logger.info('Pending contact overwrite cancelled due to new command from %s', maskPhone(from))
    }
  }
  // Clear partial sends on any non-send command (user moved on)
  if (command.command !== 'send') {
    partialSends.delete(from)
  }
}

export interface RateContext {
  senderRate: number | null
  senderCurrency: string | null
  recipientRate: number | null
  recipientCurrency: string | null
}

/**
 * Resolve exchange rates from the service for a sender and optional recipient.
 *
 * Uses getLocalRate (async) so that on first boot this correctly awaits the
 * initial fetch before returning — avoiding USD-only display on the first
 * message after server restart. When the cache is already warm, getLocalRate
 * resolves via an in-memory Map.get with no I/O.
 *
 * Never throws: all errors are caught and return all-nulls (graceful USD fallback).
 *
 * Exported for direct unit testing without going through processWebhook.
 */
export async function fetchRateContext(
  fromPhone: string,
  recipientPhone?: string
): Promise<RateContext> {
  let senderRate: number | null = null
  let senderCurrency: string | null = null
  let recipientRate: number | null = null
  let recipientCurrency: string | null = null

  try {
    senderCurrency = exchangeRateService.getCurrencyForPhone(fromPhone)
    if (senderCurrency) {
      senderRate = await exchangeRateService.getLocalRate(senderCurrency)
    }
    if (recipientPhone) {
      recipientCurrency = exchangeRateService.getCurrencyForPhone(recipientPhone)
      if (recipientCurrency) {
        recipientRate = await exchangeRateService.getLocalRate(recipientCurrency)
      }
    }
  } catch (err) {
    logger.warn('fetchRateContext error (falling back to USD-only): %o', err)
  }

  return { senderRate, senderCurrency, recipientRate, recipientCurrency }
}

/**
 * Route a parsed command to the appropriate handler, threading a pre-fetched
 * rate context into balance and send handlers.
 *
 * Exported as a module-level function so that tests can inject fake balance/send
 * handlers to verify the exact rate values passed without mocking external services.
 *
 * `balanceHandler` and `sendHandler` default to the real imports and are only
 * overridden in tests.
 */
export async function routeCommand(
  phoneNumber: string,
  command: ParsedCommand,
  lang: Lang,
  rateCtx: RateContext,
  context: import('#services/db').ContextMessage[] = [],
  balanceHandler: typeof handleBalanceCommand = handleBalanceCommand,
  sendHandler: typeof handleSendCommand = handleSendCommand,
  generateResponseFn: typeof generateResponse = generateResponse,
  sendMessageFn: typeof sendTextMessage = sendTextMessage,
  pendingTxs: Map<string, PendingTransaction> = pendingTransactions,
  activeSendsSet: Set<string> = activeSends,
  activeSendTimeoutMs: number = ACTIVE_SEND_TIMEOUT_MS,
  setupStatusOverride?: SetupStatus,
  dialect: Dialect = getDialect(phoneNumber),
  validateFn: typeof validateLLMResponse = validateLLMResponse
): Promise<void> {
  // Validate LLM-generated reply; return corrected text or null (caller falls back to template)
  async function validateAndFallback(
    llmReply: string | null,
    userText: string,
    ctx: import('#services/db').ContextMessage[],
    setupStatus?: SetupStatus,
    dialectInstruction?: string | null
  ): Promise<string | null> {
    if (!llmReply) return null
    const result = await validateFn(llmReply, userText, lang, ctx, setupStatus, dialectInstruction)
    if (result.passed) return llmReply
    if (result.correctedText) return result.correctedText
    return null
  }

  // Lazy setup status: only resolved for commands that need it, cached after first call.
  // Tests can bypass DB via setupStatusOverride.
  let cachedStatus: SetupStatus | undefined = setupStatusOverride
  const resolveStatus = async (): Promise<SetupStatus> => {
    if (!cachedStatus) cachedStatus = await getSetupStatus(phoneNumber)
    return cachedStatus
  }

  try {
    switch (command.command) {
      case 'start':
        await handleStartCommand(phoneNumber, lang)
        break

      case 'help': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatHelpNewUser(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatHelpIncomplete(phoneNumber, lang), lang)
        } else if (command.helpfulMessage) {
          // LLM-classified help (e.g. "quiero mandarle plata a alguien") — use conversational reply
          const validated = await validateAndFallback(
            command.helpfulMessage,
            command.originalText ?? '',
            context,
            s,
            dialectHint(dialect)
          )
          await sendMessageFn(phoneNumber, validated || formatHelpMessage(lang), lang)
        } else {
          // Explicit "ayuda"/"help" from regex — show the full menu
          await sendMessageFn(phoneNumber, formatHelpMessage(lang), lang)
        }
        break
      }

      case 'about': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatGreetingNewUser(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatGreetingIncomplete(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatAboutMessage(lang), lang)
        }
        break
      }

      case 'fund': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else if (phoneNumber.startsWith('+57')) {
          // Colombian users: show Colurs onramp (COP → USDC) instead of Coinbase
          await sendMessageFn(phoneNumber, formatOnrampMessage(phoneNumber, lang), lang)
        } else {
          const fundUrl = await generateFundUrl(phoneNumber)
          await sendMessageFn(phoneNumber, formatFundMessage(fundUrl, lang), lang)
        }
        break
      }

      case 'balance':
        await balanceHandler(phoneNumber, lang, rateCtx.senderRate, rateCtx.senderCurrency)
        break

      case 'send': {
        // NEW: amount validation error — specific message, bail early
        if (command.amountError) {
          await sendMessageFn(phoneNumber, formatAmountError(command.amountError, lang), lang)
          return
        }

        // ── Local currency conversion: "10000 pesos" → USDC equivalent ──
        if (command.localCurrency && command.amount && command.localAmount) {
          let currencyCode = command.localCurrency
          if (currencyCode === 'LOCAL') {
            currencyCode = rateCtx.senderCurrency ?? ''
          }
          if (currencyCode) {
            const rate = await exchangeRateService.getLocalRate(currencyCode)
            if (rate && rate > 0) {
              const usdcAmount = Math.round((command.localAmount / rate) * 100) / 100
              if (usdcAmount < 0.1) {
                await sendMessageFn(phoneNumber, formatAmountError('TOO_SMALL', lang), lang)
                return
              }
              command.amount = usdcAmount
              command.isLargeAmount = usdcAmount > 500
            } else {
              const noRateMsg = {
                en: `Can't convert ${currencyCode} right now. Try in dollars: "send 5 to ..."`,
                es: `No puedo convertir ${currencyCode} ahora. Intenta en dolares: "enviar 5 a ..."`,
                pt: `Nao consigo converter ${currencyCode} agora. Tenta em dolares: "enviar 5 para ..."`,
              }
              await sendMessageFn(phoneNumber, noRateMsg[lang], lang)
              return
            }
          }
        }

        // ── Alias resolution: recipientRaw present but no canonical phone ──
        if (!command.recipient && command.recipientRaw && command.amount) {
          const matches = await smartResolveAlias(phoneNumber, command.recipientRaw)

          if (matches.length === 1) {
            const match = matches[0]
            pendingTxs.set(phoneNumber, {
              amount: command.amount,
              recipient: match.targetPhone,
              timestamp: Date.now(),
              lang,
            })
            const amtStr = formatAmountWithLocal(
              command.amount,
              command.localAmount,
              command.localCurrency,
              rateCtx.senderCurrency
            )
            const confirmMsg = {
              en: `Send ${amtStr} to ${match.aliasDisplay} (${match.targetPhone})? Reply YES to confirm.`,
              es: `\u00bfEnviar ${amtStr} a ${match.aliasDisplay} (${match.targetPhone})? Responde S\u00cd para confirmar.`,
              pt: `Enviar ${amtStr} para ${match.aliasDisplay} (${match.targetPhone})? Responda SIM para confirmar.`,
            }
            await sendMessageFn(phoneNumber, confirmMsg[lang], lang)
            return
          } else if (matches.length > 1) {
            partialSends.set(phoneNumber, {
              amount: command.amount,
              timestamp: Date.now(),
              lang,
            })
            const safeRaw = sanitizeAlias(command.recipientRaw) ?? command.recipientRaw.slice(0, 30)
            const lines = matches.map((m, i) => `${i + 1}. ${m.aliasDisplay} (${m.targetPhone})`)
            const disambigMsg = {
              en: `Multiple contacts match "${safeRaw}":\n${lines.join('\n')}\nReply with the exact contact name.`,
              es: `Varios contactos coinciden con "${safeRaw}":\n${lines.join('\n')}\nResponde con el nombre exacto del contacto.`,
              pt: `V\u00e1rios contatos correspondem a "${safeRaw}":\n${lines.join('\n')}\nResponda com o nome exato do contato.`,
            }
            await sendMessageFn(phoneNumber, disambigMsg[lang], lang)
            return
          } else {
            // No match — store partial send so follow-up resolves as recipient
            partialSends.set(phoneNumber, {
              amount: command.amount,
              timestamp: Date.now(),
              lang,
            })
            const safeRaw = sanitizeAlias(command.recipientRaw) ?? command.recipientRaw.slice(0, 30)
            await sendMessageFn(phoneNumber, formatContactNotFound(safeRaw, lang), lang)
            return
          }
        }

        // Phone canonicalization failed (no recipientRaw = raw phone that didn't parse) — bail
        if (command.recipientError === 'INVALID_PHONE') {
          await sendMessageFn(phoneNumber, formatInvalidPhoneNumberMessage(lang), lang)
          return
        }

        // Self-send check — before any processing (fail fast)
        const canonicalRecipient = command.recipient ? canonicalizePhone(command.recipient) : null
        if (canonicalRecipient && canonicalRecipient === phoneNumber) {
          await sendMessageFn(phoneNumber, formatSelfSendMessage(lang), lang)
          return
        }
        if (command.amount && command.recipient) {
          const threshold = env.get('CONFIRM_THRESHOLD') ?? CONFIRM_THRESHOLD_DEFAULT
          if (command.amount <= threshold) {
            // At or below threshold — concurrent guard + execute immediately
            if (activeSendsSet.has(phoneNumber)) {
              await sendMessageFn(phoneNumber, formatConcurrentSendMessage(lang), lang)
              return
            }
            activeSendsSet.add(phoneNumber)
            const safetyTimer = setTimeout(
              () => activeSendsSet.delete(phoneNumber),
              activeSendTimeoutMs
            )
            try {
              await sendHandler(
                phoneNumber,
                command.amount,
                command.recipient,
                lang,
                rateCtx.senderRate,
                rateCtx.senderCurrency,
                rateCtx.recipientRate,
                rateCtx.recipientCurrency
              )
            } finally {
              clearTimeout(safetyTimer)
              activeSendsSet.delete(phoneNumber)
            }
          } else {
            // Above threshold — check balance before asking for confirmation
            try {
              const balance = await getEmbeddedBalance(phoneNumber)
              if (balance < command.amount) {
                await sendMessageFn(
                  phoneNumber,
                  formatInsufficientBalanceMessage(
                    {
                      balance,
                      needed: command.amount,
                      localRate: rateCtx.senderRate,
                      localCurrency: rateCtx.senderCurrency,
                    },
                    lang
                  ),
                  lang
                )
                return
              }
            } catch {
              // Balance check failed — proceed to confirmation anyway.
              // sendHandler will re-check balance before executing.
            }

            // Store pending, ask for confirmation
            pendingTxs.set(phoneNumber, {
              amount: command.amount,
              recipient: command.recipient,
              timestamp: Date.now(),
              lang,
            })
            await sendMessageFn(
              phoneNumber,
              formatConfirmationPromptWithWarning(
                command.amount,
                command.recipient,
                command.isLargeAmount ?? false,
                lang
              ),
              lang
            )
          }
        } else if (command.amount && !command.recipient) {
          // Has amount, missing recipient → store partial, ask for phone or alias
          partialSends.set(phoneNumber, {
            amount: command.amount,
            timestamp: Date.now(),
            lang,
          })
          await sendMessageFn(phoneNumber, formatAskForRecipient(command.amount, lang), lang)
        } else if (command.recipient && !command.amount) {
          // Has recipient, missing amount → store partial, ask for amount
          partialSends.set(phoneNumber, {
            recipient: command.recipient,
            timestamp: Date.now(),
            lang,
          })
          await sendMessageFn(phoneNumber, formatAskForAmount(command.recipient, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatInvalidSendFormat(lang), lang)
        }
        break
      }

      case 'invite': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
          break
        }
        if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
          break
        }
        if (!command.recipient) {
          await sendMessageFn(phoneNumber, formatHelpMessage(lang), lang)
          break
        }
        // Self-invite check
        if (command.recipient === phoneNumber) {
          await sendMessageFn(phoneNumber, formatSelfSendMessage(lang), lang)
          break
        }
        // Already on Sippy check
        const recipientEmbedded = await getEmbeddedWallet(command.recipient)
        const recipientLegacy = await getUserWallet(command.recipient)
        if (recipientEmbedded || recipientLegacy) {
          await sendMessageFn(
            phoneNumber,
            formatInviteAlreadyOnSippy(command.recipient, lang),
            lang
          )
          break
        }
        try {
          const inviteResult = await createInvite(phoneNumber, command.recipient, 0, lang)
          if (inviteResult.dailyLimitReached) {
            await sendMessageFn(phoneNumber, formatInviteDailyLimitReached(lang), lang)
          } else if (inviteResult.alreadyInvited) {
            await sendMessageFn(
              phoneNumber,
              formatInviteAlreadyPending(command.recipient, lang),
              lang
            )
          } else if (inviteResult.delivered) {
            await sendMessageFn(
              phoneNumber,
              formatInviteSentToSender(command.recipient, lang),
              lang
            )
          } else {
            await sendMessageFn(
              phoneNumber,
              formatInviteDeliveryFailed(command.recipient, lang),
              lang
            )
          }
        } catch {
          await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
        }
        break
      }

      case 'save_contact': {
        const result = await handleSaveContact(
          phoneNumber,
          command.alias ?? '',
          command.phone ?? '',
          lang
        )
        if (result.pendingOverwrite) {
          pendingContactOverwrites.set(phoneNumber, {
            alias: result.pendingOverwrite.alias,
            newPhone: result.pendingOverwrite.newPhone,
            timestamp: Date.now(),
          })
        }
        await sendMessageFn(phoneNumber, result.message, lang)
        break
      }

      case 'delete_contact': {
        const msg = await handleDeleteContact(phoneNumber, command.alias ?? '', lang)
        await sendMessageFn(phoneNumber, msg, lang)
        break
      }

      case 'list_contacts': {
        const msg = await handleListContacts(phoneNumber, lang)
        await sendMessageFn(phoneNumber, msg, lang)
        break
      }

      case 'confirm': {
        const pendingOverwrite = pendingContactOverwrites.get(phoneNumber)
        const pendingOverwriteValid =
          pendingOverwrite && Date.now() - pendingOverwrite.timestamp < PENDING_OVERWRITE_TTL_MS
        const pending = pendingTxs.get(phoneNumber)
        const pendingTxValid = pending && Date.now() - pending.timestamp <= PENDING_TX_TTL_MS

        // If BOTH a contact overwrite and a money transfer are pending,
        // prioritize the money transfer (higher stakes) and discard the overwrite.
        // The user can re-save the contact after the transfer.
        if (pendingOverwriteValid && pendingTxValid) {
          pendingContactOverwrites.delete(phoneNumber)
          // Fall through to pending tx handling below
        } else if (pendingOverwriteValid) {
          pendingContactOverwrites.delete(phoneNumber)
          const overwriteResult = await updateContact(
            phoneNumber,
            pendingOverwrite!.alias,
            pendingOverwrite!.newPhone
          )
          if (overwriteResult.success) {
            const updatedMsg = {
              en: `\u2713 Updated ${overwriteResult.alias} \u2192 ${overwriteResult.phone}`,
              es: `\u2713 Actualizado ${overwriteResult.alias} \u2192 ${overwriteResult.phone}`,
              pt: `\u2713 Atualizado ${overwriteResult.alias} \u2192 ${overwriteResult.phone}`,
            }
            await sendMessageFn(phoneNumber, updatedMsg[lang], lang)
          } else {
            await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
          }
          return
        }
        // Clear expired overwrite if any
        if (pendingOverwrite && !pendingOverwriteValid) pendingContactOverwrites.delete(phoneNumber)
        // Lazy expiry check — guarantees 2-minute cutoff regardless of GC interval timing
        if (!pending || Date.now() - pending.timestamp > PENDING_TX_TTL_MS) {
          if (pending) pendingTxs.delete(phoneNumber) // clean up expired entry
          // No pending tx — "dale"/"sí"/"va" is just acknowledgment, not a real confirm.
          // Treat like social instead of showing confusing "No pending transfer."
          const s = await resolveStatus()
          if (s === 'new_user') {
            await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
          } else if (s === 'embedded_incomplete') {
            await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
          } else {
            const text = command.originalText ?? ''
            const raw = text
              ? await generateResponseFn(text, lang, context, s, dialectHint(dialect))
              : null
            const reply = await validateAndFallback(raw, text, context, s, dialectHint(dialect))
            await sendMessageFn(phoneNumber, reply || formatSocialReplyMessage(lang, dialect), lang)
          }
        } else {
          // Guard 2: concurrent-send check — BEFORE consuming pending tx
          // If in-flight, reject and leave pending tx intact for retry
          if (activeSendsSet.has(phoneNumber)) {
            await sendMessageFn(phoneNumber, formatConcurrentSendMessage(lang), lang)
            return
          }
          // Atomic consume: delete BEFORE awaiting sendHandler.
          // A second concurrent confirm will find no entry and get "No pending transfer."
          // No rollback on failure: if sendHandler returns false or throws after the
          // transfer succeeded (e.g. a notification failed), re-inserting the pending tx
          // would allow a second YES to double-execute the transfer.
          // The send paths guarantee they return true on a successful transfer regardless
          // of notification outcome, so false/throw here means the transfer did not occur.
          // The outer try/catch handles any throw and sends formatCommandErrorMessage.
          pendingTxs.delete(phoneNumber)
          activeSendsSet.add(phoneNumber)
          const safetyTimer = setTimeout(
            () => activeSendsSet.delete(phoneNumber),
            activeSendTimeoutMs
          )
          try {
            await sendHandler(
              phoneNumber,
              pending.amount,
              pending.recipient,
              pending.lang,
              rateCtx.senderRate,
              rateCtx.senderCurrency,
              rateCtx.recipientRate,
              rateCtx.recipientCurrency
            )
          } finally {
            clearTimeout(safetyTimer)
            activeSendsSet.delete(phoneNumber)
          }
        }
        break
      }

      case 'cancel':
        pendingTxs.delete(phoneNumber)
        pendingContactOverwrites.delete(phoneNumber)
        partialSends.delete(phoneNumber)
        await sendMessageFn(phoneNumber, formatTransferCancelled(lang), lang)
        break

      case 'history': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatHistoryMessage(phoneNumber, lang), lang)
        }
        break
      }

      case 'settings': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatSettingsMessage(phoneNumber, lang), lang)
        }
        break
      }

      case 'greeting': {
        const s = await resolveStatus()
        const text = command.originalText ?? ''
        const raw = text
          ? await generateResponseFn(text, lang, context, s, dialectHint(dialect))
          : null
        const reply = await validateAndFallback(raw, text, context, s, dialectHint(dialect))
        if (reply) {
          await sendMessageFn(phoneNumber, reply, lang)
        } else if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatGreetingNewUser(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatGreetingIncomplete(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatGreetingMessage(lang, dialect), lang)
        }
        break
      }

      case 'social': {
        const s = await resolveStatus()
        const text = command.originalText ?? ''
        const raw = text
          ? await generateResponseFn(text, lang, context, s, dialectHint(dialect))
          : null
        const reply = await validateAndFallback(raw, text, context, s, dialectHint(dialect))
        if (reply) {
          await sendMessageFn(phoneNumber, reply, lang)
        } else if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatGreetingNewUser(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatGreetingIncomplete(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatSocialReplyMessage(lang, dialect), lang)
        }
        break
      }

      case 'language': {
        const langNames: Record<string, string> = {
          en: 'English',
          es: 'Español',
          pt: 'Português',
        }
        const langName = langNames[command.detectedLanguage || ''] || command.detectedLanguage || ''
        await sendMessageFn(phoneNumber, formatLanguageSetMessage(langName, lang), lang)
        break
      }

      case 'privacy': {
        const visible = command.privacyAction === 'on'
        const prefKey = await resolveUserPrefKey(phoneNumber)
        await UserPreference.updateOrCreate({ phoneNumber: prefKey }, { phoneVisible: visible })
        await sendMessageFn(
          phoneNumber,
          formatPrivacySetMessage(command.privacyAction!, lang),
          lang
        )
        break
      }

      case 'withdraw': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else {
          // Show current COP rate for context, then link to web app offramp
          const copRate = await exchangeRateService.getLocalRate('COP')
          await sendMessageFn(phoneNumber, formatWithdrawMessage(phoneNumber, copRate, lang), lang)
        }
        break
      }

      case 'unknown': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else if (command.helpfulMessage) {
          const validated = await validateAndFallback(
            command.helpfulMessage,
            command.originalText ?? '',
            context,
            s,
            dialectHint(dialect)
          )
          await sendMessageFn(
            phoneNumber,
            validated || formatUnknownCommandMessage(command.originalText || '', lang, dialect),
            lang
          )
        } else {
          // No helpfulMessage — try generating a conversational reply via LLM
          // before falling back to the static unknown message
          const text = command.originalText ?? ''
          const raw = text
            ? await generateResponseFn(text, lang, context, s, dialectHint(dialect))
            : null
          const reply = await validateAndFallback(raw, text, context, s, dialectHint(dialect))
          if (reply) {
            await sendMessageFn(phoneNumber, reply, lang)
          } else {
            await sendMessageFn(
              phoneNumber,
              formatUnknownCommandMessage(command.originalText || '', lang, dialect),
              lang
            )
          }
        }
        break
      }

      default:
        logger.warn('Unhandled command: %s', command.command)
    }
  } catch (error) {
    logger.error('Error handling command: %o', error)
    logger.error('Command exception for %s: %o', phoneNumber, error)
    await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
  }
}

/**
 * Fetch rate context for the given phone numbers, then route the command.
 *
 * This function is exported (with injectable handlers) so that AC1 tests can
 * verify the full fetch→route pipeline: phone number → getLocalRate → handler
 * args — without going through the HTTP stack or the private processWebhook.
 *
 * processWebhook does NOT call dispatchCommand directly; it calls
 * fetchRateContext + handleCommand separately so that the rate fetch visibly
 * occurs before handleCommand in the processWebhook body. dispatchCommand
 * mirrors that logic for testing purposes.
 *
 * If dispatchCommand were to hardcode nulls instead of calling fetchRateContext,
 * the AC1 tests would fail because the injected handler would receive null
 * instead of the seeded cache value.
 */
export async function dispatchCommand(
  from: string,
  command: ParsedCommand,
  lang: Lang,
  context: import('#services/db').ContextMessage[] = [],
  balanceHandler: typeof handleBalanceCommand = handleBalanceCommand,
  sendHandler: typeof handleSendCommand = handleSendCommand,
  pendingTxs: Map<string, PendingTransaction> = pendingTransactions,
  activeSendsSet: Set<string> = activeSends
): Promise<void> {
  // Cancel stale pending tx if user sends an unrelated command
  clearPendingIfUnrelated(from, command, pendingTxs)

  const recipientPhone =
    command.command === 'send' && command.recipient
      ? command.recipient
      : command.command === 'confirm'
        ? pendingTxs.get(from)?.recipient
        : undefined
  const rateCtx = await fetchRateContext(from, recipientPhone)
  await routeCommand(
    from,
    command,
    lang,
    rateCtx,
    context,
    balanceHandler,
    sendHandler,
    generateResponse,
    sendTextMessage,
    pendingTxs,
    activeSendsSet
  )
}

/**
 * Try to fill in the missing piece of a partial send.
 * Returns { amount, recipient } if successful, null otherwise.
 */
async function resolvePartialSend(
  partial: PartialSend,
  text: string,
  ownerPhone: string
): Promise<{ amount: number; recipient: string } | null> {
  const trimmed = text.trim()

  if (partial.recipient && !partial.amount) {
    // We have the recipient, user should be sending the amount.
    // Strip currency words: "4 dólares", "$5", "10 pesos" → number
    const cleaned = trimmed
      .replace(/^\$/, '')
      .replace(/\s*(d[oó]lar(?:es)?|dollars?|pesos?|usd|plata)\s*$/i, '')
      .trim()
    const result = parseAndValidateAmount(cleaned)
    if (result.value !== null && result.errorCode === null) {
      return { amount: result.value, recipient: partial.recipient }
    }
  }

  if (partial.amount && !partial.recipient) {
    // We have the amount, user should be sending the phone number or alias.
    const phone = canonicalizePhone(trimmed)
    if (phone) {
      return { amount: partial.amount, recipient: phone }
    }
    // Try smart alias resolution (prefix, word, contains, typo)
    const matches = await smartResolveAlias(ownerPhone, trimmed)
    if (matches.length === 1) {
      return { amount: partial.amount, recipient: matches[0].targetPhone }
    }
    // Multiple matches or no match → fall through to normal parsing
  }

  return null
}

export default class WebhookController {
  /**
   * GET /webhook/whatsapp
   *
   * Meta webhook verification endpoint.
   * If mode is 'subscribe' and token matches WHATSAPP_VERIFY_TOKEN, returns the
   * challenge string with 200. Otherwise responds 403.
   */
  async verify({ request, response }: HttpContext) {
    const mode = request.qs()['hub.mode']
    const token = request.qs()['hub.verify_token']
    const challenge = request.qs()['hub.challenge']

    const verifyToken = env.get('WHATSAPP_VERIFY_TOKEN')

    logger.info('Webhook verification request — mode: %s, challenge present: %s', mode, !!challenge)

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('Webhook verified successfully by Meta')
      return response.status(200).send(challenge)
    }

    logger.warn('Webhook verification failed — received token does not match')
    return response.status(403).send('')
  }

  /**
   * POST /webhook/whatsapp
   *
   * Incoming WhatsApp messages. Responds 200 immediately per Meta's requirement,
   * then kicks off async processing. Errors during processing are logged but
   * never bubble up (the 200 is already sent).
   */
  async handle({ request, response }: HttpContext) {
    const body = request.body() as WebhookPayload

    // Verify X-Hub-Signature-256 when app secret is configured
    const appSecret = env.get('WHATSAPP_APP_SECRET')
    if (appSecret) {
      const rawBody = request.raw()
      if (!rawBody) {
        logger.error(
          'Webhook rejected: request.raw() returned null — rawBody may not be configured in bodyparser'
        )
        return response.status(500).send('')
      }
      const signature = request.header('x-hub-signature-256')
      if (!signature || !this.verifySignature(rawBody, appSecret, signature)) {
        logger.warn('Webhook signature verification failed')
        return response.status(401).send('')
      }
    }

    logger.info('Webhook event received')

    // Respond 200 immediately — Meta requires this
    response.status(200).send('')

    // Process asynchronously after response
    this.processWebhook(body).catch((err) => logger.error('Webhook processing error: %o', err))
  }

  /**
   * Verify Meta's X-Hub-Signature-256 header against the raw request body.
   * Uses the original bytes from the wire (via request.raw()) so the HMAC
   * matches regardless of JSON key ordering or whitespace differences.
   * Uses constant-time comparison to prevent timing attacks.
   */
  private verifySignature(rawBody: string, secret: string, headerSignature: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

    if (expected.length !== headerSignature.length) return false

    return timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature))
  }

  /**
   * Full message processing pipeline.
   *
   * Ported from Express POST /webhook/whatsapp handler (server.ts lines 160-318).
   * Delegates to already-ported services for parsing, language, and WhatsApp I/O.
   */
  private async processWebhook(payload: WebhookPayload): Promise<void> {
    const entry = payload.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    // Log delivery status callbacks (sent/delivered/read/failed) from Meta
    const statuses = value?.statuses
    if (statuses && statuses.length > 0) {
      for (const s of statuses) {
        if (s.status === 'failed') {
          logger.warn('Message delivery FAILED to %s: %o', s.recipient_id, s.errors)
        } else {
          logger.info('Message status: %s → %s', s.recipient_id, s.status)
        }
      }
    }

    if (!messages || messages.length === 0) {
      if (!statuses || statuses.length === 0) {
        logger.info('No messages in webhook payload')
      }
      return
    }

    const message = messages[0]
    const rawFrom = message.from
    const from = canonicalizePhone(rawFrom)
    if (!from) {
      logger.warn('Invalid sender phone, dropping')
      return
    }
    const messageId = message.id

    // ── Extract text from text, button reply, or list reply ────────────
    let text = ''
    if (message.text?.body) {
      text = message.text.body
    } else if (message.interactive?.button_reply?.title) {
      text = message.interactive.button_reply.title
      logger.info('Button clicked: "%s" (id: %s)', text, message.interactive.button_reply.id)
    } else if (message.interactive?.list_reply?.title) {
      text = message.interactive.list_reply.title
      logger.info('List item selected: "%s" (id: %s)', text, message.interactive.list_reply.id)
    }

    // ── Deduplication ──────────────────────────────────────────────────
    const rateLimitService = await app.container.make('rateLimitService')

    if (rateLimitService.isDuplicate(messageId)) {
      logger.info('Duplicate message %s, skipping', messageId)
      return
    }

    // ── Spam protection ────────────────────────────────────────────────
    if (rateLimitService.isSpamming(from)) {
      logger.warn('Spam detected from %s, ignoring', maskPhone(from))
      // Mark as processed so Meta doesn't retry spam
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Global pause check ──────────────────────────────────────────
    if (getIsPaused()) {
      const pauseLang = (await getUserLanguage(from)) || getLanguageForPhone(from)
      await sendTextMessage(from, formatMaintenanceMessage(pauseLang), pauseLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Blocked user check ────────────────────────────────────────────
    const blockedPref = await findUserPrefByPhone(from)
    if (blockedPref?.blocked) {
      const blockedLang: Lang =
        (blockedPref.preferredLanguage as Lang) ||
        (await getUserLanguage(from)) ||
        getLanguageForPhone(from)
      await sendTextMessage(from, formatAccountSuspendedMessage(blockedLang), blockedLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    logger.info('Message from %s: "%s"', maskPhone(from), text)

    // Mark as read + show typing indicator (non-blocking, best-effort)
    await markAsReadWithTyping(messageId)

    // ── Contact card messages (vCard import) ────────────────────────────
    if (message.type === 'contacts' && message.contacts?.length) {
      // Clear any pending state so stale confirmations can't be triggered later
      pendingTransactions.delete(from)
      pendingContactOverwrites.delete(from)
      partialSends.delete(from)

      const contactLang: Lang = (await getUserLanguage(from)) || getLanguageForPhone(from)
      try {
        const response = await handleContactCard(from, message.contacts, contactLang)
        await sendTextMessage(from, response, contactLang)
      } catch (err) {
        logger.error('Contact card processing failed for %s: %o', maskPhone(from), err)
        await sendTextMessage(from, formatCommandErrorMessage(contactLang), contactLang)
      }
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Non-text messages (image, audio, sticker, video, location) ────
    if (!text && message.type && message.type !== 'text' && message.type !== 'interactive') {
      logger.info('Non-text message (%s) from %s', message.type, maskPhone(from))
      const mediaLang = (await getUserLanguage(from)) || getLanguageForPhone(from)
      await sendTextMessage(from, formatTextOnlyMessage(mediaLang), mediaLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Fetch conversation context (non-financial follow-ups) ──────────
    const context = await getConversationContext(from)

    // ── Multi-turn send: resolve partial sends before parsing ──────────
    // If the user previously gave an incomplete send (amount or recipient only),
    // try to interpret this message as the missing piece.
    const partial = partialSends.get(from)
    if (partial && Date.now() - partial.timestamp <= PENDING_TX_TTL_MS) {
      let resolved: { amount: number; recipient: string } | null = null
      try {
        resolved = await resolvePartialSend(partial, text, from)
      } catch (err) {
        logger.error('resolvePartialSend failed for %s: %o', maskPhone(from), err)
      }
      if (resolved) {
        partialSends.delete(from)
        logger.info(
          'Partial send resolved for %s: amount=%s recipient=%s',
          maskPhone(from),
          resolved.amount,
          maskPhone(resolved.recipient)
        )
        // Synthesize a complete send command and skip normal parsing
        const command: ParsedCommand = {
          command: 'send',
          amount: resolved.amount,
          recipient: resolved.recipient,
          isLargeAmount: resolved.amount > 500,
          originalText: text,
        }
        // Language, rate context, and routing — same path as normal sends
        const lang: Lang =
          (await getUserLanguage(from)) || partial.lang || getLanguageForPhone(from)
        clearPendingIfUnrelated(from, command, pendingTransactions)
        const rateCtx = await fetchRateContext(from, resolved.recipient)
        try {
          await this.handleCommand(from, command, lang, rateCtx, context)
          logger.info('Message %s processed (partial send resolved)', messageId)
        } finally {
          rateLimitService.markProcessed(messageId)
        }
        return
      }
      // Text didn't fill the gap — clear partial and parse normally
      partialSends.delete(from)
    } else if (partial) {
      partialSends.delete(from) // expired
    }

    // ── Parse command ──────────────────────────────────────────────────
    const command = await parseMessage(text, { messageId, phoneNumber: from }, context)
    logger.info('Command parsed: %o', command)

    // ── Store context for eligible intents (fire-and-forget, before handler) ──
    // Written early to reduce race window if a second message arrives quickly.
    // Only non-financial intents — never store send attempts or unknown messages.
    const CONTEXT_INTENTS = new Set([
      'greeting',
      'social',
      'help',
      'about',
      'history',
      'settings',
      'language',
      'start',
    ])
    if (CONTEXT_INTENTS.has(command.command)) {
      appendConversationMessage(from, text)
    }

    // Log LLM status for observability
    if (command.llmStatus) {
      logger.info('LLM status: %s', command.llmStatus)
    }

    // ── Language detection + persistence ──────────────────────────────
    let userLang = await getUserLanguage(from)

    // Explicit language command always wins
    if (command.command === 'language' && command.detectedLanguage) {
      const lang = command.detectedLanguage as 'en' | 'es' | 'pt'
      await setUserLanguage(from, lang)
      userLang = lang
    } else {
      // Auto-detect from message text (regex-based)
      const detection = detectLanguage(text)

      // LLM detection (higher quality for natural language)
      const llmLang =
        command.detectedLanguage && command.detectedLanguage !== 'ambiguous'
          ? (command.detectedLanguage as 'en' | 'es' | 'pt')
          : null

      // Best signal: LLM (when available) > regex (when high confidence)
      const detectedLang =
        llmLang || (detection && detection.confidence >= PERSIST_THRESHOLD ? detection.lang : null)

      if (detectedLang) {
        // Update persisted preference if different — language follows the user.
        // Skip persistence for unknown commands: a single typo or gibberish
        // message shouldn't permanently flip the user's language.
        if (detectedLang !== userLang && command.command !== 'unknown') {
          await setUserLanguage(from, detectedLang)
        }
        // Use detected lang for this message (even on unknown), but only
        // override if user has no persisted preference
        if (command.command !== 'unknown' || !userLang) {
          userLang = detectedLang
        }
      } else if (!userLang && detection) {
        // Low confidence, no persisted preference — use for this message only
        userLang = detection.lang
      }
    }

    // Cancel stale pending tx if user sends an unrelated command
    clearPendingIfUnrelated(from, command, pendingTransactions)

    // ── Fetch exchange rates before handleCommand ──────────────────────
    let recipientPhone: string | undefined
    if (command.command === 'send' && command.recipient) {
      recipientPhone = command.recipient
    } else if (command.command === 'confirm') {
      recipientPhone = pendingTransactions.get(from)?.recipient
    }
    const rateCtx = await fetchRateContext(from, recipientPhone)

    // ── Route to command handler ──────────────────────────────────────
    const lang: Lang = userLang || getLanguageForPhone(from)
    try {
      await this.handleCommand(from, command, lang, rateCtx, context)
      logger.info('Message %s processed successfully', messageId)

      // Post-command: one-time email nudge for users without verified email.
      // Only after balance/send/confirm — engaged moments where the ask feels natural.
      if (['balance', 'send', 'confirm'].includes(command.command)) {
        try {
          const pref = await findUserPrefByPhone(from)
          if (pref && !pref.emailVerified && !pref.emailNudgeSentAt) {
            await sendTextMessage(from, formatEmailNudge(lang), lang)
            const prefKey = await resolveUserPrefKey(from)
            await UserPreference.updateOrCreate(
              { phoneNumber: prefKey },
              { emailNudgeSentAt: DateTime.now() }
            )
            logger.info('Email nudge sent to %s', maskPhone(from))
          }
        } catch (nudgeErr) {
          // Non-fatal — never let the nudge break the main flow
          logger.warn('Email nudge failed for %s: %o', maskPhone(from), nudgeErr)
        }
      }
    } finally {
      // Always mark as processed to prevent infinite Meta retries.
      // Individual handlers (e.g. send) have their own idempotency guards.
      rateLimitService.markProcessed(messageId)
    }
  }

  /**
   * Route a parsed command to the appropriate handler.
   *
   * Rate context is resolved by processWebhook before this call and forwarded
   * to the routing layer so balance and send handlers receive pre-fetched rates.
   */
  private async handleCommand(
    phoneNumber: string,
    command: ParsedCommand,
    lang: Lang,
    rateCtx: RateContext,
    context: import('#services/db').ContextMessage[] = []
  ): Promise<void> {
    await routeCommand(phoneNumber, command, lang, rateCtx, context)
  }
}

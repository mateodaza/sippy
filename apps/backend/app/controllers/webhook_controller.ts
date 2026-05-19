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
import {
  extractBracketToken,
  extractReferralToken,
  dispatchBracketToken,
} from '#services/bracket_token.service'
import { captureReferral, ensureReferralCode } from '#services/quest/referral.service'
import { getUserQuestStatus } from '#services/quest/scoring.service'
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
  formatDashboardMessage,
  formatReferralCodeMessage,
  formatQuestStatusMessage,
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
  formatAmountBelowMinWithContext,
  formatInsufficientBalanceRetryHint,
  formatContactNotFound,
  formatPayConfirmationPrompt,
  formatPayQrLinkMessage,
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
import { isSmartModeEnabledFor } from '#services/smart_mode/cohort'
import { dispatchSmartMode } from '#services/smart_mode/dispatcher'
import { selectUnknownVariant } from '#services/smart_mode/unknown_variants'

// Exported so tests can seed/inspect state directly
export const pendingTransactions = new Map<string, PendingTransaction>()
export const partialSends = new Map<string, PartialSend>()
export const activeSends = new Set<string>()
export const pendingInvites = new Map<string, { timestamp: number; lang: Lang }>()
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

/**
 * Friendly label for the recipient in recoverable-error retry copy.
 * Display name wins (alias / pay-QR), then masked phone, then raw text.
 *
 * Invariant: returns a label ONLY when reseedRecoverableSendError will
 * actually have something to seed (i.e. `recipient || recipientRaw`).
 * A label without a seedable identifier would tell the user "retry to
 * Carlos" while the bot silently drops Carlos on the next inbound —
 * exactly the trust-breaking context loss this whole subsystem exists
 * to prevent. If a future flow has only `recipientDisplayName` and no
 * canonical/raw recipient, fix the upstream so it carries one rather
 * than relaxing this guard.
 */
function recipientLabelFor(command: ParsedCommand): string | null {
  if (!command.recipient && !command.recipientRaw) return null
  if (command.recipientDisplayName) return command.recipientDisplayName
  if (command.recipient) return maskPhone(command.recipient)
  return command.recipientRaw ?? null
}

/**
 * Re-seed `partialSends` after a RECOVERABLE send error so the user can
 * retry by sending just a replacement amount (or amount + currency word)
 * and the resolver picks up where we left off — recipient, currency,
 * pay-QR scan context all preserved across the retry.
 *
 * Per the 2026-05-17 design call: only fires for TOO_SMALL (post-FX) and
 * insufficient-balance. Cancels, confirms, successful sends, self-sends,
 * invalid phones, and ambiguous aliases MUST NOT re-seed (they're either
 * terminal or already represented by a different partial state).
 *
 * No-op when neither `recipient` nor `recipientRaw` is set — there's
 * nothing to preserve, and seeding a partial with only `localCurrency`
 * would confuse the resolver about what to ask for next.
 */
function reseedRecoverableSendError(from: string, command: ParsedCommand, lang: Lang): void {
  if (!command.recipient && !command.recipientRaw) return
  partialSends.set(from, {
    recipient: command.recipient,
    recipientRaw: command.recipientRaw,
    localCurrency: command.localCurrency,
    recipientDisplayName: command.recipientDisplayName,
    payQrScan: command.payQrScan,
    timestamp: Date.now(),
    lang,
  })
}

// Non-financial intents that should accrue conversation context. Kept outside
// processWebhook so SMART-routed and regex-routed paths share the same set —
// any drift would mean SMART-handled greetings/help don't grow context the
// way regex/LLM-routed ones do (regression risk for state-aware copy).
const CONTEXT_INTENTS = new Set<string>([
  'greeting',
  'social',
  'help',
  'about',
  'history',
  'settings',
  'language',
  'start',
  'dashboard',
])

/**
 * Append conversation context (for eligible intents) and resolve the final
 * language used for routing + outbound copy. Mirrors the persistence the
 * old inline block ran at the same lifecycle point, factored out so the
 * SMART execute branch and the regular parseMessage branch can't drift.
 *
 * Side effects:
 *   - appendConversationMessage when command is in CONTEXT_INTENTS
 *   - setUserLanguage when the high-confidence detected lang differs from
 *     the stored preference (skipped on `unknown` — a single typo must not
 *     flip the user's language)
 *
 * `cachedUserLang` lets the caller skip a redundant getUserLanguage round-trip
 * when it already fetched the value (e.g. the SMART path uses it for the
 * classifier's `preferredLang` hint). `undefined` = not provided, fetch it;
 * `null` = caller fetched and got no preference; `Lang` = caller fetched value.
 *
 * Exported for future webhook integration tests; not part of the public API.
 */
export async function appendContextAndResolveLang(
  from: string,
  text: string,
  command: ParsedCommand,
  cachedUserLang?: Lang | null
): Promise<Lang> {
  if (CONTEXT_INTENTS.has(command.command)) {
    appendConversationMessage(from, text)
  }

  let userLang: Lang | null =
    cachedUserLang !== undefined ? cachedUserLang : await getUserLanguage(from)

  // Explicit language command always wins
  if (command.command === 'language' && command.detectedLanguage) {
    const lang = command.detectedLanguage as Lang
    await setUserLanguage(from, lang)
    return lang
  }

  const detection = detectLanguage(text)
  const llmLang =
    command.detectedLanguage && command.detectedLanguage !== 'ambiguous'
      ? (command.detectedLanguage as Lang)
      : null
  const detectedLang =
    llmLang || (detection && detection.confidence >= PERSIST_THRESHOLD ? detection.lang : null)

  if (detectedLang) {
    if (detectedLang !== userLang && command.command !== 'unknown') {
      await setUserLanguage(from, detectedLang)
    }
    if (command.command !== 'unknown' || !userLang) {
      userLang = detectedLang
    }
  } else if (!userLang && detection) {
    userLang = detection.lang
  }

  return userLang || getLanguageForPhone(from)
}

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
    for (const [phone, invite] of pendingInvites.entries()) {
      if (now - invite.timestamp > PENDING_TX_TTL_MS) {
        pendingInvites.delete(phone)
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
  if (command.command !== 'invite') {
    pendingInvites.delete(from)
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

      case 'pay_qr': {
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatPayQrLinkMessage(phoneNumber, lang), lang)
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
                // Context-aware error + re-seed so user can retry with a
                // larger amount in the SAME currency to the SAME recipient.
                // Falls back to the plain TOO_SMALL copy when we have no
                // recipient context to preserve (e.g., classifier-only path
                // that somehow reached send without a recipient — defensive).
                const label = recipientLabelFor(command)
                if (label) {
                  reseedRecoverableSendError(phoneNumber, command, lang)
                  await sendMessageFn(
                    phoneNumber,
                    formatAmountBelowMinWithContext(
                      {
                        localAmount: command.localAmount,
                        localCurrency: command.localCurrency,
                        usdcAmount,
                        recipientLabel: label,
                      },
                      lang
                    ),
                    lang
                  )
                } else {
                  await sendMessageFn(phoneNumber, formatAmountError('TOO_SMALL', lang), lang)
                }
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
              // Alias-resolution path: by definition not a QR scan.
              payQrScan: false,
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
          // Force the confirmation path when this command came from a
          // pay-QR scan. The payer should never silently send because the
          // amount is below the personal-send threshold — scanning a QR is
          // a "real money to someone via a code" gesture and deserves an
          // explicit YES. Context is carried over from the bracket
          // dispatcher via the partial-send.
          const isPayQrScan = command.payQrScan === true
          if (command.amount <= threshold && !isPayQrScan) {
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
            // Above threshold OR vendor recipient — confirmation required.
            // Check balance first so we don't ask the user to confirm a
            // send they can't afford.
            try {
              const balance = await getEmbeddedBalance(phoneNumber)
              if (balance < command.amount) {
                // Re-seed so user can retry with a smaller amount to the
                // SAME recipient. Pay-QR scans are also re-seeded — a
                // payer at a register typically retries with the right
                // amount rather than walking away.
                const label = recipientLabelFor(command)
                reseedRecoverableSendError(phoneNumber, command, lang)
                const baseMsg = formatInsufficientBalanceMessage(
                  {
                    balance,
                    needed: command.amount,
                    localRate: rateCtx.senderRate,
                    localCurrency: rateCtx.senderCurrency,
                  },
                  lang
                )
                const fullMsg = label
                  ? `${baseMsg}\n\n${formatInsufficientBalanceRetryHint(
                      { recipientLabel: label, localCurrency: command.localCurrency },
                      lang
                    )}`
                  : baseMsg
                await sendMessageFn(phoneNumber, fullMsg, lang)
                return
              }
            } catch (err) {
              // Balance check failed. For regular sends we let the user
              // see the confirm prompt (sendHandler re-checks balance
              // before executing). For pay-QR scans that's not safe: a
              // payer at a register types YES, the inner send fails with
              // a generic insufficient-balance reply, and the receiver
              // walks away believing they were paid. Short-circuit instead.
              if (isPayQrScan) {
                logger.warn(
                  { phone: maskPhone(phoneNumber), err },
                  'pay-QR scan: balance check failed — surfacing generic error instead of confirm'
                )
                await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
                return
              }
            }

            // Store pending, ask for confirmation. Pay-QR scans get the
            // friendly display name (carried over from the bracket
            // dispatcher) in the confirm prompt; everyone else gets the
            // standard prompt with the recipient phone.
            pendingTxs.set(phoneNumber, {
              amount: command.amount,
              recipient: command.recipient,
              timestamp: Date.now(),
              lang,
              payQrScan: isPayQrScan,
            })
            // displayName is required by createQrLink at issuance time, so
            // missing it on a pay-QR confirm means something is drifting
            // (someone synthesized a pay-QR command outside the bracket
            // flow, or the partial-send lost the field). Surface it without
            // breaking the user-facing flow.
            if (isPayQrScan && !command.recipientDisplayName) {
              logger.warn(
                { phone: maskPhone(phoneNumber), recipient: maskPhone(command.recipient) },
                'pay-QR confirm prompt missing recipientDisplayName — falling back to maskPhone'
              )
            }
            const confirmPrompt = isPayQrScan
              ? formatPayConfirmationPrompt(
                  command.amount,
                  command.recipientDisplayName ?? maskPhone(command.recipient),
                  lang
                )
              : formatConfirmationPromptWithWarning(
                  command.amount,
                  command.recipient,
                  command.isLargeAmount ?? false,
                  lang
                )
            await sendMessageFn(phoneNumber, confirmPrompt, lang)
          }
        } else if (command.amount && !command.recipient) {
          // Has amount, missing recipient → store partial, ask for phone or alias.
          // Persist `localCurrency` when present so the next-turn resolver
          // can synthesize a complete send with FX still wired up — without
          // this, "envia 200 pesos" with no recipient stored amount=200
          // and the follow-up "+57…" produced a $200 USDC send (same
          // class of bug as the SMART dispatcher ambiguous-seed path).
          // Echo with the original currency word for the same reason the
          // amount needs to display correctly mid-flow (see
          // formatAskForRecipient header).
          partialSends.set(phoneNumber, {
            amount: command.amount,
            localCurrency: command.localCurrency,
            timestamp: Date.now(),
            lang,
          })
          await sendMessageFn(
            phoneNumber,
            formatAskForRecipient(command.amount, lang, command.localCurrency),
            lang
          )
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
              rateCtx.recipientCurrency,
              pending.payQrScan === true
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

      case 'dashboard': {
        // Mirror `settings`: gate on setup status so we don't deep-link a
        // new user into a wallet they haven't created yet. Pre-setup users
        // get the same setup nudge; complete users get the /wallet link.
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else {
          await sendMessageFn(phoneNumber, formatDashboardMessage(phoneNumber, lang), lang)
        }
        break
      }

      case 'referral_code': {
        // Sippy Quest — return the user's invite code (generate on first
        // request via ensureReferralCode). Gated on setup status because
        // pre-setup users don't have a `user_preferences` row yet, and
        // `referral_codes.phone_number` FK-references that table.
        //
        // No event slug: the Quest is global, the code is one-per-user-
        // lifetime (see GLOBAL_REFERRAL_CAMPAIGN). The prize draw is
        // event-scoped (see scoring service), but the share code itself
        // outlives any specific event.
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
          break
        }
        if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
          break
        }
        const maxEntries = env.get('QUEST_MAX_ENTRIES_PER_USER') ?? 5
        try {
          const codeRow = await ensureReferralCode(phoneNumber)
          // Share URL is built inside `formatReferralCodeMessage` against
          // `FRONTEND_URL` and points at `/r/<code>` on the web app — NOT
          // a raw wa.me link. See the format function header for why
          // (WhatsApp's anti-spam guard suppresses self-targeting wa.me
          // URLs in bot replies; the web redirect sidesteps it).
          await sendMessageFn(
            phoneNumber,
            formatReferralCodeMessage(
              {
                code: codeRow.code,
                maxEntries: Number(maxEntries),
              },
              lang
            ),
            lang
          )
        } catch (err) {
          logger.error({ err, phone: maskPhone(phoneNumber) }, 'referral_code: ensure failed')
          await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
        }
        break
      }

      case 'quest_status': {
        // Sippy Quest — show the user's current standing (entries +
        // breakdown + rank). Same setup gating as `referral_code`:
        // pre-setup users have no user_preferences row so the FK
        // joins in `getUserQuestStatus` would silently miss; nudge to
        // finish onboarding instead of surfacing a confusing "0/5".
        const s = await resolveStatus()
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
          break
        }
        if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
          break
        }
        // Quest standing is shown for the currently-active prize event
        // (Pizza Day). The CODE returned in the share-link CTA is global
        // (one per user, lifetime) — only the entries / rank are scoped
        // to this event's draw. Post-Pizza-Day, resolve the active event
        // dynamically from `events` table rather than hardcoding.
        const currentEventSlug = 'pizza-day-ctg-2026'
        try {
          // Fetch global code + event-scoped status in parallel — both
          // are independent reads needed for the reply. Status query
          // returns zero-state when the user hasn't earned entries yet
          // so the share-link CTA still fires.
          const [codeRow, status] = await Promise.all([
            ensureReferralCode(phoneNumber),
            getUserQuestStatus({ phone: phoneNumber, eventSlug: currentEventSlug }),
          ])
          await sendMessageFn(
            phoneNumber,
            formatQuestStatusMessage(
              {
                entries: status.entries,
                cap: status.cap,
                activity: status.activity,
                referrals: status.referrals,
                rank: status.rank,
                totalRanked: status.totalRanked,
                code: codeRow.code,
              },
              lang
            ),
            lang
          )
        } catch (err) {
          logger.error({ err, phone: maskPhone(phoneNumber) }, 'quest_status: fetch failed')
          await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
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
        // Deterministic floor message — used whenever the LLM-driven paths
        // (helpfulMessage or generateResponse) produce nothing usable.
        // SMART's verdict (when fall-through stamped the command) selects
        // the OOS pool and surfaces the sanitized hint when present;
        // otherwise default to the 'gibberish' pool — the most neutral
        // framing for unmatched input that didn't go through SMART.
        const fallbackUnknown = selectUnknownVariant({
          lang,
          category: command.smartCategory ?? 'gibberish',
          text: command.originalText ?? '',
          dialect,
          oosRedirect: command.smartOosRedirect ?? null,
        })
        if (s === 'new_user') {
          await sendMessageFn(phoneNumber, formatNudgeSetup(phoneNumber, lang), lang)
        } else if (s === 'embedded_incomplete') {
          await sendMessageFn(phoneNumber, formatNudgeFinishSetup(phoneNumber, lang), lang)
        } else if (command.smartCategory) {
          // SMART already classified this unknown as out-of-scope/gibberish.
          // If it also produced a sanitizer-cleared OOS hint, fallbackUnknown
          // is that tailored redirect; otherwise it is a deterministic
          // state-aware variant. In both cases we skip the LLM-driven
          // helpfulMessage / generateResponse paths: a generic LLM reply
          // can drift into jokes/weather/etc. after SMART already decided
          // the turn is outside Sippy's action surface.
          await sendMessageFn(phoneNumber, fallbackUnknown, lang)
        } else if (command.helpfulMessage) {
          const validated = await validateAndFallback(
            command.helpfulMessage,
            command.originalText ?? '',
            context,
            s,
            dialectHint(dialect)
          )
          await sendMessageFn(phoneNumber, validated || fallbackUnknown, lang)
        } else {
          // No helpfulMessage — try generating a conversational reply via LLM
          // before falling back to the variant-selector floor. Reachable ONLY
          // for non-SMART unknowns (cohort off, SMART couldn't classify, or
          // SMART executed/replied/never ran for this turn); SMART-stamped
          // unknowns hit the `smartCategory` branch above and never get here.
          const text = command.originalText ?? ''
          const raw = text
            ? await generateResponseFn(text, lang, context, s, dialectHint(dialect))
            : null
          const reply = await validateAndFallback(raw, text, context, s, dialectHint(dialect))
          await sendMessageFn(phoneNumber, reply || fallbackUnknown, lang)
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

export type PartialSendResolution =
  | {
      kind: 'complete'
      amount: number
      recipient: string
      /** Set when the user typed the amount with a local-currency word
       *  (or the seed already carried one). Plumbed into the synthesized
       *  ParsedCommand so the FX step converts before sending. */
      localCurrency?: string
    }
  | { kind: 'progress'; partial: PartialSend; prompt: 'amount' | 'recipient' }

function stripRecipientLead(text: string): string {
  return text
    .trim()
    .replace(/^(?:a|al|para|to|for)\s+/i, '')
    .trim()
}

/**
 * Map of currency-word slot replies to the ISO/LOCAL code used by the
 * downstream FX step. Mirrors `CURRENCY_WORD_MAP` in message_parser.ts —
 * kept in sync so a standalone "200 pesos" reply produces the same
 * `localCurrency` value as "envia 200 pesos a +57…" through the regex
 * path. Null entries mean USD-equivalent (no FX conversion).
 */
const STANDALONE_CURRENCY_MAP: Record<string, string | null> = {
  dollar: null,
  dollars: null,
  dolar: null,
  dolares: null,
  usd: null,
  plata: null,
  peso: 'LOCAL',
  pesos: 'LOCAL',
  real: 'BRL',
  reais: 'BRL',
  sol: 'PEN',
  soles: 'PEN',
  lempira: 'HNL',
  lempiras: 'HNL',
  quetzal: 'GTQ',
  quetzales: 'GTQ',
  colon: 'CRC',
  colones: 'CRC',
  bolivar: 'VES',
  bolivares: 'VES',
  guarani: 'PYG',
  guaranies: 'PYG',
}

interface StandaloneAmountParse {
  amount: number
  /** null = USD/no currency word; non-null = local currency code for FX. */
  localCurrency: string | null
}

/**
 * Parse a standalone amount reply, capturing both the numeric value and
 * any currency word the user appended. Returning the currency separately
 * is what keeps "200 pesos" from becoming $200 USDC in the partial-send
 * resolver — caller must thread `localCurrency` into the synthesized
 * command so FX runs.
 */
function parseStandaloneAmount(text: string): StandaloneAmountParse | null {
  const trimmed = text.trim().replace(/^\$/, '')
  // Capture the trailing currency word (accent-stripped match key).
  const currencyMatch = trimmed.match(
    /\s+(d[oó]lar(?:es)?|dollars?|pesos?|usd|plata|rea(?:is|l)|soles?|lempiras?|quetzales?|colone?s?|bol[ií]vares?|guaranie?s?)\s*$/i
  )
  let localCurrency: string | null = null
  let cleaned = trimmed
  if (currencyMatch) {
    const key = currencyMatch[1]
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
    if (key in STANDALONE_CURRENCY_MAP) {
      localCurrency = STANDALONE_CURRENCY_MAP[key]
    }
    cleaned = trimmed.slice(0, currencyMatch.index).trim()
  }
  const result = parseAndValidateAmount(cleaned)
  if (result.value === null || result.errorCode !== null) return null
  return { amount: result.value, localCurrency }
}

/**
 * Try to advance or complete a partial send.
 * Returns a complete send when both slots are known, a progressed partial
 * when one standalone reply filled exactly one slot, or null when the text
 * should fall back to normal parsing.
 *
 * Exported for the SMART-seed → resolve integration tests; not part of
 * the public webhook API.
 */
export async function resolvePartialSend(
  partial: PartialSend,
  text: string,
  ownerPhone: string
): Promise<PartialSendResolution | null> {
  const trimmed = text.trim()

  if ((partial.recipient || partial.recipientRaw) && !partial.amount) {
    // We have the recipient, user should be sending the amount.
    const parsed = parseStandaloneAmount(trimmed)
    if (parsed !== null) {
      // Prefer the freshly-typed currency; fall back to whatever the seed
      // already carried (e.g. dispatcher pre-filled amount with a currency
      // and recipient came in later, then amount came in — unlikely but
      // mirrored for completeness).
      const localCurrency = parsed.localCurrency ?? partial.localCurrency ?? undefined
      if (partial.recipient) {
        return {
          kind: 'complete',
          amount: parsed.amount,
          recipient: partial.recipient,
          localCurrency,
        }
      }

      const candidate = partial.recipientRaw!
      const phone = canonicalizePhone(candidate)
      if (phone) {
        return { kind: 'complete', amount: parsed.amount, recipient: phone, localCurrency }
      }
      const matches = await smartResolveAlias(ownerPhone, candidate)
      if (matches.length === 1) {
        return {
          kind: 'complete',
          amount: parsed.amount,
          recipient: matches[0].targetPhone,
          localCurrency,
        }
      }

      return {
        kind: 'progress',
        partial: {
          ...partial,
          amount: parsed.amount,
          localCurrency,
          recipientRaw: undefined,
          timestamp: Date.now(),
        },
        prompt: 'recipient',
      }
    }
  }

  if (partial.amount && !partial.recipient) {
    // We have the amount, user should be sending the phone number or alias.
    const candidate = stripRecipientLead(trimmed)
    const phone = canonicalizePhone(candidate)
    if (phone) {
      return {
        kind: 'complete',
        amount: partial.amount,
        recipient: phone,
        localCurrency: partial.localCurrency,
      }
    }
    // Try smart alias resolution (prefix, word, contains, typo)
    const matches = await smartResolveAlias(ownerPhone, candidate)
    if (matches.length === 1) {
      return {
        kind: 'complete',
        amount: partial.amount,
        recipient: matches[0].targetPhone,
        localCurrency: partial.localCurrency,
      }
    }
    // Multiple matches or no match → fall through to normal parsing
  }

  if (partial.sendIntent && !partial.amount && !partial.recipient) {
    const parsed = parseStandaloneAmount(trimmed)
    if (parsed !== null) {
      return {
        kind: 'progress',
        partial: {
          ...partial,
          amount: parsed.amount,
          localCurrency: parsed.localCurrency ?? undefined,
          timestamp: Date.now(),
        },
        prompt: 'recipient',
      }
    }

    const candidate = stripRecipientLead(trimmed)
    const phone = canonicalizePhone(candidate)
    if (phone) {
      return {
        kind: 'progress',
        partial: {
          ...partial,
          recipient: phone,
          recipientRaw: undefined,
          timestamp: Date.now(),
        },
        prompt: 'amount',
      }
    }

    const matches = await smartResolveAlias(ownerPhone, candidate)
    if (matches.length === 1) {
      return {
        kind: 'progress',
        partial: {
          ...partial,
          recipient: matches[0].targetPhone,
          recipientRaw: undefined,
          timestamp: Date.now(),
        },
        prompt: 'amount',
      }
    }
  }

  return null
}

export async function resolvePendingInvite(
  ownerPhone: string,
  text: string
): Promise<ParsedCommand | null> {
  const candidate = stripRecipientLead(text)
  const phone = canonicalizePhone(candidate)
  if (phone) {
    return { command: 'invite', recipient: phone, originalText: text }
  }

  const matches = await smartResolveAlias(ownerPhone, candidate)
  if (matches.length === 1) {
    return { command: 'invite', recipient: matches[0].targetPhone, originalText: text }
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

    // ── QR bracket-token first-contact handler ─────────────────────────
    // Runs BEFORE the partial-send resolver, parser, and LLM. A scanned QR
    // lands the user in WhatsApp with `Hola Sippy! [ABC23XYZ]`; the token
    // is routing metadata (event_slug + source_tag), not natural-language
    // intent, so it never enters the LLM prompt — we strip it to context
    // before any parsing happens. Spec: QR_SYSTEM_SPEC.md "Locked decision #3".
    //
    // Wrapped in try/catch because processWebhook is invoked fire-and-forget
    // by the route handler — any throw escaping here aborts processing
    // without sending a reply and without marking the message processed,
    // which makes Meta retry the same webhook in a loop. At Pizza Day that
    // means an attendee scans a QR, sees nothing, scans again, still nothing.
    // The catch mirrors the contact-card pattern above: log, send a generic
    // error fallback, mark processed, return.
    // ── Referral token [REF-XXXXXX] ────────────────────────────────────
    // Runs BEFORE the QR bracket extractor — the two patterns can't
    // collide today (prefix + length differ) but parsing-order discipline
    // keeps that property explicit so any future widening of either
    // pattern can't accidentally route a referral through the QR path.
    //
    // Capture is silent: we record the attribution (or stash it pending
    // if the user hasn't finished onboarding) and let downstream parsing
    // continue on the stripped text. No reply, no markProcessed — the
    // user typed `[REF-XXX]` because they were invited; the welcome /
    // greeting / setup-nudge that fires from the stripped text IS the
    // user-facing acknowledgment.
    const referralExtracted = extractReferralToken(text)
    if (referralExtracted.code) {
      text = referralExtracted.stripped
      try {
        const senderPref = await findUserPrefByPhone(from)
        // attributionEventSlug = the event this referral lands under.
        // Codes are global (GLOBAL_REFERRAL_CAMPAIGN), but attributions
        // record where the referee actually showed up so the prize-draw
        // scoring can filter. Hardcoded for Pizza Day MVP; resolve from
        // the currently-active event post-event.
        const capture = await captureReferral({
          code: referralExtracted.code,
          refereePhone: from,
          refereeOnboarded: !!senderPref,
          attributionEventSlug: 'pizza-day-ctg-2026',
        })
        logger.info(
          { phone: maskPhone(from), code: referralExtracted.code, capture: capture.kind },
          'webhook: referral captured'
        )
      } catch (err) {
        // Referral capture must never block message processing — log and
        // continue with the stripped text. Worst case: an attribution
        // intent is dropped, which is better than swallowing the message.
        logger.error({ err, phone: maskPhone(from) }, 'webhook: referral capture threw')
      }
    }

    const { shortId, stripped } = extractBracketToken(text)
    if (shortId) {
      const bracketLang: Lang = (await getUserLanguage(from)) || getLanguageForPhone(from)
      try {
        const dispatch = await dispatchBracketToken({
          shortId,
          phoneNumber: from,
          lang: bracketLang,
        })
        if (dispatch.reply) {
          // Event dispatch handled the message end-to-end (linked + welcomed,
          // or sent the new-user setup URL, or surfaced an inactive-QR notice,
          // or prompted for a pay-QR amount).
          await sendTextMessage(from, dispatch.reply, bracketLang)

          // Pay-QR scan: stash a partial-send so the next inbound message
          // resolves as the amount for this recipient. `payQrScan: true`
          // is the signal the downstream send branch reads to force the
          // confirmation prompt (regardless of CONFIRM_THRESHOLD) and use
          // the friendly display name in the confirm copy.
          // The TTL-based GC + per-command partialSends.delete elsewhere in
          // this file ensure a long-forgotten pay scan eventually expires.
          if (dispatch.outcome === 'pay_prompt_for_amount' && dispatch.payRecipient) {
            partialSends.set(from, {
              recipient: dispatch.payRecipient,
              recipientDisplayName: dispatch.payDisplayName ?? undefined,
              payQrScan: true,
              timestamp: Date.now(),
              lang: bracketLang,
            })
          }

          rateLimitService.markProcessed(messageId)
          return
        }
        // not_found / unsupported_kind without a reply: fall through to normal
        // parsing on the stripped text. We don't want a stale/invalid token to
        // swallow the rest of the user's message ("hola sippy [ABC23XYZ] balance"
        // still resolves the balance intent).
        text = stripped
      } catch (err) {
        logger.error(
          { shortId, phone: maskPhone(from), err },
          'bracket-token handler threw — sending error fallback'
        )
        await sendTextMessage(from, formatCommandErrorMessage(bracketLang), bracketLang)
        rateLimitService.markProcessed(messageId)
        return
      }
    }

    // ── Fetch conversation context (non-financial follow-ups) ──────────
    const context = await getConversationContext(from)

    // ── Multi-turn invite: resolve the phone/contact after SMART asked ─
    const pendingInvite = pendingInvites.get(from)
    if (pendingInvite && Date.now() - pendingInvite.timestamp <= PENDING_TX_TTL_MS) {
      const command = await resolvePendingInvite(from, text)
      if (command) {
        pendingInvites.delete(from)
        const lang: Lang =
          (await getUserLanguage(from)) || pendingInvite.lang || getLanguageForPhone(from)
        clearPendingIfUnrelated(from, command, pendingTransactions)
        const rateCtx = await fetchRateContext(from, undefined)
        try {
          await this.handleCommand(from, command, lang, rateCtx, context)
          logger.info('Message %s processed (pending invite resolved)', messageId)
        } finally {
          rateLimitService.markProcessed(messageId)
        }
        return
      }
      pendingInvites.delete(from)
    } else if (pendingInvite) {
      // expired — drop the stale entry and log it so a user who took
      // longer than PENDING_TX_TTL_MS to reply with the contact/number
      // doesn't silently get their message re-parsed as an unknown
      // command (the previous turn's invite prompt becomes invisible
      // context). Parity with the partial-send `// expired` branch below.
      pendingInvites.delete(from)
      logger.info(
        'Pending invite for %s expired (>%dms since prompt) — dropped',
        maskPhone(from),
        PENDING_TX_TTL_MS
      )
    }

    // ── Multi-turn send: resolve partial sends before parsing ──────────
    // If the user previously gave an incomplete send (amount or recipient only),
    // try to interpret this message as the missing piece.
    const partial = partialSends.get(from)
    if (partial && Date.now() - partial.timestamp <= PENDING_TX_TTL_MS) {
      let resolved: PartialSendResolution | null = null
      try {
        resolved = await resolvePartialSend(partial, text, from)
      } catch (err) {
        logger.error('resolvePartialSend failed for %s: %o', maskPhone(from), err)
      }
      if (resolved?.kind === 'progress') {
        partialSends.set(from, resolved.partial)
        const lang: Lang =
          (await getUserLanguage(from)) || resolved.partial.lang || getLanguageForPhone(from)
        const prompt =
          resolved.prompt === 'recipient'
            ? formatAskForRecipient(resolved.partial.amount!, lang, resolved.partial.localCurrency)
            : formatAskForAmount(resolved.partial.recipient!, lang)
        try {
          await sendTextMessage(from, prompt, lang)
          logger.info('Message %s processed (partial send progressed)', messageId)
        } finally {
          rateLimitService.markProcessed(messageId)
        }
        return
      }
      if (resolved?.kind === 'complete') {
        partialSends.delete(from)
        logger.info(
          'Partial send resolved for %s: amount=%s recipient=%s',
          maskPhone(from),
          resolved.amount,
          maskPhone(resolved.recipient)
        )
        // Synthesize a complete send command and skip normal parsing.
        // Carry the pay-QR scan context forward so the downstream send
        // branch can force confirmation + use the display name in the
        // confirm prompt. recipientDisplayName is undefined for non-pay
        // partials and the send branch falls back to the default copy.
        //
        // When `resolved.localCurrency` is set, mirror the dual-field
        // semantics used by `parseSendMatch` (`message_parser.ts`) and
        // `synthesizeParsedCommand` (`smart_mode/dispatcher.ts`): both
        // `amount` AND `localAmount` carry the raw pre-conversion value;
        // the downstream FX step replaces `amount` with the USDC
        // equivalent using `localCurrency` as the signal. Setting only
        // `amount` would skip conversion entirely and send local face
        // value as USDC.
        const command: ParsedCommand = {
          command: 'send',
          amount: resolved.amount,
          recipient: resolved.recipient,
          isLargeAmount: resolved.amount > 500,
          originalText: text,
          recipientDisplayName: partial.recipientDisplayName,
          payQrScan: partial.payQrScan,
        }
        if (resolved.localCurrency) {
          command.localAmount = resolved.amount
          command.localCurrency = resolved.localCurrency
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

    // ── SMART MODE — cohort-gated triage layer ─────────────────────────
    // Runs AFTER partial-send resolution (which owns mid-flow continuation)
    // and BEFORE the regex/LLM parser. Three outcomes:
    //   • execute      — synthesized ParsedCommand goes through the SAME
    //                    handleCommand chokepoint as regex-routed messages,
    //                    so force-confirm/threshold/self-send/balance guards
    //                    all still apply. Context append + language learning
    //                    flow through `appendContextAndResolveLang` so SMART
    //                    and regex paths stay in sync.
    //   • reply        — send the sanitized clarifying question and stop.
    //                    No command synthesized, so no context/lang side
    //                    effects (matches: an unanswered ambiguity isn't
    //                    a real intent yet).
    //   • fall_through — let parseMessage have a shot. Pass `skipSmart:true`
    //                    so any future code that adds a SMART call inside
    //                    parseMessage can't loop classifier→fall→classifier.
    //
    // Cohort/env gate fails closed; SMART MODE skipped on DB error.
    const smartEnabled = await isSmartModeEnabledFor(from)
    let cachedUserLang: Lang | null | undefined
    // SMART fall-through verdict (category + sanitized OOS hint), captured
    // here so the unknown handler downstream can pick a state-aware variant
    // instead of the single static fallback. Stays undefined on non-SMART
    // paths (cohort off) — the variant selector handles that case too.
    let smartFallThroughCategory: 'out_of_scope' | 'gibberish' | undefined
    let smartFallThroughOosRedirect: string | undefined
    if (smartEnabled) {
      cachedUserLang = await getUserLanguage(from)
      const outcome = await dispatchSmartMode({
        text,
        phoneNumber: from,
        context,
        preferredLang: cachedUserLang ?? undefined,
      })
      logger.info(
        {
          msgId: messageId,
          phone: maskPhone(from),
          lang: cachedUserLang ?? null,
          category: outcome.classification.category,
          intent: outcome.classification.intent ?? null,
          confidence: outcome.classification.confidence,
          dispatcherDecision: outcome.kind,
        },
        'smart_mode.webhook'
      )
      if (outcome.kind === 'execute') {
        const lang = await appendContextAndResolveLang(from, text, outcome.command, cachedUserLang)
        if (outcome.command.llmStatus) {
          logger.info('LLM status: %s', outcome.command.llmStatus)
        }
        clearPendingIfUnrelated(from, outcome.command, pendingTransactions)
        const recipientPhone =
          outcome.command.command === 'send' ? outcome.command.recipient : undefined
        const rateCtx = await fetchRateContext(from, recipientPhone)
        try {
          await this.handleCommand(from, outcome.command, lang, rateCtx, context)
          logger.info('Message %s processed (smart_mode execute)', messageId)
        } finally {
          rateLimitService.markProcessed(messageId)
        }
        return
      }
      if (outcome.kind === 'reply') {
        const lang: Lang = cachedUserLang || getLanguageForPhone(from)
        if (outcome.pending?.kind === 'send') {
          partialSends.set(from, {
            ...outcome.pending.partial,
            timestamp: Date.now(),
            lang,
          })
        } else if (outcome.pending?.kind === 'invite') {
          pendingInvites.set(from, {
            timestamp: Date.now(),
            lang,
          })
        }
        try {
          await sendTextMessage(from, outcome.text, lang)
          logger.info('Message %s processed (smart_mode reply)', messageId)
        } finally {
          // Mark processed even if WhatsApp send throws — otherwise Meta
          // retries the inbound and we loop on the same failing send.
          // Same dedupe semantics as the SMART execute branch above and
          // the regular handleCommand branch in `processWebhook`.
          rateLimitService.markProcessed(messageId)
        }
        return
      }
      // fall_through — capture the verdict so the unknown handler can pick
      // a state-aware variant downstream, then drop into parseMessage with
      // the recursion guard set.
      if (
        outcome.classification.category === 'out_of_scope' ||
        outcome.classification.category === 'gibberish'
      ) {
        smartFallThroughCategory = outcome.classification.category
      }
      if (outcome.kind === 'fall_through' && outcome.oosRedirect) {
        smartFallThroughOosRedirect = outcome.oosRedirect
      }
    }

    // ── Parse command ──────────────────────────────────────────────────
    const command = await parseMessage(text, { messageId, phoneNumber: from }, context, {
      skipSmart: smartEnabled,
    })
    logger.info('Command parsed: %o', command)

    // Thread the SMART fall-through verdict into the unknown branch so
    // the unknown handler can pick a state-aware variant. We only set
    // these when the parser ALSO returned unknown — if parseMessage
    // recovered a real intent (e.g. SMART said OOS but regex caught
    // a simple "balance"), there's nothing to clarify.
    if (command.command === 'unknown') {
      if (smartFallThroughCategory) command.smartCategory = smartFallThroughCategory
      if (smartFallThroughOosRedirect) command.smartOosRedirect = smartFallThroughOosRedirect
    }

    // ── Context append + language detection + persistence ─────────────
    // Shared with SMART execute branch (see appendContextAndResolveLang).
    // `cachedUserLang` is set when the SMART branch already fetched the
    // user's stored preference; passing it avoids a redundant round-trip.
    const lang = await appendContextAndResolveLang(from, text, command, cachedUserLang)

    // Log LLM status for observability
    if (command.llmStatus) {
      logger.info('LLM status: %s', command.llmStatus)
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

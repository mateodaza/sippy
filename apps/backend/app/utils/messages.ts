/**
 * Message Templates — Trilingual Catalog (EN/ES/PT)
 *
 * All user-facing strings consolidated here.
 * Friendly and natural tone — like a friend on WhatsApp, not a support bot.
 */

export type Lang = 'en' | 'es' | 'pt'

import { DAILY_LIMIT_VERIFIED } from '#services/cdp_wallet.service'
import type { AmountErrorCode } from '#types/index'
import type { Dialect } from '#utils/dialect'

const RECEIPT_BASE_URL = process.env.RECEIPT_BASE_URL || 'https://www.sippy.lat/receipt/'
const FUND_URL = process.env.FUND_URL || 'https://fund.sippy.lat'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.sippy.lat'

// ============================================================================
// Utility functions (not user-facing — no lang needed)
// ============================================================================

const PHONE_TO_NAME_MAP: Record<string, string> = {}

function getDisplayName(phoneNumber: string): string {
  if (PHONE_TO_NAME_MAP[phoneNumber]) {
    return PHONE_TO_NAME_MAP[phoneNumber]
  }
  if (phoneNumber.length > 4) {
    return `***${phoneNumber.slice(-4)}`
  }
  return phoneNumber
}

export function formatCurrencyUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

const CURRENCY_THOUSANDS_SEP: Record<string, string> = {
  // South America
  COP: ',', // Colombia: 1,000
  MXN: ',', // Mexico: 1,000
  ARS: '.', // Argentina: 1.000
  BRL: '.', // Brazil: 1.000
  PEN: ',', // Peru: 1,000
  CLP: '.', // Chile: 1.000
  UYU: '.', // Uruguay: 1.000
  PYG: '.', // Paraguay: 1.000
  BOB: ',', // Bolivia: 1,000
  VES: ',', // Venezuela: 1,000
  // Central America
  CRC: '.', // Costa Rica: 1.000
  GTQ: ',', // Guatemala: 1,000
  HNL: ',', // Honduras: 1,000
  NIO: ',', // Nicaragua: 1,000
  // Caribbean
  DOP: ',', // Dominican Republic: 1,000
  CUP: ',', // Cuba: 1,000
  HTG: ',', // Haiti: 1,000
  JMD: ',', // Jamaica: 1,000
  TTD: ',', // Trinidad & Tobago: 1,000
  BBD: ',', // Barbados: 1,000
  // Other
  GYD: ',', // Guyana: 1,000
  SRD: ',', // Suriname: 1,000
  BZD: ',', // Belize: 1,000
  AWG: ',', // Aruba: 1,000
  ANG: ',', // Curaçao: 1,000
  XCD: ',', // EC$ islands: 1,000
}

function formatIntegerWithSep(n: number, sep: string): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

export function formatDualAmount(
  usd: number,
  rate: number | null,
  currency: string | null
): string {
  const usdFormatted = formatCurrencyUSD(usd)
  if (rate === null || currency === null) {
    return usdFormatted
  }
  const localAmount = Math.round(usd * rate)
  const sep = CURRENCY_THOUSANDS_SEP[currency] ?? ','
  const localFormatted = formatIntegerWithSep(localAmount, sep)
  return `${usdFormatted} (~${localFormatted} ${currency})`
}

export function maskAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
}

export function shortHash(hash: string): string {
  if (hash.length < 13) return hash
  return `${hash.substring(0, 10)}...${hash.substring(hash.length - 3)}`
}

export function formatDateUTC(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
}

// ============================================================================
// Message catalog
// ============================================================================

// --- Help ---

export function formatHelpMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Here's what I can help with:\n\n` +
      `💸 *Send money* — just tell me who and how much\n\n` +
      `💰 *Check your balance* — ask me anytime\n\n` +
      `📋 *See your transactions* — ask for your history\n\n` +
      `📇 *Contacts* — save, delete, or list contacts (e.g. "save mom +573...")\n\n` +
      `📲 *Get your pay code* — say "my qr" or "pay qr"\n\n` +
      `👋 *Invite a friend* — give me their number\n\n` +
      `📊 *Dashboard / web app* — see balance, activity, actions (say "dashboard")\n\n` +
      `⚙️ *Change settings or limits* — ask for settings\n\n` +
      `🌐 *Switch language* — just tell me which one\n\n` +
      `Add funds: ${FUND_URL}\n\n` +
      `🍕 Pizza Day Cartagena 2026: ${FRONTEND_URL}/pizza-day?lang=en`,
    es: () =>
      `Esto es lo que puedo hacer:\n\n` +
      `💸 *Enviar dinero* — dime a quien y cuanto\n\n` +
      `💰 *Ver tu saldo* — preguntame cuando quieras\n\n` +
      `📋 *Ver tus transacciones* — pideme tu historial\n\n` +
      `📇 *Contactos* — guardar, borrar o ver contactos (ej. "guardar mamá +573...")\n\n` +
      `📲 *Tu codigo de pago* — di "mi qr" o "mi codigo de pago"\n\n` +
      `👋 *Invitar a un amigo* — dame su numero\n\n` +
      `📊 *Dashboard / panel web* — saldo, actividad y acciones (di "dashboard")\n\n` +
      `⚙️ *Cambiar ajustes o limites* — pideme los ajustes\n\n` +
      `🌐 *Cambiar idioma* — solo dime cual\n\n` +
      `Agregar fondos: ${FUND_URL}\n\n` +
      `🍕 Pizza Day Cartagena 2026: ${FRONTEND_URL}/pizza-day`,
    pt: () =>
      `Aqui esta o que posso fazer:\n\n` +
      `💸 *Enviar dinheiro* — me diz pra quem e quanto\n\n` +
      `💰 *Ver seu saldo* — me pergunta quando quiser\n\n` +
      `📋 *Ver suas transacoes* — pede seu historico\n\n` +
      `📇 *Contatos* — salvar, apagar ou ver contatos (ex. "salvar mãe +5511...")\n\n` +
      `📲 *Seu codigo de pagamento* — diz "meu qr" ou "meu codigo de pagamento"\n\n` +
      `👋 *Convidar um amigo* — me da o numero\n\n` +
      `📊 *Dashboard / painel web* — saldo, atividade e acoes (diz "dashboard")\n\n` +
      `⚙️ *Mudar ajustes ou limites* — pede os ajustes\n\n` +
      `🌐 *Mudar idioma* — so me diz qual\n\n` +
      `Adicionar fundos: ${FUND_URL}\n\n` +
      `🍕 Pizza Day Cartagena 2026: ${FRONTEND_URL}/pizza-day`,
  }
  return m[lang]()
}

export function formatHelpNewUser(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Welcome to Sippy! Someone might have invited you, or maybe you're just curious.\n\n` +
      `Sippy lets you send dollars to any phone number via WhatsApp. No app, no fees, instant.\n\n` +
      `To get started, set up your wallet (takes 60 seconds):\n${setupUrl}\n\n` +
      `Once you're in, just send me a message and we'll get going.`,
    es: () =>
      `Bienvenido a Sippy! Puede que alguien te haya invitado, o que tengas curiosidad.\n\n` +
      `Sippy te permite enviar dolares a cualquier numero por WhatsApp. Sin app, sin comisiones, al instante.\n\n` +
      `Para empezar, configura tu billetera (toma 60 segundos):\n${setupUrl}\n\n` +
      `Cuando estes listo, mandame un mensaje y arrancamos.`,
    pt: () =>
      `Bem-vindo ao Sippy! Alguem pode ter te convidado, ou talvez voce esteja curioso.\n\n` +
      `Sippy te permite enviar dolares para qualquer numero pelo WhatsApp. Sem app, sem taxas, instantaneo.\n\n` +
      `Para comecar, configure sua carteira (leva 60 segundos):\n${setupUrl}\n\n` +
      `Quando estiver pronto, me manda uma mensagem e a gente comeca.`,
  }
  return m[lang]()
}

export function formatHelpIncomplete(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `You're almost there. Finish setting up your wallet to start sending:\n${setupUrl}`,
    es: () => `Ya casi. Termina de configurar tu billetera para comenzar a enviar:\n${setupUrl}`,
    pt: () => `Quase la. Termine de configurar sua carteira para comecar a enviar:\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatNudgeSetup(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `You'll need a wallet first. Set it up here (takes 60 seconds):\n${setupUrl}`,
    es: () => `Primero necesitas una billetera. Configurala aqui (toma 60 segundos):\n${setupUrl}`,
    pt: () =>
      `Voce precisa de uma carteira primeiro. Configure aqui (leva 60 segundos):\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatNudgeFinishSetup(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `You started setting up but didn't finish. Complete your setup here:\n${setupUrl}`,
    es: () =>
      `Empezaste a configurar pero no terminaste. Completa tu configuracion aqui:\n${setupUrl}`,
    pt: () =>
      `Voce comecou a configurar mas nao terminou. Complete sua configuracao aqui:\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatGreetingNewUser(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Hey! I'm Sippy. I help you send dollars to anyone using just their phone number.\n\n` +
      `No app to download, no fees, and transfers arrive in seconds.\n\n` +
      `Set up your wallet to get started (60 seconds):\n${setupUrl}`,
    es: () =>
      `Hola! Soy Sippy. Te ayudo a enviar dolares a cualquier persona usando solo su numero de telefono.\n\n` +
      `No necesitas descargar nada, sin comisiones, y las transferencias llegan en segundos.\n\n` +
      `Configura tu billetera para comenzar (60 segundos):\n${setupUrl}`,
    pt: () =>
      `Oi! Sou o Sippy. Te ajudo a enviar dolares para qualquer pessoa usando so o numero de telefone.\n\n` +
      `Sem app pra baixar, sem taxas, e as transferencias chegam em segundos.\n\n` +
      `Configure sua carteira para comecar (60 segundos):\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatGreetingIncomplete(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Hey! You're almost set up. Finish here and you'll be sending in no time:\n${setupUrl}`,
    es: () => `Hola! Ya casi estas listo. Termina aqui y podras enviar en un momento:\n${setupUrl}`,
    pt: () => `Oi! Voce esta quase pronto. Termine aqui e vai poder enviar rapidinho:\n${setupUrl}`,
  }
  return m[lang]()
}

// --- Event QR welcomes (bracket-token handler) ---

/**
 * Sent when a not-yet-onboarded phone scans an event QR. The /setup URL
 * carries the event slug + source tag so the web flow can link them to
 * the event on completion (PR #19's linkEvent handles those URL params).
 */
export function formatEventWelcomeNewUser(
  phoneNumber: string,
  eventName: string,
  eventSlug: string,
  sourceTag: string | null,
  lang: Lang = 'en'
): string {
  const params = new URLSearchParams({ phone: phoneNumber, event: eventSlug })
  if (sourceTag) params.set('source', sourceTag)
  const setupUrl = `${FRONTEND_URL}/setup?${params.toString()}`
  const m = {
    en: () =>
      `Welcome to Sippy at ${eventName}!\n\n` +
      `Set up your wallet to get started (60 seconds):\n${setupUrl}\n\n` +
      `Once you're in, send me a message and we'll go.`,
    es: () =>
      `Bienvenido a Sippy en ${eventName}!\n\n` +
      `Configura tu billetera para empezar (60 segundos):\n${setupUrl}\n\n` +
      `Cuando termines, mandame un mensaje y arrancamos.`,
    pt: () =>
      `Bem-vindo ao Sippy no ${eventName}!\n\n` +
      `Configure sua carteira para comecar (60 segundos):\n${setupUrl}\n\n` +
      `Quando terminar, me manda uma mensagem e a gente comeca.`,
  }
  return m[lang]()
}

/**
 * Sent when a scanned QR is revoked or its event is no longer active.
 *
 * Without this, attendees who scan a dead QR get silent fall-through to the
 * LLM with their bracket token stripped — they see a generic "no entendi"
 * reply and have no idea why. On event day that becomes repeat-scan churn
 * at the door.
 */
export function formatQrInactiveMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `That QR code isn't active anymore. Ask an organizer for a current one.`,
    es: () => `Este codigo QR ya no esta activo. Pidele uno nuevo al organizador.`,
    pt: () => `Este codigo QR nao esta mais ativo. Peca um novo ao organizador.`,
  }
  return m[lang]()
}

/**
 * Sent when someone scans a pay-QR — asks the payer for the amount. The
 * friendly display name (`qr_links.display_name`, set by the QR owner at
 * issuance) is the social signal; no "merchant" framing because pay-QRs
 * are universal (any user can mint one, vendors put a business name and
 * individuals put their own).
 */
export function formatPayAskForAmount(displayName: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `How much do you want to pay ${displayName}?`,
    es: () => `Cuanto le pagas a ${displayName}?`,
    pt: () => `Quanto voce paga a ${displayName}?`,
  }
  return m[lang]()
}

/**
 * Pay-QR confirmation prompt. Always shown (no below-threshold silent
 * execute) so the payer can't accidentally double-pay — the pay-QR scan
 * gesture is a "real money to a real person/business" act and deserves
 * an explicit YES.
 *
 * displayName comes from `qr_links.display_name`; falls back to a masked
 * phone if somehow missing (we log a warning when that happens).
 */
export function formatPayConfirmationPrompt(
  amount: number,
  displayName: string,
  lang: Lang = 'en'
): string {
  const amt = formatCurrencyUSD(amount)
  const m = {
    en: () => `Confirm paying ${amt} USDC to ${displayName}? Reply YES to confirm.`,
    es: () => `Confirmas pagar ${amt} USDC a ${displayName}? Responde SI para confirmar.`,
    pt: () =>
      `Confirmar pagamento de ${amt} USDC para ${displayName}? Responda SIM para confirmar.`,
  }
  return m[lang]()
}

/**
 * Sent when the QR-lookup DB call throws (transient outage, pool
 * exhaustion). Distinct from `formatQrInactiveMessage` because the QR
 * isn't necessarily dead — try again is the right ask.
 */
export function formatQrLookupTransientErrorMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `We couldn't read that QR code right now. Try again in a moment.`,
    es: () => `No pudimos leer ese codigo QR ahora. Intenta de nuevo en un momento.`,
    pt: () => `Nao conseguimos ler esse codigo QR agora. Tente novamente em um momento.`,
  }
  return m[lang]()
}

/**
 * Surface the user's pay-QR share URL when they ask "how do I get paid?"
 * / "mi codigo de pago" / "pay qr" etc.
 *
 * The URL `/wallet/pay-qr?phone=<X>` is treated by the web app as a
 * SHARE LINK — anyone (owner, payer, authenticated or not) who opens it
 * gets bounced to WhatsApp with a send-intent prefill. It is NOT a
 * dashboard view. Don't suggest the owner click it to "see" or "print"
 * their QR — that would just open WhatsApp to pay themselves.
 *
 * Owner dashboard (view / mint / print / edit display name) lives at
 * `/wallet` (the unified hub) — surfaced as a secondary URL below so
 * the owner can find it when they need to print.
 */
export function formatPayQrLinkMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const params = new URLSearchParams({ phone: phoneNumber })
  const shareUrl = `${FRONTEND_URL}/wallet/pay-qr?${params.toString()}`
  const dashboardUrl = `${FRONTEND_URL}/wallet?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Your pay link — share this with anyone who wants to pay you:\n${shareUrl}\n\n` +
      `Whoever opens it lands in WhatsApp ready to send you USDC.\n\n` +
      `To view or print the QR, open your dashboard:\n${dashboardUrl}`,
    es: () =>
      `Tu link de pago — compártelo con quien te quiera pagar:\n${shareUrl}\n\n` +
      `Quien lo abra cae en WhatsApp listo para enviarte USDC.\n\n` +
      `Para ver o imprimir el QR, abre tu dashboard:\n${dashboardUrl}`,
    pt: () =>
      `Seu link de pagamento — compartilhe com quem quer te pagar:\n${shareUrl}\n\n` +
      `Quem abrir cai no WhatsApp pronto para te enviar USDC.\n\n` +
      `Para ver ou imprimir o QR, abra seu painel:\n${dashboardUrl}`,
  }
  return m[lang]()
}

/**
 * Sent when a user scans their own pay-QR. Surfaces the no-op directly
 * instead of dropping into an awkward "do you want to pay yourself?" flow.
 */
export function formatSelfPayMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `That's your own pay code. Share it so someone else can pay you.`,
    es: () => `Ese es tu propio codigo de pago. Compartelo para que te paguen.`,
    pt: () => `Esse e o seu proprio codigo de pagamento. Compartilhe para receber.`,
  }
  return m[lang]()
}

/**
 * Sent when an already-onboarded phone scans an event QR. linkUserToEvent
 * has already been called with step='returning' by the time this fires —
 * the message is just the user-facing acknowledgement.
 */
export function formatEventWelcomeReturning(
  eventName: string,
  _sourceTag: string | null,
  lang: Lang = 'en'
): string {
  const m = {
    en: () =>
      `Welcome back to ${eventName}! You're checked in.\n\n` +
      `Type *balance* to see your wallet, or *help* for what I can do.`,
    es: () =>
      `Bienvenido de vuelta a ${eventName}! Estas registrado.\n\n` +
      `Escribe *saldo* para ver tu billetera, o *ayuda* para ver que puedo hacer.`,
    pt: () =>
      `Bem-vindo de volta ao ${eventName}! Voce esta registrado.\n\n` +
      `Digite *saldo* para ver sua carteira, ou *ajuda* para ver o que posso fazer.`,
  }
  return m[lang]()
}

/**
 * Sent to a recipient when an event operator pays them USDC in exchange for
 * cash at the venue. Fired AFTER the on-chain send is confirmed — never on
 * a still-pending submission, so the operator can confidently hand over
 * cash before the user gets the ping (the message is the receipt, not the
 * promise). Amount is already in USDC; we format to 2 decimals like the rest
 * of the catalog.
 */
export function formatOperatorPaymentReceived(
  amountUsdc: number,
  eventName: string,
  lang: Lang = 'en'
): string {
  const amount = formatCurrencyUSD(amountUsdc)
  const m = {
    en: () =>
      `You received ${amount} USDC at ${eventName}.\n\n` + `Type *balance* to see your wallet.`,
    es: () =>
      `Recibiste ${amount} USDC en ${eventName}.\n\n` + `Escribe *saldo* para ver tu billetera.`,
    pt: () =>
      `Voce recebeu ${amount} USDC em ${eventName}.\n\n` + `Digite *saldo* para ver sua carteira.`,
  }
  return m[lang]()
}

/**
 * Sent to a user right after their first successful payment at an event
 * that has a POAP claim link configured. One-shot per user-event pair —
 * gated by `user_event_links.poap_invite_sent_at`.
 */
export function formatPoapClaimInvite(
  params: { poapClaimUrl: string; eventName: string },
  lang: Lang = 'en'
): string {
  const m = {
    en: () =>
      `🎉 Thanks for paying at ${params.eventName}! Claim your POAP here:\n` +
      `${params.poapClaimUrl}\n\n` +
      `You can use your Sippy wallet or any other wallet you have.`,
    es: () =>
      `🎉 Gracias por pagar en ${params.eventName}! Reclama tu POAP aqui:\n` +
      `${params.poapClaimUrl}\n\n` +
      `Puedes usar tu billetera Sippy o cualquier otra que tengas.`,
    pt: () =>
      `🎉 Obrigado por pagar em ${params.eventName}! Resgate seu POAP aqui:\n` +
      `${params.poapClaimUrl}\n\n` +
      `Voce pode usar sua carteira Sippy ou qualquer outra que tenha.`,
  }
  return m[lang]()
}

// --- About ---

export function formatAboutMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `I'm Sippy, your WhatsApp wallet. You send money using phone numbers, that's it.\n\n` +
      `$1 is always $1 — your balance stays in digital dollars, always stable.\n` +
      `Transfers happen in seconds and we cover the fees.\n` +
      `Works in English, Spanish, and Portuguese.\n\n` +
      `Just tell me what you need!`,
    es: () =>
      `Soy Sippy, tu billetera de WhatsApp. Envias dinero usando numeros de telefono y ya.\n\n` +
      `$1 siempre es $1 — tu saldo esta en dolares digitales, siempre estables.\n` +
      `Las transferencias llegan en segundos y nosotros cubrimos las comisiones.\n` +
      `Funciono en espanol, ingles y portugues.\n\n` +
      `Solo dime que necesitas!`,
    pt: () =>
      `Sou o Sippy, sua carteira no WhatsApp. Voce envia dinheiro usando numeros de telefone, so isso.\n\n` +
      `$1 e sempre $1 — seu saldo fica em dolares digitais, sempre estaveis.\n` +
      `Transferencias chegam em segundos e nos cobrimos as taxas.\n` +
      `Funciono em portugues, espanhol e ingles.\n\n` +
      `So me diz o que precisa!`,
  }
  return m[lang]()
}

// --- Balance ---

export function formatBalanceMessage(
  params: {
    balance: number
    wallet: string
    ethBalance?: string
    phoneNumber?: string
    localRate?: number | null
    localCurrency?: string | null
    // True when the routing came from an address-specific phrase
    // ("mi address", "cuál es mi billetera", "wallet address", …). The
    // user named the wallet itself, not the balance number, so render
    // the FULL public address instead of the default masked form.
    addressQuery?: boolean
  },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(
    params.balance,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const addr = params.addressQuery ? params.wallet : maskAddress(params.wallet)

  // Dashboard link: phone-scoped /wallet URL. Surfaces the web hub at
  // the most-engaged moment (user just asked about their money), without
  // a full second message. Suppressed when phoneNumber is missing — the
  // /wallet route requires a phone to deep-link cleanly.
  const dashboardUrl = params.phoneNumber
    ? `${FRONTEND_URL}/wallet?phone=${encodeURIComponent(params.phoneNumber)}`
    : null

  const m = {
    en: () => {
      let msg = `Balance\n\nUSD: ${amt}\nWallet: ${addr}`
      if (params.ethBalance)
        msg = `Balance\n\nTransfer credit: ${params.ethBalance} ETH\nUSD: ${amt}\nWallet: ${addr}`
      msg += `\n\nAdd funds: ${FUND_URL}`
      if (dashboardUrl) msg += `\nFull view: ${dashboardUrl}`
      return msg
    },
    es: () => {
      let msg = `Saldo\n\nUSD: ${amt}\nBilletera: ${addr}`
      if (params.ethBalance)
        msg = `Saldo\n\nCredito de transferencia: ${params.ethBalance} ETH\nUSD: ${amt}\nBilletera: ${addr}`
      msg += `\n\nAgregar fondos: ${FUND_URL}`
      if (dashboardUrl) msg += `\nVer todo: ${dashboardUrl}`
      return msg
    },
    pt: () => {
      let msg = `Saldo\n\nUSD: ${amt}\nCarteira: ${addr}`
      if (params.ethBalance)
        msg = `Saldo\n\nCredito de transferencia: ${params.ethBalance} ETH\nUSD: ${amt}\nCarteira: ${addr}`
      msg += `\n\nAdicionar fundos: ${FUND_URL}`
      if (dashboardUrl) msg += `\nVer tudo: ${dashboardUrl}`
      return msg
    },
  }
  return m[lang]()
}

// --- Send processing ---

export function formatSendProcessingMessage(
  params: {
    amount: number
    toPhone: string
    localRate?: number | null
    localCurrency?: string | null
  },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(
    params.amount,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const to = getDisplayName(params.toPhone)
  const m = {
    en: () => `Sending ${amt} to ${to}...\n\nUsually instant, may take up to 30 seconds.`,
    es: () =>
      `Enviando ${amt} a ${to}...\n\nUsualmente instantaneo, puede tomar hasta 30 segundos.`,
    pt: () =>
      `Enviando ${amt} para ${to}...\n\nUsualmente instantaneo, pode levar ate 30 segundos.`,
  }
  return m[lang]()
}

// --- Send success (sender) ---

export function formatSendSuccessMessage(
  params: {
    amount: number
    toPhone: string
    txHash: string
    gasCovered?: boolean
    localRate?: number | null
    localCurrency?: string | null
  },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(
    params.amount,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const to = getDisplayName(params.toPhone)
  const tx = shortHash(params.txHash)
  const receiptUrl = RECEIPT_BASE_URL + params.txHash

  const m = {
    en: () => {
      let msg = `Transfer completed.\n\nAmount: ${amt}\nTo: ${to}\nTx: ${tx}`
      if (params.gasCovered && process.env.DEMO_SHOW_REFUEL === 'true')
        msg += `\nGas: Covered by Sippy`
      return msg + `\n\nReceipt: ${receiptUrl}`
    },
    es: () => {
      let msg = `Transferencia completada.\n\nMonto: ${amt}\nPara: ${to}\nTx: ${tx}`
      if (params.gasCovered && process.env.DEMO_SHOW_REFUEL === 'true')
        msg += `\nGas: Cubierto por Sippy`
      return msg + `\n\nRecibo: ${receiptUrl}`
    },
    pt: () => {
      let msg = `Transferencia concluida.\n\nValor: ${amt}\nPara: ${to}\nTx: ${tx}`
      if (params.gasCovered && process.env.DEMO_SHOW_REFUEL === 'true')
        msg += `\nGas: Coberto pelo Sippy`
      return msg + `\n\nRecibo: ${receiptUrl}`
    },
  }
  return m[lang]()
}

// --- Send recipient notification ---

export function formatSendRecipientMessage(
  params: {
    amount: number
    fromPhone: string
    txHash: string
    localRate?: number | null
    localCurrency?: string | null
  },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(
    params.amount,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const from = getDisplayName(params.fromPhone)
  const receiptUrl = RECEIPT_BASE_URL + params.txHash
  const m = {
    en: () => `Payment received.\n\nYou received ${amt} from ${from}.\n\nReceipt: ${receiptUrl}`,
    es: () => `Pago recibido.\n\nRecibiste ${amt} de ${from}.\n\nRecibo: ${receiptUrl}`,
    pt: () => `Pagamento recebido.\n\nVoce recebeu ${amt} de ${from}.\n\nRecibo: ${receiptUrl}`,
  }
  return m[lang]()
}

// --- Fund flow notifications ---

export function formatFundETHReceivedMessage(
  params: { amount: string; txHash: string },
  lang: Lang = 'en'
): string {
  const receiptUrl = RECEIPT_BASE_URL + params.txHash
  const m = {
    en: () =>
      `Gas credit received.\n\nYou received ${params.amount} ETH for transactions.\nYou can continue making transfers.\n\nReceipt: ${receiptUrl}`,
    es: () =>
      `Credito de gas recibido.\n\nRecibiste ${params.amount} ETH para transacciones.\nPuedes seguir haciendo transferencias.\n\nRecibo: ${receiptUrl}`,
    pt: () =>
      `Credito de gas recebido.\n\nVoce recebeu ${params.amount} ETH para transacoes.\nVoce pode continuar fazendo transferencias.\n\nRecibo: ${receiptUrl}`,
  }
  return m[lang]()
}

export function formatFundUSDReceivedMessage(
  params: { amount: string; txHash: string },
  lang: Lang = 'en'
): string {
  const receiptUrl = RECEIPT_BASE_URL + params.txHash
  const m = {
    en: () => `USD received.\n\nYou received $${params.amount}.\n\nReceipt: ${receiptUrl}`,
    es: () => `USD recibidos.\n\nRecibiste $${params.amount}.\n\nRecibo: ${receiptUrl}`,
    pt: () => `USD recebidos.\n\nVoce recebeu $${params.amount}.\n\nRecibo: ${receiptUrl}`,
  }
  return m[lang]()
}

// --- Error states ---

export function formatInsufficientBalanceMessage(
  params: {
    balance: number
    needed: number
    localRate?: number | null
    localCurrency?: string | null
  },
  lang: Lang = 'en'
): string {
  const bal = formatDualAmount(
    params.balance,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const need = formatDualAmount(
    params.needed,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const m = {
    en: () =>
      `You're short for this one.\n\nBalance: ${bal}\nNeeded: ${need}\n\nAdd funds here: ${FUND_URL}`,
    es: () =>
      `Te falta para este envio.\n\nSaldo: ${bal}\nNecesario: ${need}\n\nAgrega fondos aqui: ${FUND_URL}`,
    pt: () =>
      `Falta um pouco pra esse envio.\n\nSaldo: ${bal}\nNecessario: ${need}\n\nAdicione fundos aqui: ${FUND_URL}`,
  }
  return m[lang]()
}

export function formatNoWalletMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `You don't have a wallet yet. Want me to set one up? It takes 60 seconds.`,
    es: () => `Aun no tienes billetera. Quieres que te cree una? Toma 60 segundos.`,
    pt: () => `Voce ainda nao tem carteira. Quer que eu crie uma? Leva 60 segundos.`,
  }
  return m[lang]()
}

export function formatFundMessage(fundUrl: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Add funds to your wallet here:\n${fundUrl}`,
    es: () => `Agrega fondos a tu billetera aqui:\n${fundUrl}`,
    pt: () => `Adicione fundos a sua carteira aqui:\n${fundUrl}`,
  }
  return m[lang]()
}

export function formatOnrampMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const onrampUrl = `${FRONTEND_URL}/onramp?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `Add Colombian pesos (COP) to your wallet here:\n${onrampUrl}`,
    es: () => `Agrega pesos colombianos (COP) a tu billetera aqui:\n${onrampUrl}`,
    pt: () => `Adicione pesos colombianos (COP) a sua carteira aqui:\n${onrampUrl}`,
  }
  return m[lang]()
}

export function formatWithdrawMessage(
  phoneNumber: string,
  copRate: number | null,
  lang: Lang = 'en'
): string {
  const offrampUrl = `${FRONTEND_URL}/offramp?phone=${encodeURIComponent(phoneNumber)}`
  const rateInfo = copRate ? ` (1 USD = ${Math.round(copRate).toLocaleString('en-US')} COP)` : ''
  const m = {
    en: () =>
      `Convert USDC to Colombian pesos${rateInfo}. Minimum $50 USDC. To continue, visit:\n${offrampUrl}`,
    es: () =>
      `Convierte USDC a pesos colombianos${rateInfo}. Minimo $50 USDC. Para continuar, visita:\n${offrampUrl}`,
    pt: () =>
      `Converta USDC para pesos colombianos${rateInfo}. Minimo $50 USDC. Para continuar, acesse:\n${offrampUrl}`,
  }
  return m[lang]()
}

export function formatSessionExpiredMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `I need to reconnect you. Just send me any message and we'll pick up where we left off.`,
    es: () => `Necesito reconectarte. Mandame cualquier mensaje y seguimos donde quedamos.`,
    pt: () => `Preciso te reconectar. Me manda qualquer mensagem e continuamos de onde paramos.`,
  }
  return m[lang]()
}

export function formatRecipientNotFoundMessage(phone: string, lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `${phone} isn't on Sippy yet. We couldn't send them an invite right now, but if they join we'll let you know.`,
    es: () =>
      `${phone} aun no esta en Sippy. No pudimos enviarle una invitacion ahora, pero si se une te avisamos.`,
    pt: () =>
      `${phone} ainda nao esta no Sippy. Nao conseguimos enviar um convite agora, mas se entrar avisamos.`,
  }
  return m[lang]()
}

export function formatInvalidAmountMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Try with a number, like:\n\n"send 5 to +573001234567"`,
    es: () => `Intenta con un numero, tipo:\n\n"enviar 5 a +573001234567"`,
    pt: () => `Tenta com um numero, tipo:\n\n"enviar 5 para +573001234567"`,
  }
  return m[lang]()
}

export function formatErrorMessage(params: { reason: string }): string {
  return params.reason
}

// --- Welcome / Start ---

export function formatWelcomeMessage(
  params: { wallet: string; isNew: boolean },
  lang: Lang = 'en'
): string {
  const addr = maskAddress(params.wallet)

  if (params.isNew) {
    const m = {
      en: () =>
        `You're all set! Your wallet is ready:\n${addr}\n\n` +
        `Here's how to get going:\n` +
        `1. Add funds: ${FUND_URL}\n` +
        `2. Ask me for your balance anytime\n` +
        `3. Tell me who you want to send money to and how much\n\n` +
        `No fees. We cover them. Just tell me what you need.`,
      es: () =>
        `Listo! Tu billetera esta lista:\n${addr}\n\n` +
        `Asi empiezas:\n` +
        `1. Agrega fondos: ${FUND_URL}\n` +
        `2. Preguntame tu saldo cuando quieras\n` +
        `3. Dime a quien quieres enviar y cuanto\n\n` +
        `Sin comisiones. Nosotros las cubrimos. Solo dime que necesitas.`,
      pt: () =>
        `Pronto! Sua carteira esta pronta:\n${addr}\n\n` +
        `Como comecar:\n` +
        `1. Adicione fundos: ${FUND_URL}\n` +
        `2. Me pergunta seu saldo quando quiser\n` +
        `3. Me diz pra quem quer enviar e quanto\n\n` +
        `Sem taxas. Nos cobrimos. So me diz o que precisa.`,
    }
    return m[lang]()
  } else {
    const m = {
      en: () => `Welcome back! Your wallet: ${addr}\n\nJust tell me what you need.`,
      es: () => `De vuelta! Tu billetera: ${addr}\n\nSolo dime que necesitas.`,
      pt: () => `De volta! Sua carteira: ${addr}\n\nSo me diga o que precisa.`,
    }
    return m[lang]()
  }
}

// ============================================================================
// Inline strings absorbed from server.ts, send/start/balance commands
// ============================================================================

export function formatAskForAmount(recipient: string, lang: Lang = 'en'): string {
  const to = recipient.length > 4 ? `***${recipient.slice(-4)}` : recipient
  const m = {
    en: () => `How much do you want to send to ${to}?`,
    es: () => `Cuanto quieres enviar a ${to}?`,
    pt: () => `Quanto voce quer enviar para ${to}?`,
  }
  return m[lang]()
}

/**
 * Map of FX currency codes to the human word users typed. Used to echo
 * the amount back in the recipient prompt: when the user said "200 pesos"
 * we should ask "200 pesos a quien?", not "$200.00 a quien?" (which
 * looks like a USDC send and panicked a tester on 2026-05-17 even
 * though the conversion runs correctly at the next turn).
 *
 * `LOCAL` defaults to "pesos" because every market we serve that uses
 * the LOCAL sentinel (COP, MXN, ARS) calls the currency "pesos".
 */
const CURRENCY_WORD_BY_CODE: Record<string, string> = {
  LOCAL: 'pesos',
  BRL: 'reais',
  PEN: 'soles',
  HNL: 'lempiras',
  GTQ: 'quetzales',
  CRC: 'colones',
  VES: 'bolivares',
  PYG: 'guaranies',
}

export function formatAskForRecipient(
  amount: number,
  lang: Lang = 'en',
  localCurrency?: string
): string {
  // When the partial carries a local-currency signal, echo the user's
  // original phrasing ("200 pesos a quien?") so it doesn't look like
  // Sippy is about to send USDC face value. FX runs on the completing
  // turn regardless; this is purely a display fix.
  const word = localCurrency ? CURRENCY_WORD_BY_CODE[localCurrency] : undefined
  const amt = word ? `${amount} ${word}` : formatCurrencyUSD(amount)
  const m = {
    en: () => `${amt} to whom? Send me the phone number.`,
    es: () => `${amt} a quien? Mandame el numero de telefono.`,
    pt: () => `${amt} pra quem? Me manda o numero de telefone.`,
  }
  return m[lang]()
}

export function formatInvalidSendFormat(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `I didn't catch that. Just tell me who you want to send to and how much — like "send 5 to +573001234567".`,
    es: () =>
      `No te entendi. Dime a quien quieres enviar y cuanto — tipo "enviar 5 a +573001234567".`,
    pt: () =>
      `Nao peguei. Me diz pra quem quer enviar e quanto — tipo "enviar 5 para +573001234567".`,
  }
  return m[lang]()
}

export function formatHistoryMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const url = `https://www.sippy.lat/profile/${phoneNumber}`
  const m = {
    en: () => `Transaction history\n\nView your activity at:\n${url}`,
    es: () => `Historial de transacciones\n\nVer tu actividad en:\n${url}`,
    pt: () => `Historico de transacoes\n\nVeja sua atividade em:\n${url}`,
  }
  return m[lang]()
}

/**
 * Sippy Quest — referral-code reply. Returns the user's unique invite
 * code embedded in a share link friends can tap to land in WhatsApp
 * with the code pre-filled as a [REF-XXXXXX] bracket token.
 *
 * Share URL points at `sippy.lat/r/<code>`, NOT raw wa.me. Background
 * (2026-05-18 field bug): WhatsApp suppresses wa.me links that target
 * the same bot sending the message — the user's chat showed
 * "Comparte tu link: [link removed]" because Meta's anti-spam guard
 * stripped the deeplink. Bouncing through our own domain (apps/web
 * route `/r/[code]/route.ts` does the 302 to wa.me) sidesteps that
 * filter and ALSO gives us a clean brand URL that renders correctly
 * when shared on SMS, Twitter, copy-paste, etc.
 *
 * Drift warning: if the redirect route changes its URL shape, update
 * here too — share-link tests pin the shape.
 */
export function formatReferralCodeMessage(
  args: { code: string; maxEntries: number; leaderboardUrl?: string },
  lang: Lang = 'en'
): string {
  const shareUrl = `${FRONTEND_URL}/r/${args.code}`
  const boardLine = args.leaderboardUrl
    ? {
        en: `\n\nLive leaderboard:\n${args.leaderboardUrl}`,
        es: `\n\nMira el tablero en vivo:\n${args.leaderboardUrl}`,
        pt: `\n\nVeja o ranking ao vivo:\n${args.leaderboardUrl}`,
      }[lang]
    : ''
  const m = {
    en: () =>
      `Your Quest invite code: *${args.code}*\n\n` +
      `Each friend who joins with your code = 1 draw entry (max ${args.maxEntries}).\n\n` +
      `Share your link:\n${shareUrl}${boardLine}`,
    es: () =>
      `Tu codigo de Quest: *${args.code}*\n\n` +
      `Cada amigo que se una con tu codigo = 1 entrada al sorteo (max ${args.maxEntries}).\n\n` +
      `Comparte tu link:\n${shareUrl}${boardLine}`,
    pt: () =>
      `Seu codigo do Quest: *${args.code}*\n\n` +
      `Cada amigo que entrar com seu codigo = 1 entrada no sorteio (max ${args.maxEntries}).\n\n` +
      `Compartilhe seu link:\n${shareUrl}${boardLine}`,
  }
  return m[lang]()
}

/**
 * Sippy Quest — status reply. Shows the user's current entries, what
 * makes up that score, and (when they have any) their rank. Designed to
 * land in WhatsApp at the size of one bubble, so the breakdown line is
 * short and the call-to-action sits at the bottom.
 *
 * Rank rendering rules:
 *   - entries = 0 → no rank shown ("aún no tienes entradas")
 *   - entries > 0 → "#N de M" — gives them context for how competitive
 *     the leaderboard is without exposing names
 *
 * The "share your link" line embeds the same `sippy.lat/r/<code>` URL
 * shape as the `mi codigo` reply. Drift between the two would split
 * the share funnel — keep both pointing at the redirect route.
 *
 * `shareUrl` is built by the caller (not derived here) because the
 * caller already had to `ensureReferralCode` to fetch the code, and
 * passing the resolved code keeps this function purely formatting.
 * When a user has 0 entries we still show the share link — that's the
 * primary action that converts zero → first entry.
 */
export function formatQuestStatusMessage(
  args: {
    entries: number
    cap: number
    activity: 0 | 1
    referrals: number
    rank: number | null
    totalRanked: number
    code: string
    leaderboardUrl?: string
  },
  lang: Lang = 'en'
): string {
  const shareUrl = `${FRONTEND_URL}/r/${args.code}`
  const rankLine =
    args.rank !== null
      ? {
          en: `Rank: #${args.rank} of ${args.totalRanked}`,
          es: `Posicion: #${args.rank} de ${args.totalRanked}`,
          pt: `Posicao: #${args.rank} de ${args.totalRanked}`,
        }[lang]
      : null
  const boardLine = args.leaderboardUrl
    ? {
        en: `Live leaderboard:\n${args.leaderboardUrl}`,
        es: `Mira el tablero en vivo:\n${args.leaderboardUrl}`,
        pt: `Veja o ranking ao vivo:\n${args.leaderboardUrl}`,
      }[lang]
    : null
  const m = {
    en: () => {
      const lines = [
        `*Your Quest: ${args.entries}/${args.cap} entries*`,
        rankLine,
        '',
        `- Attended: ${args.activity ? '1' : '0'}`,
        `- Friends joined: ${args.referrals}`,
        '',
        args.entries < args.cap
          ? `Invite more to climb. Share:\n${shareUrl}`
          : `Max entries reached. Good luck on the draw!`,
        boardLine ? '' : null,
        boardLine,
      ].filter((l): l is string => l !== null)
      return lines.join('\n')
    },
    es: () => {
      const lines = [
        `*Tu Quest: ${args.entries}/${args.cap} entradas*`,
        rankLine,
        '',
        `- Asistencia: ${args.activity ? '1' : '0'}`,
        `- Amigos unidos: ${args.referrals}`,
        '',
        args.entries < args.cap
          ? `Invita mas y sube. Comparte:\n${shareUrl}`
          : `Llegaste al maximo de entradas. Suerte en el sorteo!`,
        boardLine ? '' : null,
        boardLine,
      ].filter((l): l is string => l !== null)
      return lines.join('\n')
    },
    pt: () => {
      const lines = [
        `*Seu Quest: ${args.entries}/${args.cap} entradas*`,
        rankLine,
        '',
        `- Presenca: ${args.activity ? '1' : '0'}`,
        `- Amigos entraram: ${args.referrals}`,
        '',
        args.entries < args.cap
          ? `Convide mais e suba. Compartilhe:\n${shareUrl}`
          : `Atingiu o maximo de entradas. Boa sorte no sorteio!`,
        boardLine ? '' : null,
        boardLine,
      ].filter((l): l is string => l !== null)
      return lines.join('\n')
    },
  }
  return m[lang]()
}

/**
 * Dashboard deep-link reply. The `/wallet` page is the authenticated app
 * hub: balance, activity, send, settings link. Bot keyword `dashboard` /
 * `mi cuenta` / `meu painel` routes here. Also appended (as a one-liner)
 * to the balance reply so users who ask for their balance discover the
 * fuller view at the most-engaged moment.
 */
export function formatDashboardMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const url = `${FRONTEND_URL}/wallet?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `Your Sippy dashboard: balance, activity, send, pay QR, fund.\n${url}`,
    es: () => `Tu panel de Sippy: saldo, actividad, enviar, mi QR, recargar.\n${url}`,
    pt: () => `Seu painel Sippy: saldo, atividade, enviar, meu QR, recarregar.\n${url}`,
  }
  return m[lang]()
}

export function formatSettingsMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const settingsUrl = `${FRONTEND_URL}/settings?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Manage your Sippy settings:\n\n${settingsUrl}\n\n` +
      `You can:\n` +
      `- Change your daily spending limit\n` +
      `- Revoke Sippy's permission\n` +
      `- Export your wallet keys`,
    es: () =>
      `Administra tus ajustes de Sippy:\n\n${settingsUrl}\n\n` +
      `Puedes:\n` +
      `- Cambiar tu limite de gasto diario\n` +
      `- Revocar el permiso de Sippy\n` +
      `- Exportar las llaves de tu billetera`,
    pt: () =>
      `Gerencie seus ajustes do Sippy:\n\n${settingsUrl}\n\n` +
      `Voce pode:\n` +
      `- Alterar seu limite de gasto diario\n` +
      `- Revogar a permissao do Sippy\n` +
      `- Exportar as chaves da sua carteira`,
  }
  return m[lang]()
}

export function formatRateLimitedMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `I'm a bit busy right now. Try again in a moment — just tell me what you need.`,
    es: () => `Estoy un poco ocupado. Intenta de nuevo en un momento — solo dime que necesitas.`,
    pt: () => `Estou um pouco ocupado. Tenta de novo em um momento — so me diz o que precisa.`,
  }
  return m[lang]()
}

export function formatUnknownCommandMessage(
  _originalText: string,
  lang: Lang = 'en',
  dialect: Dialect = 'neutral'
): string {
  if (lang === 'es' && dialect !== 'neutral') {
    const d: Record<string, string> = {
      co: `Hmm, no te entendi. Puedes ver tu saldo, enviar plata, o decirme que necesitas.`,
      mx: `Hmm, no te entendi. Puedes ver tu saldo, enviar dinero, o decirme que necesitas.`,
      ar: `Hmm, no te entendi. Podes ver tu saldo, enviar plata, o decirme que necesitas.`,
      ve: `Hmm, no te entendi. Puedes ver tu saldo, enviar plata, o decirme que necesitas.`,
    }
    if (d[dialect]) return d[dialect]
  }
  const m = {
    en: () =>
      `Hmm, not sure what you mean. You can check your balance, send money, or just tell me what you need.`,
    es: () => `Hmm, no te entendi. Puedes ver tu saldo, enviar dinero, o decirme que necesitas.`,
    pt: () =>
      `Hmm, nao entendi. Voce pode ver seu saldo, enviar dinheiro, ou me dizer o que precisa.`,
  }
  return m[lang]()
}

export function formatTransactionBlockedMessage(reason: string, lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `This send is paused.\n\n${reason}\n\nYour funds are safe — these limits protect your account.`,
    es: () =>
      `Este envio quedo en pausa.\n\n${reason}\n\nTus fondos estan seguros — estos limites protegen tu cuenta.`,
    pt: () =>
      `Esse envio ficou em pausa.\n\n${reason}\n\nSeus fundos estao seguros — esses limites protegem sua conta.`,
  }
  return m[lang]()
}

export function formatTransferFailedMessage(errorMessage: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `The send didn't go through. Your balance wasn't affected.\n\n${errorMessage}`,
    es: () => `El envio no paso. Tu saldo no cambio.\n\n${errorMessage}`,
    pt: () => `O envio nao foi. Seu saldo nao mudou.\n\n${errorMessage}`,
  }
  return m[lang]()
}

export function formatSetupRequiredMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `Almost there! Finish your setup and you're good to send:\n${setupUrl}`,
    es: () => `Ya casi! Termina tu setup y listo para enviar:\n${setupUrl}`,
    pt: () => `Quase la! Termine seu setup e ja pode enviar:\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatDailyLimitExceededMessage(
  dailyLimit: number,
  phoneNumber: string,
  lang: Lang = 'en'
): string {
  const settingsUrl = `${FRONTEND_URL}/settings?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Amount exceeds your daily limit of $${dailyLimit}.\n\nYou can change your limit here:\n${settingsUrl}`,
    es: () =>
      `El monto excede tu limite diario de $${dailyLimit}.\n\nPuedes cambiar tu limite aqui:\n${settingsUrl}`,
    pt: () =>
      `O valor excede seu limite diario de $${dailyLimit}.\n\nVoce pode alterar seu limite aqui:\n${settingsUrl}`,
  }
  return m[lang]()
}

export function formatTieredDailyLimitExceededMessage(
  dailyLimit: number,
  _phoneNumber: string,
  lang: Lang = 'en',
  emailVerified: boolean
): string {
  if (emailVerified) {
    const m = {
      en: `You've reached your daily limit of $${dailyLimit}. Your limit resets tomorrow.`,
      es: `Llegaste a tu limite diario de $${dailyLimit}. Tu limite se renueva manana.`,
      pt: `Voce atingiu seu limite diario de $${dailyLimit}. Seu limite renova amanha.`,
    }
    return m[lang]
  } else {
    const m = {
      en: `You've reached your daily limit of $${dailyLimit}. Add a recovery email at sippy.lat/settings to increase it to $${DAILY_LIMIT_VERIFIED}/day.`,
      es: `Has alcanzado tu limite diario de $${dailyLimit}. Agrega un correo de recuperacion en sippy.lat/settings para aumentarlo a $${DAILY_LIMIT_VERIFIED}/dia.`,
      pt: `Voce atingiu seu limite diario de $${dailyLimit}. Adicione um email de recuperacao em sippy.lat/settings para aumenta-lo para $${DAILY_LIMIT_VERIFIED}/dia.`,
    }
    return m[lang]
  }
}

export function formatSpendingLimitInfo(
  remaining: string,
  resetInfo: string,
  lang: Lang = 'en'
): string {
  const m = {
    en: () => `Spending limit: $${remaining} remaining${resetInfo}`,
    es: () => `Limite de gasto: $${remaining} restante${resetInfo}`,
    pt: () => `Limite de gasto: $${remaining} restante${resetInfo}`,
  }
  return m[lang]()
}

export function formatSpendingLimitBalance(
  remaining: string,
  total: string,
  hoursUntilReset: number,
  lang: Lang = 'en'
): string {
  const resetStr =
    hoursUntilReset <= 24
      ? {
          en: ` (resets in ${hoursUntilReset}h)`,
          es: ` (se renueva en ${hoursUntilReset}h)`,
          pt: ` (renova em ${hoursUntilReset}h)`,
        }
      : { en: '', es: '', pt: '' }
  const m = {
    en: () => `Spending limit: $${remaining} of $${total}/day remaining${resetStr.en}`,
    es: () => `Limite de gasto: $${remaining} de $${total}/dia restante${resetStr.es}`,
    pt: () => `Limite de gasto: $${remaining} de $${total}/dia restante${resetStr.pt}`,
  }
  return m[lang]()
}

export function formatDailySecurityLimitBalance(
  remaining: string,
  total: string,
  lang: Lang = 'en'
): string {
  const m = {
    en: () => `Daily limit: $${remaining} remaining of $${total}`,
    es: () => `Limite diario: $${remaining} restante de $${total}`,
    pt: () => `Limite diario: $${remaining} restante de $${total}`,
  }
  return m[lang]()
}

export function formatCompleteSetupMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () => `Complete setup to enable sending:\n${setupUrl}`,
    es: () => `Completa la configuracion para habilitar envios:\n${setupUrl}`,
    pt: () => `Complete a configuracao para habilitar envios:\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatWalletNotFullySetupMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Your wallet is created but not fully set up.\n\nPlease complete the setup to enable sending:\n${setupUrl}`,
    es: () =>
      `Tu billetera esta creada pero no completamente configurada.\n\nCompleta la configuracion para habilitar envios:\n${setupUrl}`,
    pt: () =>
      `Sua carteira foi criada mas nao esta totalmente configurada.\n\nComplete a configuracao para habilitar envios:\n${setupUrl}`,
  }
  return m[lang]()
}

export function formatNewUserSetupMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `Welcome to Sippy.\n\n` +
      `To get started, set up your wallet (takes 60 seconds):\n\n` +
      `${setupUrl}\n\n` +
      `You will:\n` +
      `1. Verify your phone number\n` +
      `2. Set your spending limit\n` +
      `3. Start sending dollars via WhatsApp`,
    es: () =>
      `Bienvenido a Sippy.\n\n` +
      `Para comenzar, configura tu billetera (toma 60 segundos):\n\n` +
      `${setupUrl}\n\n` +
      `Vas a:\n` +
      `1. Verificar tu numero de telefono\n` +
      `2. Establecer tu limite de gasto\n` +
      `3. Comenzar a enviar dolares por WhatsApp`,
    pt: () =>
      `Bem-vindo ao Sippy.\n\n` +
      `Para comecar, configure sua carteira (leva 60 segundos):\n\n` +
      `${setupUrl}\n\n` +
      `Voce vai:\n` +
      `1. Verificar seu numero de telefone\n` +
      `2. Definir seu limite de gasto\n` +
      `3. Comecar a enviar dolares pelo WhatsApp`,
  }
  return m[lang]()
}

export function formatGenericErrorMessage(errorMessage: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `An error occurred.\n\n${errorMessage}`,
    es: () => `Ocurrio un error.\n\n${errorMessage}`,
    pt: () => `Ocorreu um erro.\n\n${errorMessage}`,
  }
  return m[lang]()
}

export function formatLowTransferBalanceMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Low transfer balance detected. We top you up daily automatically, so transfers will continue working.`,
    es: () =>
      `Saldo de transferencia bajo detectado. Te recargamos diariamente de forma automatica, asi que las transferencias seguiran funcionando.`,
    pt: () =>
      `Saldo de transferencia baixo detectado. Recarregamos diariamente de forma automatica, entao as transferencias continuarao funcionando.`,
  }
  return m[lang]()
}

export function formatBalanceErrorMessage(errorMessage: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Error: ${errorMessage}`,
    es: () => `Error: ${errorMessage}`,
    pt: () => `Erro: ${errorMessage}`,
  }
  return m[lang]()
}

export function formatLanguageSetMessage(langName: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Language set to ${langName}.`,
    es: () => `Idioma establecido a ${langName}.`,
    pt: () => `Idioma definido para ${langName}.`,
  }
  return m[lang]()
}

export function formatPrivacySetMessage(action: 'on' | 'off', lang: Lang = 'en'): string {
  const m = {
    en: () =>
      action === 'on'
        ? 'Your phone number is now visible on your profile.'
        : 'Your phone number is now hidden on your profile.',
    es: () =>
      action === 'on'
        ? 'Tu numero de telefono ahora es visible en tu perfil.'
        : 'Tu numero de telefono ahora esta oculto en tu perfil.',
    pt: () =>
      action === 'on'
        ? 'Seu numero de telefone agora esta visivel no seu perfil.'
        : 'Seu numero de telefone agora esta oculto no seu perfil.',
  }
  return m[lang]()
}

export function formatAccountSuspendedMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Your account has been temporarily suspended.`,
    es: () => `Tu cuenta ha sido suspendida temporalmente.`,
    pt: () => `Sua conta foi suspensa temporariamente.`,
  }
  return m[lang]()
}

export function formatMaintenanceMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Sippy is undergoing maintenance.`,
    es: () => `Sippy esta en mantenimiento.`,
    pt: () => `Sippy esta em manutencao.`,
  }
  return m[lang]()
}

export function formatCommandErrorMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Something went wrong. Try again?`,
    es: () => `Algo salio mal. Intentas de nuevo?`,
    pt: () => `Algo deu errado. Tenta de novo?`,
  }
  return m[lang]()
}

// --- Greeting (regex-matched, zero LLM cost) ---

export function formatGreetingMessage(lang: Lang = 'en', dialect: Dialect = 'neutral'): string {
  if (lang === 'es' && dialect !== 'neutral') {
    const d: Record<string, string> = {
      co: `Hola! Que necesitas? Puedo ver tu saldo o enviar plata — solo dime.`,
      mx: `Hola! Que necesitas? Puedo ver tu saldo o enviar dinero — solo dime.`,
      ar: `Hola! Que necesitas? Puedo ver tu saldo o enviar plata — solo decime.`,
      ve: `Hola! Que necesitas? Puedo ver tu saldo o enviar plata — solo dime.`,
    }
    if (d[dialect]) return d[dialect]
  }
  const m = {
    en: () => `Hey! What do you need? I can check your balance or send money — just tell me.`,
    es: () => `Hola! Que necesitas? Puedo ver tu saldo o enviar dinero — solo dime.`,
    pt: () => `Oi! O que precisa? Posso ver seu saldo ou enviar dinheiro — so me diz.`,
  }
  return m[lang]()
}

// --- Social phrases (regex-matched, zero LLM cost) ---

export function formatSocialReplyMessage(lang: Lang = 'en', dialect: Dialect = 'neutral'): string {
  if (lang === 'es' && dialect !== 'neutral') {
    const d: Record<string, string> = {
      co: `Listo. Aqui estoy por si necesitas algo.`,
      mx: `Dale. Aqui estoy por si necesitas algo.`,
      ar: `Dale. Aca estoy por si necesitas algo.`,
      ve: `Dale. Aqui estoy por si necesitas algo.`,
    }
    if (d[dialect]) return d[dialect]
  }
  const m = {
    en: () => `Got it. I'm here if you need anything.`,
    es: () => `Dale. Aqui estoy por si necesitas algo.`,
    pt: () => `Beleza. To aqui se precisar.`,
  }
  return m[lang]()
}

// --- Media messages (non-text) ---

export function formatTextOnlyMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `I can only read text for now. Just tell me what you need!`,
    es: () => `Solo puedo leer texto por ahora. Solo dime que necesitas!`,
    pt: () => `So consigo ler texto por enquanto. So me diga o que precisa!`,
  }
  return m[lang]()
}

// --- Button labels ---

export function buttonNeedAnythingElse(lang: Lang = 'en'): string {
  const m = {
    en: 'Need anything else?',
    es: 'Necesitas algo mas?',
    pt: 'Precisa de mais alguma coisa?',
  }
  return m[lang]
}

export function buttonBalance(lang: Lang = 'en'): string {
  const m = { en: 'Balance', es: 'Saldo', pt: 'Saldo' }
  return m[lang]
}

export function buttonHelp(lang: Lang = 'en'): string {
  const m = { en: 'Help', es: 'Ayuda', pt: 'Ajuda' }
  return m[lang]
}

// ============================================================================
// Transaction confirmation helpers
// ============================================================================

// Country codes that are exactly 1 digit (NANP block: US, Canada, Caribbean)
const ONE_DIGIT_CC_PREFIXES = new Set(['+1'])

// Country codes that are exactly 3 digits — LATAM region coverage
// Bolivia +591, Ecuador +593, Paraguay +595, Uruguay +598
// Central America: Guatemala +502, El Salvador +503, Honduras +504,
//                  Nicaragua +505, Costa Rica +506, Panama +507, Haiti +509
// Caribbean/Guiana: Curaçao/Sint Maarten +599, Aruba +297, Suriname +597,
//                   Belize +501, Guyana +592
const THREE_DIGIT_CC_PREFIXES = new Set([
  '+297',
  '+501',
  '+502',
  '+503',
  '+504',
  '+505',
  '+506',
  '+507',
  '+509',
  '+591',
  '+592',
  '+593',
  '+595',
  '+597',
  '+598',
  '+599',
])

function maskPhoneForConfirmation(phone: string): string {
  // phone is always E.164 (starts with '+')
  // Output: +CC***XXXX — full country code visible, subscriber masked, last 4 shown
  if (!phone.startsWith('+') || phone.length < 6) return phone
  let prefixLen: number
  if (ONE_DIGIT_CC_PREFIXES.has(phone.slice(0, 2))) {
    prefixLen = 2 // +1XXXXXXXXXX  → "+1"
  } else if (THREE_DIGIT_CC_PREFIXES.has(phone.slice(0, 4))) {
    prefixLen = 4 // +591XXXXXXX   → "+591"
  } else {
    prefixLen = 3 // +52/+55/+57…  → "+57" (2-digit CC default)
  }
  return `${phone.slice(0, prefixLen)}***${phone.slice(-4)}`
}

export function formatConfirmationPrompt(amount: number, recipient: string, lang: Lang): string {
  const amt = formatCurrencyUSD(amount)
  const to = maskPhoneForConfirmation(recipient)
  const m = {
    en: () => `Send ${amt} to ${to}? Reply YES to confirm or NO to cancel.`,
    es: () => `¿Enviar ${amt} a ${to}? Responde SI para confirmar o NO para cancelar.`,
    pt: () => `Enviar ${amt} para ${to}? Responda SIM para confirmar ou NAO para cancelar.`,
  }
  return m[lang]()
}

export function formatTransferCancelled(lang: Lang): string {
  const m = {
    en: () => `Transfer cancelled.`,
    es: () => `Transferencia cancelada.`,
    pt: () => `Transferência cancelada.`,
  }
  return m[lang]()
}

export function formatNoPendingTransfer(lang: Lang): string {
  const m = {
    en: () => `No pending transfer.`,
    es: () => `No hay transferencia pendiente.`,
    pt: () => `Nenhuma transferência pendente.`,
  }
  return m[lang]()
}

export function formatSelfSendMessage(lang: Lang): string {
  const m = {
    en: () => `That number is you! Want me to check your balance instead?`,
    es: () => `Ese numero eres tu! Quieres que te muestre tu saldo?`,
    pt: () => `Esse numero e voce! Quer que eu veja seu saldo?`,
  }
  return m[lang]()
}

export function formatConcurrentSendMessage(lang: Lang): string {
  const m = {
    en: () => `A transfer is already in progress. Please wait.`,
    es: () => `Ya hay una transferencia en proceso. Por favor espera.`,
    pt: () => `Uma transferencia ja esta em andamento. Por favor aguarde.`,
  }
  return m[lang]()
}

// ============================================================================
// TX-004: Amount validation error messages
// ============================================================================

export function formatAmountZeroMessage(lang: Lang): string {
  const m = {
    en: () => `Amount must be greater than zero.`,
    es: () => `El monto debe ser mayor que cero.`,
    pt: () => `O valor deve ser maior que zero.`,
  }
  return m[lang]()
}

export function formatAmountTooSmallMessage(lang: Lang): string {
  const m = {
    en: () => `Minimum amount is 0.10 USDC.`,
    es: () => `El monto mínimo es 0.10 USDC.`,
    pt: () => `O valor mínimo é 0.10 USDC.`,
  }
  return m[lang]()
}

export function formatAmountTooLargeMessage(lang: Lang): string {
  const m = {
    en: () => `Amount exceeds the $10,000 limit.`,
    es: () => `El monto supera el limite de $10,000.`,
    pt: () => `O valor excede o limite de $10,000.`,
  }
  return m[lang]()
}

export function formatAmountTooManyDecimalsMessage(lang: Lang): string {
  const m = {
    en: () => `Amounts can't have more than 2 decimal places (e.g., 10.50).`,
    es: () => `Los montos no pueden tener mas de 2 decimales (ej: 10.50).`,
    pt: () => `Os valores nao podem ter mais de 2 casas decimais (ex: 10.50).`,
  }
  return m[lang]()
}

export function formatAmountAmbiguousMessage(lang: Lang): string {
  const m = {
    en: () =>
      `That amount is ambiguous. Did you mean the number with a decimal or a thousands separator? Please write it without separators (e.g., 1000 or 10.50).`,
    es: () => `Ese monto es ambiguo. Escribelo sin separadores (ej: 1000 o 10.50).`,
    pt: () => `Esse valor e ambiguo. Escreva-o sem separadores (ex: 1000 ou 10.50).`,
  }
  return m[lang]()
}

export function formatAmountInvalidMessage(lang: Lang): string {
  const m = {
    en: () => `That doesn't look like a valid amount.`,
    es: () => `Eso no parece un monto valido.`,
    pt: () => `Isso nao parece um valor valido.`,
  }
  return m[lang]()
}

export function formatInvalidPhoneNumberMessage(lang: Lang): string {
  const m = {
    en: () => `Didn't catch the number. Try with country code, like +57 or +52.`,
    es: () => `No capte el numero. Intenta con codigo de pais, tipo +57 o +52.`,
    pt: () => `Nao peguei o numero. Tenta com codigo do pais, tipo +55 ou +57.`,
  }
  return m[lang]()
}

export function formatContactNotFound(name: string, lang: Lang): string {
  const m = {
    en: () =>
      `No contact "${name}" found. Reply with the phone number, or save it first:\n"save contact ${name} +573001234567"`,
    es: () =>
      `No encontre a "${name}". Responde con el numero, o guardalo primero:\n"guardar contacto ${name} +573001234567"`,
    pt: () =>
      `Nao encontrei "${name}". Responda com o numero, ou salve primeiro:\n"salvar contato ${name} +5511999887766"`,
  }
  return m[lang]()
}

/**
 * Friendlier TOO_SMALL message used when we know the user's original
 * amount + currency + intended recipient. Replaces the bare
 * "El monto mínimo es 0.10 USDC" with a line that:
 *   1. Shows what they typed AND the USDC conversion (so the failure
 *      reason is obvious — 200 pesos → ~$0.05 USDC).
 *   2. Names the recipient (display name or masked phone).
 *   3. Asks for a new amount in the SAME currency, signaling that Sippy
 *      kept the recipient + currency context (the partial state was
 *      re-seeded on the way out — see reseedRecoverableSendError).
 *
 * Falls back to `formatAmountTooSmallMessage` when context is missing.
 */
export function formatAmountBelowMinWithContext(
  args: {
    localAmount?: number
    localCurrency?: string | null
    usdcAmount: number
    recipientLabel: string
  },
  lang: Lang
): string {
  const currencyWord =
    args.localCurrency && args.localCurrency in CURRENCY_WORD_BY_CODE
      ? CURRENCY_WORD_BY_CODE[args.localCurrency]
      : null
  // No local currency context — show plain USDC; still useful (names the
  // recipient + asks for a new amount).
  if (!currencyWord || args.localAmount === undefined) {
    const m = {
      en: () =>
        `${formatCurrencyUSD(args.usdcAmount)} is below the 0.10 USDC minimum. How much do you want to send to ${args.recipientLabel}?`,
      es: () =>
        `${formatCurrencyUSD(args.usdcAmount)} es menos del minimo de 0.10 USDC. ¿Cuanto quieres enviar a ${args.recipientLabel}?`,
      pt: () =>
        `${formatCurrencyUSD(args.usdcAmount)} e menos do minimo de 0.10 USDC. Quanto voce quer enviar para ${args.recipientLabel}?`,
    }
    return m[lang]()
  }
  const m = {
    en: () =>
      `${args.localAmount} ${currencyWord} is about ${formatCurrencyUSD(args.usdcAmount)} USDC, below the 0.10 USDC minimum. How much ${currencyWord} do you want to send to ${args.recipientLabel}?`,
    es: () =>
      `${args.localAmount} ${currencyWord} son aproximadamente ${formatCurrencyUSD(args.usdcAmount)} USDC, menos del minimo de 0.10 USDC. ¿Cuanto quieres enviar a ${args.recipientLabel} en ${currencyWord}?`,
    pt: () =>
      `${args.localAmount} ${currencyWord} sao cerca de ${formatCurrencyUSD(args.usdcAmount)} USDC, menos do minimo de 0.10 USDC. Quanto voce quer enviar para ${args.recipientLabel} em ${currencyWord}?`,
  }
  return m[lang]()
}

/**
 * Short follow-up appended after `formatInsufficientBalanceMessage` when
 * the send fired through a partial-resolution path (so we know the
 * recipient and can keep them across the retry). The recipient hint is
 * what tells the user "your context is preserved, just send a smaller
 * amount" — without it the failure looks total.
 */
export function formatInsufficientBalanceRetryHint(
  args: { recipientLabel: string; localCurrency?: string | null },
  lang: Lang
): string {
  const currencyWord =
    args.localCurrency && args.localCurrency in CURRENCY_WORD_BY_CODE
      ? CURRENCY_WORD_BY_CODE[args.localCurrency]
      : null
  const suffix = currencyWord ? ` en ${currencyWord}` : ''
  const en = currencyWord ? ` in ${currencyWord}` : ''
  const pt = currencyWord ? ` em ${currencyWord}` : ''
  const m = {
    en: () => `Want to try a smaller amount${en} to ${args.recipientLabel}?`,
    es: () => `Quieres intentar con un monto menor${suffix} a ${args.recipientLabel}?`,
    pt: () => `Quer tentar um valor menor${pt} para ${args.recipientLabel}?`,
  }
  return m[lang]()
}

export function formatAmountError(code: AmountErrorCode, lang: Lang): string {
  switch (code) {
    case 'ZERO':
      return formatAmountZeroMessage(lang)
    case 'TOO_SMALL':
      return formatAmountTooSmallMessage(lang)
    case 'TOO_LARGE':
      return formatAmountTooLargeMessage(lang)
    case 'TOO_MANY_DECIMALS':
      return formatAmountTooManyDecimalsMessage(lang)
    case 'AMBIGUOUS_SEPARATOR':
      return formatAmountAmbiguousMessage(lang)
    case 'INVALID_FORMAT':
      return formatAmountInvalidMessage(lang)
  }
}

export function formatConfirmationPromptWithWarning(
  amount: number,
  recipient: string,
  isLargeAmount: boolean,
  lang: Lang
): string {
  const base = formatConfirmationPrompt(amount, recipient, lang)
  if (!isLargeAmount) return base

  const warning = {
    en: `This is a large transfer.`,
    es: `Esta es una transferencia grande.`,
    pt: `Esta e uma transferencia grande.`,
  }
  return base + `\n\n${warning[lang]}`
}

// ============================================================================
// Invite-a-friend messages
// ============================================================================

export function formatInviteSentToSender(recipientPhone: string, lang: Lang = 'en'): string {
  const phone = recipientPhone
  const m = {
    en: () => `We invited ${phone} to Sippy! We'll let you know when they join so you can send.`,
    es: () => `Invitamos a ${phone} a Sippy! Te avisamos cuando se una para que le puedas enviar.`,
    pt: () => `Convidamos ${phone} pro Sippy! Avisamos quando entrar pra voce poder enviar.`,
  }
  return m[lang]()
}

export function formatInviteDeliveryFailed(recipientPhone: string, lang: Lang = 'en'): string {
  const phone = recipientPhone
  const m = {
    en: () =>
      `${phone} isn't on Sippy yet. We couldn't reach them right now, but if they join we'll let you know.`,
    es: () =>
      `${phone} aun no esta en Sippy. No los pudimos contactar ahora, pero si se unen te avisamos.`,
    pt: () =>
      `${phone} ainda nao esta no Sippy. Nao conseguimos contata-los agora, mas se entrarem avisamos.`,
  }
  return m[lang]()
}

export function formatInviteAlreadyPending(recipientPhone: string, lang: Lang = 'en'): string {
  const phone = recipientPhone
  const m = {
    en: () => `${phone} already has an invite from you. We'll let you know when they join!`,
    es: () => `${phone} ya tiene una invitacion tuya. Te avisamos cuando se una!`,
    pt: () => `${phone} ja tem um convite seu. Avisamos quando entrar!`,
  }
  return m[lang]()
}

export function formatInviteDailyLimitReached(lang: Lang = 'en'): string {
  const m = {
    en: () => `You've reached the daily invite limit. Try again tomorrow.`,
    es: () => `Llegaste al limite de invitaciones diarias. Intenta manana.`,
    pt: () => `Voce atingiu o limite diario de convites. Tente amanha.`,
  }
  return m[lang]()
}

export function formatInviteAlreadyOnSippy(recipientPhone: string, lang: Lang = 'en'): string {
  const phone = recipientPhone
  const m = {
    en: () => `${phone} is already on Sippy. You can send them money directly.`,
    es: () => `${phone} ya esta en Sippy. Puedes enviarle dinero directamente.`,
    pt: () => `${phone} ja esta no Sippy. Voce pode enviar dinheiro diretamente.`,
  }
  return m[lang]()
}

export function formatEmailNudge(lang: Lang = 'en'): string {
  const settingsUrl = `${FRONTEND_URL}/settings`
  const m = {
    en: () =>
      `Tip: add a recovery email so you can get back into your wallet if you ever lose your number: ${settingsUrl}`,
    es: () =>
      `Tip: agrega un correo de recuperacion para acceder a tu billetera si pierdes tu numero: ${settingsUrl}`,
    pt: () =>
      `Dica: adicione um e-mail de recuperacao para acessar sua carteira se perder seu numero: ${settingsUrl}`,
  }
  return m[lang]()
}

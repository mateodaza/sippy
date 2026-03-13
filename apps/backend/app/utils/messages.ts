/**
 * Message Templates — Trilingual Catalog (EN/ES/PT)
 *
 * All user-facing strings consolidated here.
 * Professional tone, no emojis, no slang.
 */

export type Lang = 'en' | 'es' | 'pt'

import { DAILY_LIMIT_VERIFIED } from '#services/cdp_wallet.service'

const RECEIPT_BASE_URL = process.env.RECEIPT_BASE_URL || 'https://www.sippy.lat/receipt/'
const FUND_URL = process.env.FUND_URL || 'https://www.sippy.lat/fund'
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
  COP: ',',  // Colombia: 1,000
  MXN: ',',  // Mexico: 1,000
  ARS: '.',  // Argentina: 1.000
  BRL: '.',  // Brazil: 1.000
  PEN: ',',  // Peru: 1,000
  CLP: '.',  // Chile: 1.000
  UYU: '.',  // Uruguay: 1.000
  PYG: '.',  // Paraguay: 1.000
  BOB: ',',  // Bolivia: 1,000
  VES: ',',  // Venezuela: 1,000
  // Central America
  CRC: '.',  // Costa Rica: 1.000
  GTQ: ',',  // Guatemala: 1,000
  HNL: ',',  // Honduras: 1,000
  NIO: ',',  // Nicaragua: 1,000
  // Caribbean
  DOP: ',',  // Dominican Republic: 1,000
  CUP: ',',  // Cuba: 1,000
  HTG: ',',  // Haiti: 1,000
  JMD: ',',  // Jamaica: 1,000
  TTD: ',',  // Trinidad & Tobago: 1,000
  BBD: ',',  // Barbados: 1,000
  // Other
  GYD: ',',  // Guyana: 1,000
  SRD: ',',  // Suriname: 1,000
  BZD: ',',  // Belize: 1,000
  AWG: ',',  // Aruba: 1,000
  ANG: ',',  // Curaçao: 1,000
  XCD: ',',  // EC$ islands: 1,000
}

function formatIntegerWithSep(n: number, sep: string): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

export function formatDualAmount(usd: number, rate: number | null, currency: string | null): string {
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
      `Sippy Commands\n\n` +
      `start - Create your wallet\n` +
      `balance - Check your balance\n` +
      `send <amount> to <phone>\n` +
      `  Example: send 5 to +573001234567\n` +
      `history - View your transactions\n` +
      `settings - Manage spending limits\n` +
      `about - What is Sippy?\n` +
      `help - Show this message\n` +
      `language en/es/pt - Change language\n\n` +
      `Add funds: ${FUND_URL}`,
    es: () =>
      `Comandos de Sippy\n\n` +
      `comenzar - Crear tu billetera\n` +
      `saldo - Consultar tu saldo\n` +
      `enviar <monto> a <telefono>\n` +
      `  Ejemplo: enviar 5 a +573001234567\n` +
      `historial - Ver tus transacciones\n` +
      `ajustes - Administrar limites de gasto\n` +
      `acerca - Que es Sippy?\n` +
      `ayuda - Mostrar este mensaje\n` +
      `idioma en/es/pt - Cambiar idioma\n\n` +
      `Agregar fondos: ${FUND_URL}`,
    pt: () =>
      `Comandos do Sippy\n\n` +
      `comecar - Criar sua carteira\n` +
      `saldo - Consultar seu saldo\n` +
      `enviar <valor> para <telefone>\n` +
      `  Exemplo: enviar 5 para +573001234567\n` +
      `historico - Ver suas transacoes\n` +
      `ajustes - Gerenciar limites de gasto\n` +
      `sobre - O que e o Sippy?\n` +
      `ajuda - Mostrar esta mensagem\n` +
      `idioma en/es/pt - Mudar idioma\n\n` +
      `Adicionar fundos: ${FUND_URL}`,
  }
  return m[lang]()
}

// --- About ---

export function formatAboutMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `What is Sippy?\n\n` +
      `Sippy is a WhatsApp wallet for sending money using phone numbers.\n\n` +
      `How it works:\n\n` +
      `Send to phone numbers - no extra apps, no codes to remember.\n\n` +
      `Always $1 = $1 - your balance is in digital dollars, always stable.\n\n` +
      `Safe and fast - powered by Coinbase, transfers happen in seconds.\n\n` +
      `No transaction fees - we cover the cost of your transfers.\n\n` +
      `Send "help" to see all commands.`,
    es: () =>
      `Que es Sippy?\n\n` +
      `Sippy es una billetera de WhatsApp para enviar dinero usando numeros de telefono.\n\n` +
      `Como funciona:\n\n` +
      `Envia a numeros de telefono, sin aplicaciones adicionales ni codigos.\n\n` +
      `Siempre $1 = $1, tu saldo esta en dolares digitales, siempre estables.\n\n` +
      `Seguro y rapido, respaldado por Coinbase, las transferencias son en segundos.\n\n` +
      `Sin comisiones, nosotros cubrimos el costo de tus transferencias.\n\n` +
      `Envia "ayuda" para ver todos los comandos.`,
    pt: () =>
      `O que e o Sippy?\n\n` +
      `Sippy e uma carteira no WhatsApp para enviar dinheiro usando numeros de telefone.\n\n` +
      `Como funciona:\n\n` +
      `Envie para numeros de telefone, sem aplicativos extras nem codigos.\n\n` +
      `Sempre $1 = $1, seu saldo e em dolares digitais, sempre estaveis.\n\n` +
      `Seguro e rapido, com Coinbase, as transferencias acontecem em segundos.\n\n` +
      `Sem taxas de transacao, nos cobrimos o custo das suas transferencias.\n\n` +
      `Envie "ajuda" para ver todos os comandos.`,
  }
  return m[lang]()
}

// --- Balance ---

export function formatBalanceMessage(
  params: { balance: number; wallet: string; ethBalance?: string; phoneNumber?: string; localRate?: number | null; localCurrency?: string | null },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(
    params.balance,
    params.localRate ?? null,
    params.localCurrency ?? null
  )
  const addr = maskAddress(params.wallet)

  const m = {
    en: () => {
      let msg = `Balance\n\nUSD: ${amt}\nWallet: ${addr}`
      if (params.ethBalance)
        msg = `Balance\n\nTransfer credit: ${params.ethBalance} ETH\nUSD: ${amt}\nWallet: ${addr}`
      return msg + `\n\nAdd funds: ${FUND_URL}`
    },
    es: () => {
      let msg = `Saldo\n\nUSD: ${amt}\nBilletera: ${addr}`
      if (params.ethBalance)
        msg = `Saldo\n\nCredito de transferencia: ${params.ethBalance} ETH\nUSD: ${amt}\nBilletera: ${addr}`
      return msg + `\n\nAgregar fondos: ${FUND_URL}`
    },
    pt: () => {
      let msg = `Saldo\n\nUSD: ${amt}\nCarteira: ${addr}`
      if (params.ethBalance)
        msg = `Saldo\n\nCredito de transferencia: ${params.ethBalance} ETH\nUSD: ${amt}\nCarteira: ${addr}`
      return msg + `\n\nAdicionar fundos: ${FUND_URL}`
    },
  }
  return m[lang]()
}

// --- Send processing ---

export function formatSendProcessingMessage(
  params: { amount: number; toPhone: string; localRate?: number | null; localCurrency?: string | null },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(params.amount, params.localRate ?? null, params.localCurrency ?? null)
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
  params: { amount: number; toPhone: string; txHash: string; gasCovered?: boolean; localRate?: number | null; localCurrency?: string | null },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(params.amount, params.localRate ?? null, params.localCurrency ?? null)
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
  params: { amount: number; fromPhone: string; txHash: string; localRate?: number | null; localCurrency?: string | null },
  lang: Lang = 'en'
): string {
  const amt = formatDualAmount(params.amount, params.localRate ?? null, params.localCurrency ?? null)
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
  params: { balance: number; needed: number; localRate?: number | null; localCurrency?: string | null },
  lang: Lang = 'en'
): string {
  const bal = formatDualAmount(params.balance, params.localRate ?? null, params.localCurrency ?? null)
  const need = formatDualAmount(params.needed, params.localRate ?? null, params.localCurrency ?? null)
  const m = {
    en: () => `Insufficient balance.\n\nBalance: ${bal}\nNeeded: ${need}\n\nAdd funds: ${FUND_URL}`,
    es: () =>
      `Saldo insuficiente.\n\nSaldo: ${bal}\nNecesario: ${need}\n\nAgregar fondos: ${FUND_URL}`,
    pt: () =>
      `Saldo insuficiente.\n\nSaldo: ${bal}\nNecessario: ${need}\n\nAdicionar fundos: ${FUND_URL}`,
  }
  return m[lang]()
}

export function formatNoWalletMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `No wallet found.\n\nSend "start" to create your Sippy wallet.`,
    es: () => `No se encontro billetera.\n\nEnvia "comenzar" para crear tu billetera Sippy.`,
    pt: () => `Carteira nao encontrada.\n\nEnvie "comecar" para criar sua carteira Sippy.`,
  }
  return m[lang]()
}

export function formatSessionExpiredMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Session expired.\n\nSend "start" to renew your session.`,
    es: () => `Sesion expirada.\n\nEnvia "comenzar" para renovar tu sesion.`,
    pt: () => `Sessao expirada.\n\nEnvie "comecar" para renovar sua sessao.`,
  }
  return m[lang]()
}

export function formatRecipientNotFoundMessage(phone: string, lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Recipient not found.\n\n+${phone} is not registered with Sippy.\n\nAsk them to send "start" to this number to create their wallet.`,
    es: () =>
      `Destinatario no encontrado.\n\n+${phone} no esta registrado en Sippy.\n\nPidele que envie "comenzar" a este numero para crear su billetera.`,
    pt: () =>
      `Destinatario nao encontrado.\n\n+${phone} nao esta registrado no Sippy.\n\nPeca para enviar "comecar" para este numero para criar a carteira.`,
  }
  return m[lang]()
}

export function formatInvalidAmountMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Invalid amount.\n\nPlease send a positive number.\n\nExample: send 5 to +573001234567`,
    es: () =>
      `Monto invalido.\n\nPor favor envia un numero positivo.\n\nEjemplo: enviar 5 a +573001234567`,
    pt: () =>
      `Valor invalido.\n\nPor favor envie um numero positivo.\n\nExemplo: enviar 5 para +573001234567`,
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
        `Welcome to Sippy.\n\n` +
        `Your wallet is ready:\n${addr}\n\n` +
        `Get started in 3 steps:\n` +
        `1. Add funds: ${FUND_URL}\n` +
        `2. Check balance: send "balance"\n` +
        `3. Send money: send 1 to +57...\n\n` +
        `No transaction fees. We cover them.\n\n` +
        `Commands: send "help"\n` +
        `Learn more: send "about"`,
      es: () =>
        `Bienvenido a Sippy.\n\n` +
        `Tu billetera esta lista:\n${addr}\n\n` +
        `Comienza en 3 pasos:\n` +
        `1. Agrega fondos: ${FUND_URL}\n` +
        `2. Consulta saldo: envia "saldo"\n` +
        `3. Envia dinero: enviar 1 a +57...\n\n` +
        `Sin comisiones. Nosotros las cubrimos.\n\n` +
        `Comandos: envia "ayuda"\n` +
        `Mas informacion: envia "acerca"`,
      pt: () =>
        `Bem-vindo ao Sippy.\n\n` +
        `Sua carteira esta pronta:\n${addr}\n\n` +
        `Comece em 3 passos:\n` +
        `1. Adicione fundos: ${FUND_URL}\n` +
        `2. Consulte saldo: envie "saldo"\n` +
        `3. Envie dinheiro: enviar 1 para +57...\n\n` +
        `Sem taxas de transacao. Nos cobrimos.\n\n` +
        `Comandos: envie "ajuda"\n` +
        `Saiba mais: envie "sobre"`,
    }
    return m[lang]()
  } else {
    const m = {
      en: () => `Welcome back.\n\nYour wallet: ${addr}\n\nSend "help" to see all commands.`,
      es: () =>
        `Bienvenido de nuevo.\n\nTu billetera: ${addr}\n\nEnvia "ayuda" para ver todos los comandos.`,
      pt: () =>
        `Bem-vindo de volta.\n\nSua carteira: ${addr}\n\nEnvie "ajuda" para ver todos os comandos.`,
    }
    return m[lang]()
  }
}

// ============================================================================
// Inline strings absorbed from server.ts, send/start/balance commands
// ============================================================================

export function formatInvalidSendFormat(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Invalid send format.\n\nUse: send <amount> to <phone>\n\nExample: send 5 to +573001234567`,
    es: () =>
      `Formato de envio invalido.\n\nUsa: enviar <monto> a <telefono>\n\nEjemplo: enviar 5 a +573001234567`,
    pt: () =>
      `Formato de envio invalido.\n\nUse: enviar <valor> para <telefone>\n\nExemplo: enviar 5 para +573001234567`,
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
    en: () => `Natural language is temporarily limited. Please use exact commands.`,
    es: () =>
      `El lenguaje natural esta temporalmente limitado. Por favor usa los comandos exactos.`,
    pt: () =>
      `A linguagem natural esta temporariamente limitada. Por favor use os comandos exatos.`,
  }
  return m[lang]()
}

export function formatUnknownCommandMessage(originalText: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Command not recognized: "${originalText}"\n\nAvailable commands:\n\n`,
    es: () => `Comando no reconocido: "${originalText}"\n\nComandos disponibles:\n\n`,
    pt: () => `Comando nao reconhecido: "${originalText}"\n\nComandos disponiveis:\n\n`,
  }
  return m[lang]() + formatHelpMessage(lang)
}

export function formatTransactionBlockedMessage(reason: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Transaction blocked.\n\n${reason}\n\nThese limits help keep your account secure.`,
    es: () =>
      `Transaccion bloqueada.\n\n${reason}\n\nEstos limites ayudan a mantener tu cuenta segura.`,
    pt: () =>
      `Transacao bloqueada.\n\n${reason}\n\nEstes limites ajudam a manter sua conta segura.`,
  }
  return m[lang]()
}

export function formatTransferFailedMessage(errorMessage: string, lang: Lang = 'en'): string {
  const m = {
    en: () => `Transfer failed.\n\n${errorMessage}`,
    es: () => `Transferencia fallida.\n\n${errorMessage}`,
    pt: () => `Transferencia falhou.\n\n${errorMessage}`,
  }
  return m[lang]()
}

export function formatSetupRequiredMessage(phoneNumber: string, lang: Lang = 'en'): string {
  const setupUrl = `${FRONTEND_URL}/setup?phone=${encodeURIComponent(phoneNumber)}`
  const m = {
    en: () =>
      `You need to complete your wallet setup before sending.\n\nPlease finish setup here:\n${setupUrl}`,
    es: () =>
      `Necesitas completar la configuracion de tu billetera antes de enviar.\n\nCompleta la configuracion aqui:\n${setupUrl}`,
    pt: () =>
      `Voce precisa completar a configuracao da sua carteira antes de enviar.\n\nComplete a configuracao aqui:\n${setupUrl}`,
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
      en: `You've reached your daily limit of $${dailyLimit}. Try again tomorrow.`,
      es: `Has alcanzado tu limite diario de $${dailyLimit}. Intenta de nuevo manana.`,
      pt: `Voce atingiu seu limite diario de $${dailyLimit}. Tente novamente amanha.`,
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
    en: () => action === 'on'
      ? 'Your phone number is now visible on your profile.'
      : 'Your phone number is now hidden on your profile.',
    es: () => action === 'on'
      ? 'Tu numero de telefono ahora es visible en tu perfil.'
      : 'Tu numero de telefono ahora esta oculto en tu perfil.',
    pt: () => action === 'on'
      ? 'Seu numero de telefone agora esta visivel no seu perfil.'
      : 'Seu numero de telefone agora esta oculto no seu perfil.',
  }
  return m[lang]()
}

export function formatCommandErrorMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Error processing your command. Please try again.`,
    es: () => `Error al procesar tu comando. Por favor intenta de nuevo.`,
    pt: () => `Erro ao processar seu comando. Por favor tente novamente.`,
  }
  return m[lang]()
}

// --- Greeting (regex-matched, zero LLM cost) ---

export function formatGreetingMessage(lang: Lang = 'en'): string {
  const m = {
    en: () =>
      `Hey, welcome to Sippy.\n\n` +
      `You can send dollars to any phone number, check your balance, or add funds.\n\n` +
      `Try "balance", "help", or "send 5 to +57..."`,
    es: () =>
      `Hola, bienvenido a Sippy.\n\n` +
      `Puedes enviar dolares a cualquier numero de telefono, consultar tu saldo o agregar fondos.\n\n` +
      `Prueba "saldo", "ayuda" o "enviar 5 a +57..."`,
    pt: () =>
      `Oi, bem-vindo ao Sippy.\n\n` +
      `Voce pode enviar dolares para qualquer numero de telefone, consultar seu saldo ou adicionar fundos.\n\n` +
      `Tente "saldo", "ajuda" ou "enviar 5 para +57..."`,
  }
  return m[lang]()
}

// --- Social phrases (regex-matched, zero LLM cost) ---

export function formatSocialReplyMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `Anytime. Let me know if you need anything — "balance", "send", or "help".`,
    es: () => `Con gusto. Avisame si necesitas algo — "saldo", "enviar" o "ayuda".`,
    pt: () => `Disponha. Me avise se precisar de algo — "saldo", "enviar" ou "ajuda".`,
  }
  return m[lang]()
}

// --- Media messages (non-text) ---

export function formatTextOnlyMessage(lang: Lang = 'en'): string {
  const m = {
    en: () => `I can only read text messages. Try "help" to see what I can do.`,
    es: () => `Solo puedo leer mensajes de texto. Prueba "ayuda" para ver lo que puedo hacer.`,
    pt: () => `So consigo ler mensagens de texto. Tente "ajuda" para ver o que posso fazer.`,
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
  '+297', '+501', '+502', '+503', '+504', '+505', '+506', '+507', '+509',
  '+591', '+592', '+593', '+595', '+597', '+598', '+599',
])

function maskPhoneForConfirmation(phone: string): string {
  // phone is always E.164 (starts with '+')
  // Output: +CC***XXXX — full country code visible, subscriber masked, last 4 shown
  if (!phone.startsWith('+') || phone.length < 6) return phone
  let prefixLen: number
  if (ONE_DIGIT_CC_PREFIXES.has(phone.slice(0, 2))) {
    prefixLen = 2  // +1XXXXXXXXXX  → "+1"
  } else if (THREE_DIGIT_CC_PREFIXES.has(phone.slice(0, 4))) {
    prefixLen = 4  // +591XXXXXXX   → "+591"
  } else {
    prefixLen = 3  // +52/+55/+57…  → "+57" (2-digit CC default)
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
    en: () => `You cannot send money to yourself.`,
    es: () => `No puedes enviarte dinero a ti mismo.`,
    pt: () => `Voce nao pode enviar dinheiro para voce mesmo.`,
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

/**
 * Error Mapper — Trilingual
 *
 * Maps technical errors to user-friendly messages in the user's language.
 */

import { type Lang } from './messages.js'

type ErrorMessages = Record<string, Record<Lang, string>>

const ERROR_MAP: ErrorMessages = {
  insufficient: {
    en: 'Not enough balance for this one. Want me to check your balance?',
    es: 'No alcanza el saldo para este. Quieres que revise tu saldo?',
    pt: 'Saldo nao e suficiente pra esse. Quer que eu veja seu saldo?',
  },
  network: {
    en: 'Network issue. Please try again in a moment.',
    es: 'Error de red. Por favor intenta de nuevo en un momento.',
    pt: 'Erro de rede. Por favor tente novamente em um momento.',
  },
  wallet: {
    en: "Wallet hiccup. Send me any message and I'll reconnect you.",
    es: 'Fallo de billetera. Mandame cualquier mensaje y te reconecto.',
    pt: 'Erro de carteira. Me manda qualquer mensagem e eu te reconecto.',
  },
  whatsapp: {
    en: 'Messaging error. Your transaction may have succeeded — check "balance".',
    es: 'Error de mensajeria. Tu transaccion puede haber sido exitosa — verifica "saldo".',
    pt: 'Erro de mensagem. Sua transacao pode ter sido concluida — verifique "saldo".',
  },
  session: {
    en: 'I need to reconnect you. Just send me any message.',
    es: 'Necesito reconectarte. Mandame cualquier mensaje.',
    pt: 'Preciso te reconectar. Me manda qualquer mensagem.',
  },
  transaction: {
    en: "That didn't go through. Try again — your balance wasn't affected.",
    es: 'Eso no paso. Intenta de nuevo — tu saldo no cambio.',
    pt: 'Nao foi dessa vez. Tente de novo — seu saldo nao mudou.',
  },
  generic: {
    en: 'An error occurred. Please try again or contact support.',
    es: 'Ocurrio un error. Por favor intenta de nuevo o contacta soporte.',
    pt: 'Ocorreu um erro. Por favor tente novamente ou entre em contato com o suporte.',
  },
}

/**
 * Convert error to user-friendly message in the user's language.
 */
export function toUserErrorMessage(error: unknown, lang: Lang = 'en'): string {
  if (!(error instanceof Error)) {
    return ERROR_MAP.generic[lang]
  }

  const message = error.message.toLowerCase()

  if (message.includes('insufficient') || message.includes('balance')) {
    return ERROR_MAP.insufficient[lang]
  }

  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('fetch')
  ) {
    return ERROR_MAP.network[lang]
  }

  if (
    message.includes('wallet not found') ||
    message.includes('account') ||
    message.includes('cdp')
  ) {
    return ERROR_MAP.wallet[lang]
  }

  if (message.includes('whatsapp')) {
    return ERROR_MAP.whatsapp[lang]
  }

  if (message.includes('session') || message.includes('expired')) {
    return ERROR_MAP.session[lang]
  }

  if (message.includes('gas') || message.includes('transaction') || message.includes('revert')) {
    return ERROR_MAP.transaction[lang]
  }

  return ERROR_MAP.generic[lang]
}

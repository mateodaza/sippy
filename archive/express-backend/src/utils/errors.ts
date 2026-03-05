/**
 * Error Mapper — Trilingual
 *
 * Maps technical errors to user-friendly messages in the user's language.
 */

import { Lang } from './messages.js';

type ErrorMessages = Record<string, Record<Lang, string>>;

const ERROR_MAP: ErrorMessages = {
  insufficient: {
    en: 'Insufficient balance or network fees. Please check your balance.',
    es: 'Saldo insuficiente o tarifas de red. Por favor verifica tu saldo.',
    pt: 'Saldo insuficiente ou taxas de rede. Por favor verifique seu saldo.',
  },
  network: {
    en: 'Network issue. Please try again in a moment.',
    es: 'Error de red. Por favor intenta de nuevo en un momento.',
    pt: 'Erro de rede. Por favor tente novamente em um momento.',
  },
  wallet: {
    en: 'Wallet error. Please send "start" to refresh your session.',
    es: 'Error de billetera. Por favor envia "comenzar" para renovar tu sesion.',
    pt: 'Erro de carteira. Por favor envie "comecar" para renovar sua sessao.',
  },
  whatsapp: {
    en: 'Messaging error. Your transaction may have succeeded — check "balance".',
    es: 'Error de mensajeria. Tu transaccion puede haber sido exitosa — verifica "saldo".',
    pt: 'Erro de mensagem. Sua transacao pode ter sido concluida — verifique "saldo".',
  },
  session: {
    en: 'Session expired. Send "start" to renew your session.',
    es: 'Sesion expirada. Envia "comenzar" para renovar tu sesion.',
    pt: 'Sessao expirada. Envie "comecar" para renovar sua sessao.',
  },
  transaction: {
    en: 'Transaction failed. Please try again or contact support.',
    es: 'Transaccion fallida. Por favor intenta de nuevo o contacta soporte.',
    pt: 'Transacao falhou. Por favor tente novamente ou entre em contato com o suporte.',
  },
  generic: {
    en: 'An error occurred. Please try again or contact support.',
    es: 'Ocurrio un error. Por favor intenta de nuevo o contacta soporte.',
    pt: 'Ocorreu um erro. Por favor tente novamente ou entre em contato com o suporte.',
  },
};

/**
 * Convert error to user-friendly message in the user's language.
 */
export function toUserErrorMessage(error: unknown, lang: Lang = 'en'): string {
  if (!(error instanceof Error)) {
    return ERROR_MAP.generic[lang];
  }

  const message = error.message.toLowerCase();

  if (message.includes('insufficient') || message.includes('balance')) {
    return ERROR_MAP.insufficient[lang];
  }

  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('fetch')
  ) {
    return ERROR_MAP.network[lang];
  }

  if (
    message.includes('wallet not found') ||
    message.includes('account') ||
    message.includes('cdp')
  ) {
    return ERROR_MAP.wallet[lang];
  }

  if (message.includes('whatsapp')) {
    return ERROR_MAP.whatsapp[lang];
  }

  if (message.includes('session') || message.includes('expired')) {
    return ERROR_MAP.session[lang];
  }

  if (
    message.includes('gas') ||
    message.includes('transaction') ||
    message.includes('revert')
  ) {
    return ERROR_MAP.transaction[lang];
  }

  return ERROR_MAP.generic[lang];
}

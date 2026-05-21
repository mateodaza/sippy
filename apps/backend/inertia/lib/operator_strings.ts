/**
 * Operator-admin UI string bundles.
 *
 * Two bundles — `operatorSend` and `eventAttendees` — covering every
 * user-facing string on the two operator pages. ES is the default; EN is
 * a parallel translation. Operator chooses via the header toggle in
 * admin_layout, which sets the `sippy_admin_lang` cookie.
 *
 * The bundle shape is identical across languages; TypeScript enforces
 * parity, so adding a string in one language without translating it in
 * the other surfaces at compile time. Parametric strings are functions
 * (e.g. `confirmSendTo(amount, masked)`), keeping interpolation explicit
 * and type-safe.
 *
 * Out of scope (intentionally NOT covered here, kept in EN regardless of
 * the toggle): admin-only surfaces seen by Anthropic admins, not LatAm
 * operators — the OperatorWalletPanel inside event_attendees, the admin
 * dashboard root, users/analytics/roles pages. Operator-visible portions
 * of the shared admin_layout (the role-gated sidebar nav labels SEND,
 * ATTENDEES, QR SHEETS) are translated inline in admin_layout.tsx itself
 * since they live alongside admin-only labels in the same array.
 */

import type { AdminLang } from '../../app/utils/admin_lang.js'

export type { AdminLang }

// ─────────────────────────────────────────────────────────────────────────────
// operator_send.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface OperatorSendStrings {
  headTitle: string
  heading: string
  eventLine: (name: string, slug: string) => string
  noWalletSubtitle: string

  // Wallet header
  walletLabel: string
  walletAddressCopyHint: string
  walletAddressCopy: string
  walletAddressCopied: string
  balanceLabel: string
  balanceRpcUnavailable: string
  hourCapLabel: string
  spentLastHour: (amount: string) => string

  // No-wallet panel: split into prefix + suffix so the route fragment
  // can render as <code> in the middle.
  noWalletHeading: string
  noWalletBodyPrefix: string
  noWalletBodySuffix: string

  // Duplicate-recipient override panel
  dupHeading: string
  dupDetail: (amount: string, status: string, id: string) => string
  dupWarning: string
  dupSendAnyway: string
  dupCancel: string

  // Form
  recipientPhoneLabel: string
  lookupLoading: string
  lookupButton: string
  attendeeFound: (linkedAt: string, source?: string | null) => string
  cannotSend: (reason: string) => string
  reasonNotInEvent: string
  reasonInvalidPhone: string
  lookupError: (reason: string) => string

  amountLabel: string
  amountPlaceholder: string
  hourCapFootnote: (remaining: string) => string
  amountExceedsHourCap: (remaining: string) => string

  sendingButton: string
  confirmSend: (amount: string, masked: string) => string
  sendCta: (amount: string, masked: string) => string

  // Recent sends
  recentSendsHeading: string
  noSendsYet: string
  sendStatus: (status: string) => string

  // Local flash + fallback strings used when the server response is
  // missing a translated `body.error` field (network error, generic
  // 5xx) or the failure is client-side before the request fires.
  amountMustBePositive: string
  sendFailedFallback: string
  networkError: string
  dupFallback: string
  sendSuccessFlash: (amount: string, masked: string, txShort: string) => string
}

const operatorSendEs: OperatorSendStrings = {
  headTitle: 'Operador — Enviar',
  heading: 'Enviar al asistente',
  eventLine: (name, slug) => `Evento: ${name} · ${slug}`,
  noWalletSubtitle: 'No tienes billetera de evento asignada. Contacta a un admin.',

  walletLabel: 'Billetera',
  walletAddressCopyHint: 'Comparte esta dirección para recibir fondos USDC en Arbitrum',
  walletAddressCopy: 'Copiar',
  walletAddressCopied: '¡Copiada!',
  balanceLabel: 'Saldo',
  balanceRpcUnavailable:
    'RPC no disponible; saldo desconocido. NO asumas que está vacía — reintenta en un momento.',
  hourCapLabel: 'Límite por hora restante',
  spentLastHour: (amount) => `gastado última hora: $${amount}`,

  noWalletHeading: 'No tienes billetera de evento asignada',
  noWalletBodyPrefix: 'Un admin debe asignarte a un evento vía ',
  noWalletBodySuffix: ' antes de que puedas enviar.',

  dupHeading: 'El destinatario ya recibió un pago para este evento',
  dupDetail: (amount, status, id) =>
    `Envío anterior: $${amount} USDC · estado: ${status} · id: ${id}`,
  dupWarning:
    'Solo anula si verificaste que el asistente NO recibió los fondos, o si entregó efectivo adicional que amerita un segundo envío.',
  dupSendAnyway: 'Enviar de todas formas',
  dupCancel: 'Cancelar',

  recipientPhoneLabel: 'Teléfono del destinatario',
  lookupLoading: 'Buscando…',
  lookupButton: 'Buscar',
  attendeeFound: (linkedAt, source) =>
    `✓ Asistente encontrado · registrado el ${linkedAt}${source ? ` · fuente: ${source}` : ''}`,
  cannotSend: (reason) => `No se puede enviar: ${reason}`,
  reasonNotInEvent: 'el destinatario no está registrado para este evento',
  reasonInvalidPhone: 'número de teléfono inválido',
  lookupError: (reason) => `Error de búsqueda: ${reason}`,

  amountLabel: 'Monto (USDC)',
  amountPlaceholder: 'Selecciona el monto…',
  hourCapFootnote: (remaining) => `Límite por hora restante: $${remaining}`,
  amountExceedsHourCap: (remaining) => `Excedería el límite por hora ($${remaining} restantes)`,

  sendingButton: 'Enviando…',
  confirmSend: (amount, masked) => `Confirma enviar $${amount} a ${masked} — vuelve a presionar`,
  sendCta: (amount, masked) => `Enviar $${amount} a ${masked}`,

  recentSendsHeading: 'Envíos recientes',
  noSendsYet: 'No hay envíos desde esta billetera todavía.',
  sendStatus: (status) => {
    switch (status) {
      case 'pending':
        return 'pendiente'
      case 'submitted':
        return 'enviado'
      case 'confirmed':
        return 'confirmado'
      case 'failed':
        return 'fallido'
      default:
        return status
    }
  },

  amountMustBePositive: 'El monto debe ser un número positivo',
  sendFailedFallback: 'El envío falló',
  networkError: 'error de red',
  dupFallback: 'El destinatario ya recibió un pago para este evento.',
  sendSuccessFlash: (amount, masked, txShort) =>
    `Enviaste $${amount} USDC a ${masked}. tx=${txShort}…`,
}

const operatorSendEn: OperatorSendStrings = {
  headTitle: 'Operator — Send',
  heading: 'Send to Attendee',
  eventLine: (name, slug) => `Event: ${name} · ${slug}`,
  noWalletSubtitle: 'No event wallet assigned. Contact admin.',

  walletLabel: 'Wallet',
  walletAddressCopyHint: 'Share this address to receive USDC on Arbitrum',
  walletAddressCopy: 'Copy',
  walletAddressCopied: 'Copied!',
  balanceLabel: 'Balance',
  balanceRpcUnavailable: 'RPC unavailable; balance unknown. Do NOT assume empty — retry shortly.',
  hourCapLabel: 'Hour cap remaining',
  spentLastHour: (amount) => `spent last hour: $${amount}`,

  noWalletHeading: 'No event wallet assigned',
  noWalletBodyPrefix: 'An admin must assign you to an event via ',
  noWalletBodySuffix: ' before you can send.',

  dupHeading: 'Recipient already received a payment for this event',
  dupDetail: (amount, status, id) =>
    `Previous send: $${amount} USDC · status: ${status} · id: ${id}`,
  dupWarning:
    'Only override if you verified the attendee did NOT receive the funds, or they handed over additional cash that warrants a second send.',
  dupSendAnyway: 'Send anyway',
  dupCancel: 'Cancel',

  recipientPhoneLabel: 'Recipient phone',
  lookupLoading: 'Looking up…',
  lookupButton: 'Lookup',
  attendeeFound: (linkedAt, source) =>
    `✓ Attendee found · linked at ${linkedAt}${source ? ` · source: ${source}` : ''}`,
  cannotSend: (reason) => `Cannot send: ${reason}`,
  reasonNotInEvent: 'recipient is not registered for this event',
  reasonInvalidPhone: 'invalid phone number',
  lookupError: (reason) => `Lookup error: ${reason}`,

  amountLabel: 'Amount (USDC)',
  amountPlaceholder: 'Select amount…',
  hourCapFootnote: (remaining) => `Hour cap remaining: $${remaining}`,
  amountExceedsHourCap: (remaining) => `Would exceed hourly cap ($${remaining} remaining)`,

  sendingButton: 'Sending…',
  confirmSend: (amount, masked) => `Confirm send $${amount} to ${masked} — click again`,
  sendCta: (amount, masked) => `Send $${amount} to ${masked}`,

  recentSendsHeading: 'Recent sends',
  noSendsYet: 'No sends yet from this wallet.',
  sendStatus: (status) => status,

  amountMustBePositive: 'Amount must be a positive number',
  sendFailedFallback: 'Send failed',
  networkError: 'network error',
  dupFallback: 'Recipient already received a payment for this event.',
  sendSuccessFlash: (amount, masked, txShort) =>
    `Sent $${amount} USDC to ${masked}. tx=${txShort}…`,
}

export function getOperatorSendStrings(lang: AdminLang): OperatorSendStrings {
  return lang === 'es' ? operatorSendEs : operatorSendEn
}

// ─────────────────────────────────────────────────────────────────────────────
// event_attendees.tsx (operator-facing portions; OperatorWalletPanel stays EN)
// ─────────────────────────────────────────────────────────────────────────────

interface EventAttendeesStrings {
  headTitle: (eventName: string) => string
  heading: string
  endsLabel: (date: string) => string
  inactiveTag: string
  onboardedSummary: (total: number) => string
  refresh: string

  // Stat cards
  statTotalOnboarded: string
  statStepDone: string
  statStepDoneSub: string
  statStepReturning: string
  statStepReturningSub: string
  statPoapsClaimed: string

  // By source
  bySourceHeading: string
  bySourceEmpty: string
  bySourceNone: string

  // Table
  thPhone: string
  thStep: string
  thSource: string
  thPoap: string
  thLinkedAt: string
  thSend: string
  stepLabel: (step: string | null) => string
  noAttendees: string
  sendButton: string
  sendAgainButton: string
  sentTotal: (amount: string) => string
  lastSent: (date: string) => string

  // Pagination
  pageOf: (page: number, total: number, perPage: number) => string
  prev: string
  next: string

  // JSON feed
  jsonFeedHint: (path: string) => string
}

const eventAttendeesEs: EventAttendeesStrings = {
  headTitle: (eventName) => `Asistentes — ${eventName}`,
  heading: 'Asistentes del evento',
  endsLabel: (date) => ` · termina ${date}`,
  inactiveTag: ' · INACTIVO',
  onboardedSummary: (total) => `${total} REGISTRADOS`,
  refresh: 'Refrescar',

  statTotalOnboarded: 'Total registrados',
  statStepDone: 'Paso: terminado (aquí)',
  statStepDoneSub: 'registrados en el evento',
  statStepReturning: 'Paso: regresando',
  statStepReturningSub: 'ya tenían billetera',
  statPoapsClaimed: 'POAPs reclamados',

  bySourceHeading: 'Por asistente / etiqueta de fuente',
  bySourceEmpty: 'No hay datos de atribución todavía.',
  bySourceNone: '(sin fuente)',

  thPhone: 'Teléfono',
  thStep: 'Paso',
  thSource: 'Fuente',
  thPoap: 'POAP',
  thLinkedAt: 'Registrado el',
  thSend: 'Enviar',
  stepLabel: (step) => {
    switch (step) {
      case 'done':
        return 'terminado'
      case 'returning':
        return 'regresando'
      default:
        return 'desconocido'
    }
  },
  noAttendees: 'Aún no hay asistentes.',
  sendButton: 'Enviar $',
  sendAgainButton: 'Enviar de nuevo',
  sentTotal: (amount) => `✓ $${amount} enviados`,
  lastSent: (date) => `Último envío: ${date}`,

  pageOf: (page, total, perPage) => `Página ${page} de ${total} · ${perPage} por página`,
  prev: 'Anterior',
  next: 'Siguiente',

  jsonFeedHint: (_path) => `Datos en JSON: enviar `,
}

const eventAttendeesEn: EventAttendeesStrings = {
  headTitle: (eventName) => `Attendees — ${eventName}`,
  heading: 'Event Attendees',
  endsLabel: (date) => ` · ends ${date}`,
  inactiveTag: ' · INACTIVE',
  onboardedSummary: (total) => `${total} ONBOARDED`,
  refresh: 'Refresh',

  statTotalOnboarded: 'Total onboarded',
  statStepDone: 'Step: done (here)',
  statStepDoneSub: 'onboarded at the event',
  statStepReturning: 'Step: returning',
  statStepReturningSub: 'already had a wallet',
  statPoapsClaimed: 'POAPs claimed',

  bySourceHeading: 'By assistant / source tag',
  bySourceEmpty: 'No attribution data yet.',
  bySourceNone: '(no source)',

  thPhone: 'Phone',
  thStep: 'Step',
  thSource: 'Source',
  thPoap: 'POAP',
  thLinkedAt: 'Linked at',
  thSend: 'Send',
  stepLabel: (step) => step ?? 'unknown',
  noAttendees: 'No attendees yet.',
  sendButton: 'Send $',
  sendAgainButton: 'Send again',
  sentTotal: (amount) => `✓ $${amount} sent`,
  lastSent: (date) => `Last send: ${date}`,

  pageOf: (page, total, perPage) => `Page ${page} of ${total} · ${perPage} per page`,
  prev: 'Prev',
  next: 'Next',

  jsonFeedHint: (_path) => `JSON feed: send `,
}

export function getEventAttendeesStrings(lang: AdminLang): EventAttendeesStrings {
  return lang === 'es' ? eventAttendeesEs : eventAttendeesEn
}

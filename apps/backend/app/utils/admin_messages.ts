/**
 * Bilingual error strings returned by the operator-admin JSON endpoints.
 *
 * The operator pages render these in the localFlash alert when the
 * controller returns a non-200 response with `{ error: '...' }`. Keeping
 * them server-side ensures the wire payload itself is already localized,
 * so the React layer just renders `body.error` without an extra
 * translation step.
 *
 * Default language is `es` (LatAm operators). The bundle is enum-keyed so
 * a typo at a call site is a compile-time error.
 */

import type { AdminLang } from '#utils/admin_lang'

export const adminErrors = {
  noEventWallet: (lang: AdminLang) =>
    lang === 'es'
      ? 'No tienes una billetera de evento asignada a esta cuenta'
      : 'No event wallet assigned to this account',

  eventWalletRevoked: (lang: AdminLang) =>
    lang === 'es' ? 'La billetera del evento fue revocada' : 'Event wallet is revoked',

  invalidRequestBody: (lang: AdminLang) =>
    lang === 'es' ? 'Cuerpo de solicitud inválido' : 'Invalid request body',

  invalidRecipientPhone: (lang: AdminLang) =>
    lang === 'es' ? 'Teléfono del destinatario inválido' : 'Invalid recipient phone',

  recipientNotInEvent: (lang: AdminLang) =>
    lang === 'es'
      ? 'El destinatario no está registrado para este evento'
      : 'Recipient is not registered for this event',

  recipientWalletNotFound: (lang: AdminLang) =>
    lang === 'es'
      ? 'No se encontró la billetera del destinatario'
      : 'Recipient wallet not found (phone_registry row missing)',

  /** Per-transaction cap exceeded. `cap` is the configured ceiling in USDC. */
  amountExceedsPerTxCap: (cap: number, lang: AdminLang) =>
    lang === 'es'
      ? `El monto excede el límite por transacción de $${cap} USDC`
      : `Amount exceeds per-transaction cap of $${cap} USDC`,

  failedToReserveSendSlot: (lang: AdminLang) =>
    lang === 'es'
      ? 'No se pudo reservar el envío. Inténtalo de nuevo.'
      : 'Failed to reserve send slot',

  /** Hourly cap exceeded. Both `spent` and `attempted` are USDC amounts. */
  hourlyCapExceeded: (cap: number, spent: number, attempted: number, lang: AdminLang) =>
    lang === 'es'
      ? `Se excedió el límite por hora de $${cap} USDC (gastado: ${spent}, intentado: ${attempted})`
      : `Hourly cap of $${cap} USDC exceeded (spent: ${spent}, attempted: ${attempted})`,

  /** Duplicate-recipient guard. The UI has its own panel for this, but
   *  the wire string still goes back via `err.message` for logging/parity. */
  duplicateRecipient: (
    args: { amount: string; eventSlug: string; status: string; sendId: string | number },
    lang: AdminLang
  ) =>
    lang === 'es'
      ? `El destinatario ya recibió $${args.amount} USDC para el evento '${args.eventSlug}' (estado=${args.status}, envío id=${args.sendId}). Pasa override=true para forzar un re-envío.`
      : `Recipient already received $${args.amount} USDC for event '${args.eventSlug}' (status=${args.status}, send id=${args.sendId}). Pass override=true to force a re-send.`,

  /** Submit-phase failure. The raw provider error stays in the payload as
   *  `detail` for ops/debugging — only the human-readable headline is
   *  translated, since the underlying string is provider-shaped English. */
  submitFailed: (reason: string, lang: AdminLang) =>
    lang === 'es'
      ? `Falló el envío antes de enviarse a la red (seguro reintentar): ${reason}`
      : `Send failed before broadcast (safe to retry): ${reason}`,

  /** CDP SDK returned no userOpHash — manual reconciliation required. */
  cdpNoUserOpHash: (lang: AdminLang) =>
    lang === 'es'
      ? 'El proveedor no devolvió el hash de la operación. El registro quedó en pendiente — NO reintentes. Contacta a un admin para reconciliar contra Arbiscan.'
      : 'CDP returned no userOpHash. Row marked pending — DO NOT retry. Contact admin to reconcile against Arbiscan.',

  /** Wait-phase note: userOp completed but the on-chain call reverted. */
  walletNoteReverted: (lang: AdminLang) =>
    lang === 'es'
      ? 'La transacción se ejecutó pero revirtió on-chain — el destinatario NO recibió USDC. El registro queda como "submitted" (no reintentes sin reconciliación de un admin). Verifica el hash en el explorador.'
      : 'userOp completed but reverted on-chain — recipient did NOT receive USDC. Audit row left as "submitted" (do not retry without admin reconciliation). Check the userOp hash on the explorer.',

  /** Wait-phase note: timeout (userOp still in flight, recipient may or may not get the USDC). */
  walletNoteTimeout: (lang: AdminLang) =>
    lang === 'es'
      ? 'Transacción enviada pero la confirmación se tardó. Verifica el hash en el explorador o refresca en unos segundos.'
      : 'Transaction submitted but confirmation timed out. Check the userOp hash on the explorer or refresh in a few seconds.',
} as const

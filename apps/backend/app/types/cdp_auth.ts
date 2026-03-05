/**
 * CDP Auth type declarations
 *
 * Extends AdonisJS HttpContext with cdpUser property
 * populated by the CdpAuthMiddleware.
 */

declare module '@adonisjs/core/http' {
  interface HttpContext {
    cdpUser?: {
      phoneNumber: string
      walletAddress: string
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { zohoDesk } from '#services/zoho_desk.service'
import { findUserPrefByPhone } from '#utils/user_pref_lookup'
import { decryptEmail } from '#utils/email_crypto'

const ALLOWED_CATEGORIES = ['general', 'payments', 'account', 'other'] as const

/**
 * Shared validation for ticket fields.
 * Returns an error string or null if valid.
 */
function validateTicketFields(fields: {
  subject: unknown
  description: unknown
  email: unknown
}): string | null {
  const { subject, description, email } = fields
  if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
    return 'Subject is required'
  }
  if (subject.length > 255) {
    return 'Subject must be under 255 characters'
  }
  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    return 'Description must be at least 20 characters'
  }
  if (description.length > 5000) {
    return 'Description must be under 5000 characters'
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'Valid email is required'
  }
  return null
}

/**
 * Resolve the verified email for an authenticated user from the DB.
 * Returns the plaintext email or null if not found/not verified.
 */
async function resolveVerifiedEmail(phoneNumber: string): Promise<string | null> {
  try {
    const pref = await findUserPrefByPhone(phoneNumber)
    if (!pref?.emailVerified || !pref.emailEncrypted) return null
    const [iv, encrypted] = pref.emailEncrypted.split(':')
    return decryptEmail(encrypted, iv)
  } catch {
    return null
  }
}

export default class SupportController {
  /**
   * POST /api/support/tickets (authenticated)
   *
   * If the user has a verified email on file, that email is used for the ticket
   * regardless of what was submitted — prevents impersonation.
   * If no verified email exists, the request is rejected with 403.
   */
  async create(ctx: HttpContext) {
    const { request, response } = ctx
    const { subject, description, category } = request.body()
    const phone = ctx.cdpUser?.phoneNumber

    if (!phone) {
      return response.status(401).json({ error: 'Unauthorized' })
    }

    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return response.status(400).json({ error: 'Invalid category' })
    }

    const verifiedEmail = await resolveVerifiedEmail(phone)

    // Authenticated users MUST have a verified email to create tickets.
    // This prevents impersonation — we never trust user-supplied email.
    if (!verifiedEmail) {
      return response.status(403).json({
        error:
          'A verified email is required to submit support tickets. Please verify your email in Settings first.',
      })
    }

    const error = validateTicketFields({ subject, description, email: verifiedEmail })
    if (error) return response.status(400).json({ error })

    try {
      const ticket = await zohoDesk.createTicket({
        subject: subject.trim(),
        description: `[User: ${phone}]\n\n${description.trim()}`,
        email: verifiedEmail,
        category: category || undefined,
      })

      return response.status(201).json({
        success: true,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id,
      })
    } catch (err) {
      logger.error({ err }, 'Support ticket creation failed (authenticated)')
      return response.status(502).json({
        error: 'Unable to create support ticket. Please try again later.',
      })
    }
  }

  /**
   * POST /api/support/public-ticket (rate-limited, no auth)
   */
  async createPublic({ request, response }: HttpContext) {
    const { subject, description, email, category } = request.body()

    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return response.status(400).json({ error: 'Invalid category' })
    }

    const error = validateTicketFields({ subject, description, email })
    if (error) return response.status(400).json({ error })

    try {
      const ticket = await zohoDesk.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        email: email.trim().toLowerCase(),
        category: category || undefined,
      })

      return response.status(201).json({
        success: true,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id,
      })
    } catch (err) {
      logger.error({ err }, 'Support ticket creation failed (public)')
      return response.status(502).json({
        error: 'Unable to create support ticket. Please try again later.',
      })
    }
  }
}

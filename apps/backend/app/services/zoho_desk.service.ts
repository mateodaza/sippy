/**
 * Zoho Desk Service
 *
 * Handles creating and listing support tickets via Zoho Desk REST API.
 * Uses OAuth2 self-client flow with refresh token for auth.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com'
const ZOHO_DESK_API_URL = 'https://desk.zoho.com/api/v1'

const CLIENT_ID = env.get('ZOHO_DESK_CLIENT_ID', '')
const CLIENT_SECRET = env.get('ZOHO_DESK_CLIENT_SECRET', '')
const REFRESH_TOKEN = env.get('ZOHO_DESK_REFRESH_TOKEN', '')
const ORG_ID = env.get('ZOHO_DESK_ORG_ID', '')
const DEPARTMENT_ID = env.get('ZOHO_DESK_DEPARTMENT_ID', '')

// In-memory token cache
let cachedAccessToken: string | null = null
let tokenExpiresAt = 0
let refreshPromise: Promise<string> | null = null

function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && ORG_ID && DEPARTMENT_ID)
}

async function doTokenRefresh(): Promise<string> {
  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.error(`Zoho token refresh failed (${response.status}): ${text}`)
    throw new Error('Failed to refresh Zoho access token')
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  cachedAccessToken = data.access_token
  // Refresh 5 minutes before expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000
  return cachedAccessToken
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken
  }

  if (!refreshPromise) {
    refreshPromise = doTokenRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

function deskHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Zoho-oauthtoken ${accessToken}`,
    'orgId': ORG_ID,
    'Content-Type': 'application/json',
  }
}

export interface CreateTicketInput {
  subject: string
  description: string
  email: string
  category?: string
  priority?: 'Low' | 'Medium' | 'High'
}

export interface ZohoTicket {
  id: string
  ticketNumber: string
  subject: string
  status: string
  createdTime: string
}

async function findOrCreateContact(email: string, accessToken: string): Promise<string> {
  // Search for existing contact by email
  const searchRes = await fetch(
    `${ZOHO_DESK_API_URL}/contacts/search?email=${encodeURIComponent(email)}&limit=1`,
    { method: 'GET', headers: deskHeaders(accessToken) }
  )

  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as { data?: { id: string }[] }
    if (searchData.data && searchData.data.length > 0) {
      return searchData.data[0].id
    }
  }

  // Create new contact
  const createRes = await fetch(`${ZOHO_DESK_API_URL}/contacts`, {
    method: 'POST',
    headers: deskHeaders(accessToken),
    body: JSON.stringify({ lastName: email.split('@')[0], email }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    logger.error(`Zoho create contact failed (${createRes.status}): ${text}`)
    throw new Error('Failed to create support contact')
  }

  const contact = (await createRes.json()) as { id: string }
  logger.info(`Zoho contact created: ${contact.id}`)
  return contact.id
}

async function createTicket(input: CreateTicketInput): Promise<ZohoTicket> {
  if (!isConfigured()) {
    throw new Error('Zoho Desk is not configured')
  }

  const accessToken = await getAccessToken()
  const contactId = await findOrCreateContact(input.email, accessToken)

  const body: Record<string, string> = {
    subject: input.subject,
    description: input.description,
    email: input.email,
    contactId,
    departmentId: DEPARTMENT_ID,
  }
  if (input.category) body.category = input.category
  if (input.priority) body.priority = input.priority

  logger.info(`Creating Zoho Desk ticket: "${input.subject}"`)

  const response = await fetch(`${ZOHO_DESK_API_URL}/tickets`, {
    method: 'POST',
    headers: deskHeaders(accessToken),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.error(`Zoho create ticket failed (${response.status}): ${text}`)
    throw new Error('Failed to create support ticket')
  }

  const ticket = (await response.json()) as ZohoTicket
  logger.info(`Zoho ticket created: #${ticket.ticketNumber} (${ticket.id})`)
  return ticket
}

export const zohoDesk = { createTicket }

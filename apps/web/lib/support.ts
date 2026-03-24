async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body && body.error) return body.error
  } catch {
    // ignore parse errors
  }
  return response.statusText || String(response.status)
}

export interface CreateTicketResult {
  success: boolean
  ticketNumber: string
  ticketId: string
}

export async function createSupportTicket(
  data: {
    subject: string
    description: string
    email: string
    category?: string
  },
  token?: string | null
): Promise<CreateTicketResult> {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const endpoint = token
    ? `${BACKEND_URL}/api/support/tickets`
    : `${BACKEND_URL}/api/support/public-ticket`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }

  return response.json()
}

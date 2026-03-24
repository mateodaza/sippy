# Zoho Desk Integration Plan

Support ticketing for Sippy using Zoho Desk Free plan + custom form components.

## Status

| Phase | Description                      | Status                   |
| ----- | -------------------------------- | ------------------------ |
| 0     | Zoho account + OAuth setup       | **Manual — in progress** |
| 1     | Backend service + controller     | **Done**                 |
| 2     | Frontend form + page integration | **Done**                 |
| 3     | i18n (en/es/pt)                  | **Done**                 |
| 4     | Testing & verification           | Pending Phase 0          |

> Phase 4 is blocked until Phase 0 is complete (env vars needed to test against Zoho API).

---

## Zoho Desk Free Plan Summary

| Detail             | Value               |
| ------------------ | ------------------- |
| Cost               | $0 / forever        |
| Agents             | 3                   |
| API credits        | 5,000 / day         |
| Email channel      | 1                   |
| Web form           | 1                   |
| Custom fields      | 10 per module       |
| Ticket tags        | 10 per ticket       |
| Custom statuses    | Yes                 |
| Contact management | Yes                 |
| Mobile app         | Yes                 |
| ASAP widget        | No (Standard+ only) |
| Knowledge base     | No                  |
| Automations / SLAs | No                  |
| Webhooks           | No                  |

**Why custom form instead of widget:** The ASAP embeddable widget requires Standard plan ($14/agent/mo, 5 agent min = $70/mo). Instead, we build a simple form that calls the Zoho Desk REST API to create tickets. $0 cost, same result.

---

## Architecture

```
User fills <SupportForm />
       |
       v
Next.js frontend
       | POST /api/support/tickets
       v
AdonisJS backend (zoho_desk.service.ts)
       | POST https://desk.zoho.com/api/v1/tickets
       v
Zoho Desk (free plan)
       |
       v
Agent sees ticket in Zoho Desk dashboard
Agent replies --> user gets email notification
```

---

## Phase 0: Zoho Account Setup (Manual)

> **Owner:** You (manual, one-time, ~15 min)

### Step 1: Create Zoho Desk account

1. Go to https://www.zoho.com/desk/ and sign up for the **Free** plan
2. Complete onboarding — set org name, support email, timezone
3. Note your **orgId** (found in Setup > Developer Space > API)
4. Note your default **departmentId** (found in Setup > Departments)

### Step 2: Register OAuth Self Client

1. Go to https://api-console.zoho.com/
2. Click **Add Client** > choose **Self Client**
3. Copy the **Client ID** and **Client Secret**

### Step 3: Generate Refresh Token

1. In the Self Client, click **Generate Code** tab
2. Enter scopes:
   ```
   Desk.tickets.CREATE,Desk.tickets.READ,Desk.contacts.CREATE,Desk.contacts.READ,aaaserver.profile.READ
   ```
3. Set duration: 10 minutes
4. Click **Generate** and copy the grant code
5. Exchange for tokens via curl:
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=YOUR_GRANT_CODE"
   ```
6. Save the `refresh_token` from the response (it never expires)

### Step 4: Collect values for .env

After completing the steps above, you'll have:

```
ZOHO_DESK_CLIENT_ID=1000.XXXXXXXXXXXX
ZOHO_DESK_CLIENT_SECRET=XXXXXXXXXXXX
ZOHO_DESK_REFRESH_TOKEN=1000.XXXXXXXXXXXX
ZOHO_DESK_ORG_ID=12345678
ZOHO_DESK_DEPARTMENT_ID=12345678
```

---

## Phase 1: Backend — Zoho Desk Service & API Route

### 1.1 Environment variables

**File:** `apps/backend/start/env.ts`

Add to the Env schema:

```typescript
ZOHO_DESK_CLIENT_ID: Env.schema.string.optional(),
ZOHO_DESK_CLIENT_SECRET: Env.schema.string.optional(),
ZOHO_DESK_REFRESH_TOKEN: Env.schema.string.optional(),
ZOHO_DESK_ORG_ID: Env.schema.string.optional(),
ZOHO_DESK_DEPARTMENT_ID: Env.schema.string.optional(),
```

Also add to `.env` and `.env.example` with the values from Phase 0.

### 1.2 Zoho Desk service

**File:** `apps/backend/app/services/zoho_desk.service.ts`

Responsibilities:

- **Token management:** Use the refresh token to obtain short-lived access tokens (1hr). Cache the access token in memory and refresh when expired.
- **Create ticket:** `POST https://desk.zoho.com/api/v1/tickets`
- **Get ticket:** `GET https://desk.zoho.com/api/v1/tickets/{ticketId}`
- **List tickets by email:** `GET https://desk.zoho.com/api/v1/tickets?email={email}`

Token refresh endpoint:

```
POST https://accounts.zoho.com/oauth/v2/token
  grant_type=refresh_token
  client_id={ZOHO_DESK_CLIENT_ID}
  client_secret={ZOHO_DESK_CLIENT_SECRET}
  refresh_token={ZOHO_DESK_REFRESH_TOKEN}
```

Create ticket request:

```
POST https://desk.zoho.com/api/v1/tickets
Headers:
  Authorization: Zoho-oauthtoken {access_token}
  orgId: {ZOHO_DESK_ORG_ID}
  Content-Type: application/json

Body:
{
  "subject": "string (required)",
  "description": "string",
  "departmentId": "{ZOHO_DESK_DEPARTMENT_ID}",
  "email": "user@example.com",
  "contactId": "string (optional)",
  "priority": "Low | Medium | High",
  "category": "string (optional)"
}
```

Pattern: Follow `apps/backend/app/services/whatsapp.service.ts` — uses `fetch()` with auth headers, structured payloads, and error handling.

### 1.3 Support controller

**File:** `apps/backend/app/controllers/support_controller.ts`

Endpoints:

| Method | Path                 | Auth     | Description                  |
| ------ | -------------------- | -------- | ---------------------------- |
| POST   | /api/support/tickets | JWT auth | Create a new support ticket  |
| GET    | /api/support/tickets | JWT auth | List user's tickets by email |

**POST /api/support/tickets**

Request body:

```json
{
  "subject": "Can't send payment",
  "description": "Detailed description of the issue...",
  "email": "user@example.com",
  "category": "payments" // optional
}
```

Validation:

- `subject`: required, string, max 255 chars
- `description`: required, string, max 5000 chars
- `email`: required, valid email format
- `category`: optional, enum of predefined categories

Response (success):

```json
{
  "success": true,
  "ticketNumber": "101",
  "ticketId": "36277000005553005"
}
```

**GET /api/support/tickets**

- Reads the user's email from JWT claims or request query
- Calls Zoho Desk API to list tickets filtered by email
- Returns simplified list

Response:

```json
{
  "tickets": [
    {
      "ticketNumber": "101",
      "subject": "Can't send payment",
      "status": "Open",
      "createdAt": "2026-03-24T10:00:00Z"
    }
  ]
}
```

### 1.4 Route registration

**File:** `apps/backend/start/routes.ts`

Add inside the JWT-authenticated group:

```typescript
router.post('/support/tickets', [SupportController, 'create'])
router.get('/support/tickets', [SupportController, 'list'])
```

Also add a **public** endpoint for the landing page (unauthenticated users):

```typescript
router
  .post('/api/support/public-ticket', [SupportController, 'createPublic'])
  .use(middleware.ipThrottle())
```

The public endpoint requires `email` + `subject` + `description` and is rate-limited by IP (no JWT needed). This is for the landing page where visitors may not be logged in.

---

## Phase 2: Frontend — Support Form Component

### 2.1 API client

**File:** `apps/web/lib/support.ts`

Follow the pattern in `apps/web/lib/auth.ts`:

```typescript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export async function createSupportTicket(
  data: {
    subject: string
    description: string
    email: string
    category?: string
  },
  token?: string
): Promise<{ ticketNumber: string }> {
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
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to create ticket')
  }

  return response.json()
}
```

### 2.2 SupportForm component

**File:** `apps/web/components/shared/SupportForm.tsx`

Props:

```typescript
interface SupportFormProps {
  userEmail?: string // pre-fill if logged in
  authToken?: string // JWT if logged in, undefined if public
  lang: 'en' | 'es' | 'pt'
  variant: 'landing' | 'settings' // controls styling
}
```

Fields:

- **Email** — text input, pre-filled + editable if logged in, required if public
- **Subject** — text input with placeholder suggestions
- **Category** — select dropdown: General, Payments, Account, Other
- **Description** — textarea, min 20 chars

States:

- `idle` — form visible
- `submitting` — button disabled, spinner
- `success` — show confirmation with ticket number
- `error` — show error message, allow retry

Styling: Tailwind CSS, follow existing component patterns (see `ChannelPicker.tsx`).

i18n: Use the existing `t()` translation function for labels.

### 2.3 Landing page integration

**File:** `apps/web/app/page.tsx`

Add a "Need Help?" section near the bottom of the page (before footer area):

```tsx
<section className="relative py-16 sm:py-24 px-4 sm:px-8">
  <ScrollReveal>
    <h2>Need Help?</h2>
    <p>Submit a support request and we'll get back to you via email.</p>
    <SupportForm lang={lang} variant="landing" />
  </ScrollReveal>
</section>
```

This uses the **public** endpoint (no auth required).

### 2.4 Settings page integration

**File:** `apps/web/app/settings/page.tsx`

Add a "Support" section within the existing settings layout:

```tsx
<div className="space-y-4">
  <h3>Support</h3>
  <SupportForm userEmail={user.email} authToken={token} lang={lang} variant="settings" />
</div>
```

This uses the **authenticated** endpoint (JWT from logged-in session). Email is pre-filled from the user's profile.

---

## Phase 3: i18n

### 3.1 Translation keys

Add to existing translation files (en, es, pt):

```json
{
  "support.title": "Need Help?",
  "support.subtitle": "Submit a request and we'll respond via email.",
  "support.email": "Your email",
  "support.subject": "Subject",
  "support.category": "Category",
  "support.category.general": "General",
  "support.category.payments": "Payments",
  "support.category.account": "Account",
  "support.category.other": "Other",
  "support.description": "Describe your issue",
  "support.submit": "Send",
  "support.submitting": "Sending...",
  "support.success.title": "Ticket created!",
  "support.success.message": "Ticket #{number} — we'll respond to your email.",
  "support.error": "Something went wrong. Please try again."
}
```

---

## Phase 4: Testing & Verification

### 4.1 Backend tests

- Unit test `zoho_desk.service.ts` — mock Zoho API responses, test token refresh logic
- Integration test `support_controller.ts` — test validation, error responses, success path

### 4.2 Manual E2E test

1. Fill form on landing page (unauthenticated) -> ticket appears in Zoho Desk dashboard
2. Fill form on settings page (authenticated) -> ticket appears with user's email
3. Reply from Zoho Desk dashboard -> user receives email response
4. Submit with missing fields -> validation errors shown
5. Submit when Zoho API is down -> graceful error message

### 4.3 Build verification

```bash
pnpm turbo build   # both apps build
pnpm turbo test    # all tests pass
```

---

## Files Changed / Created

| Action | File                                                 | Phase |
| ------ | ---------------------------------------------------- | ----- |
| Edit   | `apps/backend/start/env.ts`                          | 1     |
| Edit   | `apps/backend/.env`                                  | 1     |
| Create | `apps/backend/app/services/zoho_desk.service.ts`     | 1     |
| Create | `apps/backend/app/controllers/support_controller.ts` | 1     |
| Edit   | `apps/backend/start/routes.ts`                       | 1     |
| Create | `apps/web/lib/support.ts`                            | 2     |
| Create | `apps/web/components/shared/SupportForm.tsx`         | 2     |
| Edit   | `apps/web/app/page.tsx`                              | 2     |
| Edit   | `apps/web/app/settings/page.tsx`                     | 2     |
| Edit   | i18n translation files (en, es, pt)                  | 3     |

---

## Assumptions & Decisions

- **No local DB table for tickets.** Zoho Desk is the source of truth. We don't duplicate ticket data in Postgres — we just proxy through the API. This keeps it simple and avoids sync issues.
- **No webhooks.** The free plan doesn't support Zoho webhooks, so we can't get real-time updates. Users check ticket status via the GET endpoint or just wait for the email reply.
- **Public endpoint is IP-throttled** to prevent spam. The authenticated endpoint relies on JWT for identity.
- **Token caching:** The Zoho access token is cached in-memory with a TTL of ~55 minutes (tokens last 1hr). On cold start or expiry, the service refreshes automatically using the refresh token.
- **Categories are hardcoded** for now (General, Payments, Account, Other). Can expand later without schema changes since Zoho supports custom fields.

# Operator Flow — Implementation Plan

**Status:** Approved, ready to implement.
**Branch:** current (`feat_event_onboarding` or whatever follows).
**Target ship:** before Pizza Day Cartagena 2026 (May 22).

---

## Goal

Enable event staff ("operators") to send USDC to attendees who successfully onboarded at the event, via a web admin page — replacing the current manual WhatsApp-send-from-exchange-phone workflow.

Each event has **one operator wallet**, server-custodied via CDP, controlled by a single admin account login. The operator UI is a strict-scope role: they see only their event's attendees + QRs + send page, nothing else.

---

## Lock decisions (do not relitigate)

| #   | Decision                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | **Initial funding** of operator wallet = external (Sippy/event ops moves USDC on-chain manually). No code path needed.                                                                                                                                  |
| 2   | **Drain post-event** = admin endpoint `POST /admin/events/:slug/operator-wallet/drain`. Mandatory policy: **never delete** rows from `event_operator_wallets` — only flip `active=false`. This preserves `cdp_account_name`, which is the recovery key. |
| 3   | `active=false` only disables the send endpoint. CDP wallet keeps existing. Re-activating = flip true.                                                                                                                                                   |
| 4   | One operator login per event, physically controlled. PK on `(event_slug)` in `event_operator_wallets` enforces 1:1. No multi-operator-per-event.                                                                                                        |
| 5   | Operator role is **strict-scope**: hidden from all admin views except its own send page, the assigned event's attendees, and the assigned event's QR sheets.                                                                                            |
| 6   | **Allowlist** middleware pattern: every admin route gets an explicit `adminRole({role:'admin'                                                                                                                                                           | 'operator'})` gate. No route relies on "absence of middleware" to be admin-only. |
| 7   | Onboarding → `user_event_links` chain is already implemented (web `/setup` flow + WhatsApp bracket-handler both write rows). No changes to that flow.                                                                                                   |
| 8   | Each row in the admin attendees table shows a **per-attendee Send/Sent affordance**. Boolean derived from `EXISTS operator_sends WHERE (event_slug, to_phone) AND status IN ('submitted','confirmed')`.                                                 |

---

## How CDP wallets work (recap)

Sippy backend already provisions a CDP smart account for its master spender ([`getSippySpenderAccount`](apps/backend/app/services/embedded_wallet.service.ts) at line ~101). Same pattern, per operator per event:

```ts
const ownerName = `event-${eventSlug}-op-${operatorId}-owner` // EOA name
const acctName = `event-${eventSlug}-op-${operatorId}` // Smart account name

const owner = await cdp.evm.getOrCreateAccount({ name: ownerName })
const smart = await cdp.evm.getOrCreateSmartAccount({ name: acctName, owner })
// smart.address is the on-chain destination admin funds externally
```

**Key invariants:**

- `getOrCreate*` is idempotent on `name`. Same name → same wallet, forever.
- Names are the **recovery keys**. Persisted in `event_operator_wallets.cdp_account_name` + `.cdp_owner_name`.
- CDP holds the private keys. Sippy backend authorizes operations via `CDP_API_KEY_*` + `CDP_WALLET_SECRET` env vars (already configured for the spender wallet).
- Operators never touch keys. They trigger endpoints; the backend signs via CDP.

**Sending USDC from the operator wallet:**

```ts
await cdp.evm.sendUserOperation({
  smartAccount: smart,
  network: getCdpNetwork(), // 'arbitrum' typically
  calls: [
    {
      to: getUsdcAddress(),
      abi: USDC_ERC20_ABI,
      functionName: 'transfer',
      args: [recipientAddress, parseUnits(amountUsdc.toString(), 6)],
    },
  ],
})
```

ERC-4337 user op. Bundler/paymaster covers gas. CDP returns `transactionHash`.

**Draining** (anytime, no urgency): same `sendUserOperation` with `args=[treasuryAddress, totalBalance]`. Re-hydrate the wallet handle by reading `cdp_account_name` + `cdp_owner_name` from the DB row.

---

## Existing flow audit ✅

### Onboarding → `user_event_links` already wired

**Path A — Web setup** (`/setup?event=...&source=...`):

1. User completes phone → OTP → wallet → email → ToS → permission → `done`
2. At `done` step, `setup/page.tsx` calls `linkEvent(slug, token, 'done', source)`
3. Backend `event.service.ts:linkUserToEvent()` inserts into `user_event_links` with `ON CONFLICT DO NOTHING` (first-contact-wins source attribution)

**Path B — WhatsApp bracket-handler** (post-onboarding scan of an event QR):

1. User scans QR → wa.me with `[shortId]` → bot receives
2. `bracket_token.service.ts:dispatchBracketToken` extracts shortId, looks up `qr_links`, calls `linkUserToEvent(phone, slug, 'returning', sourceTag)`
3. Same idempotent insert

**Admin endpoint**: `GET /admin/events/:slug/attendees` (`events_controller.ts`) returns paginated list from `user_event_links` with counts by step, by source, POAP claim split. Inertia page renders it. **Already shipped, 7 tests.**

What this plan adds is JOIN against `operator_sends` to surface the "sent / not sent" status per attendee row.

---

## Architecture

### 1. Schema — one migration

**File**: `apps/backend/database/migrations/0020_add_operator_role_and_wallets.ts`

```sql
-- A. event_operator_wallets — one row per event, references the admin_user
--    who logs in as the operator + the CDP wallet handle.
--    PK on event_slug enforces 1:1 (decision #4).
CREATE TABLE event_operator_wallets (
  event_slug       TEXT PRIMARY KEY REFERENCES events(slug) ON DELETE CASCADE,
  operator_user_id INTEGER NOT NULL REFERENCES admin_users(id),

  wallet_address   TEXT NOT NULL,                    -- 0x... smart account
  cdp_account_name TEXT NOT NULL UNIQUE,             -- recovery key (smart account name)
  cdp_owner_name   TEXT NOT NULL,                    -- EOA owner name

  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_operator_wallets_op ON event_operator_wallets(operator_user_id);

-- B. operator_sends — append-only audit log of every send attempt.
--    Recipient FK ensures we only log sends to known phones.
CREATE TABLE operator_sends (
  id              BIGSERIAL PRIMARY KEY,
  operator_id     INTEGER NOT NULL REFERENCES admin_users(id),
  event_slug      TEXT NOT NULL REFERENCES events(slug),

  from_address    TEXT NOT NULL,                     -- denormalized (immutable audit)
  to_phone        TEXT NOT NULL REFERENCES user_preferences(phone_number),
  to_address      TEXT NOT NULL,                     -- resolved at send time

  amount_usdc     NUMERIC(18,6) NOT NULL,
  tx_hash         TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pending','submitted','confirmed','failed')),
  error_reason    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_operator_sends_event_time ON operator_sends(event_slug, created_at DESC);
CREATE INDEX idx_operator_sends_to_phone ON operator_sends(to_phone);
CREATE INDEX idx_operator_sends_operator_time ON operator_sends(operator_id, created_at DESC);
```

**No DDL change** to `admin_users` — the `role` column is `varchar(20)` with no CHECK; we just start writing `'operator'` and update the TS union.

### 2. Model updates

- `AdminUser` model: `role: 'admin' | 'viewer' | 'operator'`
- New models (optional, can use raw queries):
  - `EventOperatorWallet`
  - `OperatorSend`

### 3. New service: `apps/backend/app/services/operator_wallet.service.ts`

Public API:

```ts
provisionOperatorWallet({ operatorId, eventSlug })
  : Promise<{ walletAddress, cdpAccountName, rowId }>
  // Idempotent. If row exists for event_slug, returns existing (no CDP re-create).
  // Otherwise creates CDP EOA owner + smart account, INSERTs DB row.

getOperatorWalletForOperator({ operatorUserId })
  : Promise<EventOperatorWallet | null>
  // Returns the single active event wallet for an operator (used by operator dashboard).

getOperatorWalletForEvent({ eventSlug })
  : Promise<EventOperatorWallet | null>
  // Returns the wallet for an event regardless of operator (used by admin views).

rehydrateSmartAccount(row: EventOperatorWallet): Promise<SmartAccount>
  // Re-creates the CDP handle from stored cdp_account_name + cdp_owner_name.
  // Idempotent via CDP's getOrCreate semantics.

sendUsdcFromOperatorWallet({ wallet, toAddress, amountUsdc })
  : Promise<{ txHash }>
  // Direct ERC20 transfer from operator wallet (no spend permission needed —
  // the wallet HOLDS its float directly).

drainOperatorWallet({ wallet, destinationAddress })
  : Promise<{ txHash, amountSent }>
  // Same mechanic but sends full balance.

getOperatorWalletBalance(walletAddress): Promise<number>
  // On-chain USDC balance read.
```

Errors are caught and logged; never throw on read paths. Send/drain may throw and are wrapped by the controller in `operator_sends.status='failed'`.

### 4. Controllers

**Extend** `apps/backend/app/controllers/admin/events_controller.ts`:

```ts
// Existing: attendees(...) — extend the SELECT with a LEFT JOIN against
// operator_sends to populate per-attendee `operatorSend.sent` boolean.
//
// New methods:
assignOperator({ params, request }) // POST /admin/events/:slug/operator
revokeOperator({ params }) // DELETE /admin/events/:slug/operator
drainOperatorWallet({ params, request }) // POST /admin/events/:slug/operator-wallet/drain
```

**Scope check** added to `attendees`: if `auth.user.role === 'operator'`, verify the requested `:slug` matches the operator's assigned event. 403 otherwise.

**New** `apps/backend/app/controllers/admin/operator_send_controller.ts`:

```ts
showSend({ inertia, auth }) // GET /admin/operator/send — renders the page
validateRecipient({ params, auth }) // GET /admin/operator/recipient/:phone — JSON
send({ request, auth }) // POST /admin/operator/send — execute
```

The `send` method does:

1. Resolve operator's assigned event wallet (404/400 if none)
2. Validate body (`recipientPhone`, `amountUsdc`) via vine
3. Validate recipient: `user_event_links` row exists for `(operator's event_slug, recipientPhone)` → 400 if not
4. Resolve recipient wallet address from `user_preferences`
5. Per-tx + per-hour cap checks
6. `INSERT operator_sends` (status='pending')
7. Call `sendUsdcFromOperatorWallet(...)`
8. `UPDATE operator_sends` with tx_hash + status='submitted' (or 'failed' + error_reason)
9. Return JSON `{success, txHash, sendId}`

**Modify** `apps/backend/app/controllers/admin/qr_sheets_controller.ts`:

- Add scope check in `show()`: operator can only view their assigned event's slug.

**Modify** `apps/backend/app/controllers/admin/auth_controller.ts`:

- Post-login redirect: if `role === 'operator'` → `/admin/operator/send`. Else current behavior.

### 5. Authorization layer (3 capas)

**Capa 1 — Middleware extension**

`apps/backend/app/middleware/admin_role_middleware.ts`:

```ts
async handle(ctx, next, options: { role: 'admin' | 'operator' }) {
  const user = ctx.auth.user!
  if (options.role === 'admin' && user.role !== 'admin') {
    logger.warn({ user_id: user.id, role: user.role, path: ctx.request.url() },
      'admin_role: 403 admin-only')
    return reject(403)
  }
  if (options.role === 'operator' && !['operator', 'admin'].includes(user.role)) {
    logger.warn({ user_id: user.id, role: user.role, path: ctx.request.url() },
      'admin_role: 403 operator-or-admin')
    return reject(403)
  }
  return next()
}
```

Admin can do anything an operator can (superset). Specifying `operator` allows both. Specifying `admin` allows only admin.

**Capa 2 — Allowlist routes**

`apps/backend/start/routes.ts`: every existing admin route gets explicit `.use(middleware.adminRole({role: 'admin'}))`. Operator-friendly routes get `.use(middleware.adminRole({role: 'operator'}))`. No route relies on "absence of middleware" to be admin-only — chance of leaking a new admin page to operators is eliminated.

Operator-accessible routes:

```
GET    /admin/operator/send
GET    /admin/operator/recipient/:phone
POST   /admin/operator/send
GET    /admin/qr-sheets/:eventSlug         (scope-checked)
GET    /admin/events/:slug/attendees       (scope-checked)
POST   /admin/logout                       (no role gate — any authed user)
```

All other admin routes: `adminRole({role: 'admin'})`.

**Capa 3 — Controller scope check**

For routes that operator CAN hit but only for their event (`qr-sheets/:slug`, `events/:slug/attendees`), the controller verifies `:slug === user's assigned event slug`:

```ts
if (user.role === 'operator') {
  const assigned = await db
    .from('event_operator_wallets')
    .where({ operator_user_id: user.id, active: true })
    .first()
  if (!assigned || assigned.event_slug !== params.slug) {
    return response.forbidden({ error: 'Not authorized for this event' })
  }
}
// admin passes freely
```

### 6. Inertia layout (nav hiding)

`apps/backend/app/middleware/inertia_middleware.ts` — extend shared props with `assignedEventSlug` for operators:

```ts
async shared(ctx) {
  const user = ctx.auth.user
  let assignedEventSlug: string | null = null
  if (user?.role === 'operator') {
    const row = await db.from('event_operator_wallets')
      .where({ operator_user_id: user.id, active: true })
      .first()
    assignedEventSlug = row?.event_slug ?? null
  }
  return {
    auth: { user: { ...user.serialize(), assignedEventSlug } },
    // ...existing shared props
  }
}
```

`apps/backend/inertia/layouts/admin_layout.tsx` — role-conditional nav:

```tsx
const { user } = usePage().props.auth

if (user.role === 'operator') {
  const slug = user.assignedEventSlug
  return (
    <nav>
      <Link href="/admin/operator/send">Send</Link>
      {slug && <Link href={`/admin/events/${slug}/attendees`}>Attendees</Link>}
      {slug && <Link href={`/admin/qr-sheets/${slug}`}>QR Sheets</Link>}
      <form method="POST" action="/admin/logout">
        <button>Logout</button>
      </form>
      {!slug && <Banner>No event assigned — contact admin</Banner>}
    </nav>
  )
}

return <CurrentAdminNav /> // unchanged
```

### 7. Inertia pages

**New**: `apps/backend/inertia/pages/admin/operator_send.tsx`

Layout:

```
┌─────────────────────────────────────────────┐
│ Send to Attendee                             │
│ Event: Pizza Day Cartagena 2026              │
│ Wallet: 0xAB...CD  Balance: $483.20          │
├─────────────────────────────────────────────┤
│ Recipient phone:                             │
│ [+57 _________ ] [Lookup]                    │
│                                              │
│ ✓ Attendee found · linked at 14:30 ·         │
│   source: asst-carolina                      │
│                                              │
│ Amount (USDC): [ ___ ]                       │
│ [ Send $X to +57***NN ]                      │
├─────────────────────────────────────────────┤
│ This hour: $35 / $500                        │
│ Recent: 5 sends, last 12 min ago             │
└─────────────────────────────────────────────┘
```

States:

- Lookup pending → "Attendee found" or "Attendee NOT in event — cannot send" (red)
- Send button first click → swaps to "Confirm send to +57\*\*\*NN?" → second click executes
- Success: green flash, form resets, recent sends list updates
- Failure: red flash with error, form preserved (retry)

Pre-fill: if `?to=<phone>` in URL, populate recipient input and auto-lookup.

**Modify**: `apps/backend/inertia/pages/admin/event_attendees.tsx`

Add a "Send" column at the end of the attendees table:

| Phone       | Step | Source        | POAP | Linked at | **Send**                  |
| ----------- | ---- | ------------- | ---- | --------- | ------------------------- |
| +57\*\*\*67 | done | asst-carolina | ✓    | 14:30     | `[Send $]` ← unsent       |
| +57\*\*\*88 | done | asst-diego    | ✗    | 14:35     | `✓ $25 sent` ← sent badge |

Send button is a `<Link href={\`/admin/operator/send?to=${phone}\`}>` — Inertia client-side nav, pre-fills the form.

**Modify**: admin layout — see Capa 4 above.

**Optional v2**: per-event admin page at `/admin/events/:slug` with "Assign operator" + "Drain wallet" actions. For MVP, can be done via API + curl or extending `roles_controller`.

---

## Operational workflow

### Pre-event (admin / Mateo)

1. **Create the operator login**
   - Via `roles_controller` UI (extend it slightly) or seed SQL:
     ```sql
     INSERT INTO admin_users (full_name, email, password, role)
     VALUES ('Jose Onramp', 'jose@sippy.lat', '<scrypt-hash>', 'operator');
     ```
   - Single shared physical-controlled login per event (decision #4).

2. **Assign operator to event**
   - `POST /admin/events/pizza-day-ctg-2026/operator` body `{operator_user_id: 5}`
   - Backend calls `provisionOperatorWallet(...)` → creates CDP wallet → inserts `event_operator_wallets` row → returns `wallet_address` (e.g. `0xAB...CD`).

3. **Fund the wallet** (decision #1, external)
   - Admin reads the wallet address from the response (or `/admin/events/:slug` UI).
   - Manually drains USDC from a treasury / vendor float wallet to that address on-chain.
   - Verifies balance via the operator dashboard.

### During event (operator / Jose)

1. Goes to `/admin/login`, signs in with shared creds.
2. Lands at `/admin/operator/send` automatically (post-login redirect).
3. Cash arrives at the booth from an attendee.
4. Operator enters their phone, clicks Lookup, sees "Attendee found".
5. Enters amount, clicks Send → confirms → tx submitted.
6. Recent sends list updates with the new entry; "this hour" counter ticks.

### Post-event (admin)

1. **Drain the wallet** (decision #2, guaranteed by architecture)
   - `POST /admin/events/pizza-day-ctg-2026/operator-wallet/drain` body `{destination_address: '0xTREASURY...'}`
   - Backend re-hydrates the CDP handle from stored `cdp_account_name`, signs a full-balance transfer to the destination.
   - Confirms tx hash in response.
2. **Revoke the assignment** (optional)
   - `DELETE /admin/events/pizza-day-ctg-2026/operator` → flips `active=false`.
   - Wallet remains in CDP custody, row remains in DB. Can be re-activated later if needed (mismo address).
3. **Disable the operator login** (optional, via roles_controller if reused for other events).

---

## Caps (defaults, env-overridable)

```
OPERATOR_MAX_PER_TX_USDC=100       # max USDC per single send
OPERATOR_MAX_PER_HOUR_USDC=500     # rolling 1-hour cap per operator
```

The per-hour cap is computed at send time:

```sql
SELECT COALESCE(SUM(amount_usdc), 0)
FROM operator_sends
WHERE operator_id = ?
  AND status IN ('pending','submitted','confirmed')
  AND created_at > now() - interval '1 hour'
```

If `result + requested > cap` → 429.

---

## Tests

| Suite                              | Coverage                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operator_wallet_service.spec.ts`  | Provision idempotency (same name → same address); rehydrate by name returns same handle; send executes; drain executes                                     |
| `operator_send_controller.spec.ts` | 403 if role ≠ operator/admin; 400 if no wallet assigned; 400 if recipient not in event; 400 if amount > per-tx cap; 429 if hourly cap exceeded; happy path |
| `admin_events_controller.spec.ts`  | Extend existing: new `operatorSend.sent` boolean populated correctly; scope check rejects mismatched slug for operator                                     |
| `admin_role_middleware.spec.ts`    | New: operator-or-admin gate, admin-only gate, 403 logging                                                                                                  |
| `qr_sheets_controller.spec.ts`     | Scope check rejects operator viewing other event's QR sheets                                                                                               |

Total new/extended tests: ~25.

---

## File-by-file changes

### New files

```
apps/backend/database/migrations/0020_add_operator_role_and_wallets.ts
apps/backend/app/models/event_operator_wallet.ts                   (optional, can use raw)
apps/backend/app/models/operator_send.ts                           (optional)
apps/backend/app/services/operator_wallet.service.ts
apps/backend/app/controllers/admin/operator_send_controller.ts
apps/backend/inertia/pages/admin/operator_send.tsx
apps/backend/tests/unit/operator_wallet_service.spec.ts
apps/backend/tests/unit/operator_send_controller.spec.ts
apps/backend/tests/unit/admin_role_middleware.spec.ts              (if not already covered)
```

### Modified files

```
apps/backend/app/models/user.ts                                    (role union: + 'operator')
apps/backend/app/middleware/admin_role_middleware.ts               (extend role semantics)
apps/backend/app/middleware/inertia_middleware.ts                  (assignedEventSlug shared prop)
apps/backend/app/controllers/admin/auth_controller.ts              (post-login redirect)
apps/backend/app/controllers/admin/events_controller.ts            (LEFT JOIN operator_sends; assignOperator/revoke/drain; scope check on attendees)
apps/backend/app/controllers/admin/qr_sheets_controller.ts         (scope check)
apps/backend/start/routes.ts                                       (explicit adminRole on every route; new operator routes)
apps/backend/start/env.ts                                          (OPERATOR_MAX_PER_TX_USDC, OPERATOR_MAX_PER_HOUR_USDC)
apps/backend/inertia/layouts/admin_layout.tsx                      (role-conditional nav)
apps/backend/inertia/pages/admin/event_attendees.tsx               (Send/Sent column)
apps/backend/tests/unit/admin_events_controller.spec.ts            (new field)
```

---

## Estimation

| Component                                                                        | Hours       |
| -------------------------------------------------------------------------------- | ----------- |
| Migration + model updates                                                        | 1.0         |
| `operator_wallet.service.ts` + tests                                             | 2.5         |
| `operator_send_controller` + tests                                               | 3.0         |
| `events_controller` extensions (assign/revoke/drain) + LEFT JOIN + scope + tests | 2.0         |
| `qr_sheets_controller` scope check + test                                        | 0.25        |
| Middleware extension + tests                                                     | 0.5         |
| `inertia_middleware` (assignedEventSlug)                                         | 0.25        |
| `admin_layout` role-aware nav                                                    | 0.5         |
| `operator_send.tsx` page                                                         | 2.0         |
| `event_attendees.tsx` column                                                     | 0.5         |
| `auth_controller` redirect                                                       | 0.25        |
| Manual testing in staging                                                        | 1.0         |
| **Total**                                                                        | **~13.75h** |

Roughly one focused day of work + a half day of polish/testing.

---

## Risks & mitigations

| Risk                                                | Mitigation                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator typos a phone number                       | Two-step confirm + recipient validation against `user_event_links` (rejects non-attendees)                                                                               |
| Operator drains the wallet through fraudulent sends | Per-hour cap ($500 default) + audit log + admin can revoke assignment instantly                                                                                          |
| CDP API outage during event                         | Send endpoint returns 5xx + error_reason logged; operator retries when CDP recovers. Backup plan: ops can move USDC directly from the wallet via CDP dashboard if needed |
| Operator login leaked physically                    | Single login per event, controlled in physical custody (decision #4). Admin rotates password post-event if concern                                                       |
| Wallet funding forgotten pre-event                  | Operator dashboard surfaces `Balance: $0.00` prominently → impossible to miss. Send endpoint returns "insufficient balance" + readable error                             |
| Drain forgotten post-event                          | Funds stay accessible indefinitely via stored `cdp_account_name`. Drain can be triggered any time later — no data loss                                                   |
| Per-hour cap blocks a legitimate big send           | Admin can temporarily raise via env var without redeploy (Railway), or revoke + recreate with a different cap, or send manually via CDP dashboard                        |
| Wrong event_slug in operator request                | Capa 3 scope check rejects with 403 + logs the attempt                                                                                                                   |

---

## Open implementation notes

- The `roles_controller` UI may need to be extended to accept `role='operator'` in its enum + show the `assignedEvent` if any. Not strictly required for MVP if operator creation is done via SQL.
- A small admin page `/admin/events/:slug` (single event detail with "Assign operator" + "Drain wallet" buttons) is nice-to-have but not strictly required — admin can use API + curl. Hold for v2 unless time permits.
- `USDC_ERC20_ABI` should already exist somewhere in `embedded_wallet.service.ts`; reuse rather than re-declare.
- `getCdpNetwork()` and `getUsdcAddress()` likely already utility functions in `embedded_wallet.service.ts` — reuse.

---

## Done definition

- [ ] Migration applied on staging
- [ ] Test operator account provisioned via admin UI or SQL
- [ ] Operator login → only sees Send / Attendees / QR Sheets nav
- [ ] Operator tries to hit `/admin/users` directly → 403
- [ ] Operator tries to hit `/admin/events/<other-slug>/attendees` → 403
- [ ] Wallet provisioned via `POST /admin/events/<slug>/operator` returns address
- [ ] Operator dashboard shows balance after manual on-chain funding
- [ ] Test send to a real onboarded attendee succeeds on-chain (Arbitrum testnet first if possible)
- [ ] Attendees table shows ✓ next to the recipient after send confirms
- [ ] Drain endpoint executes and recovers the balance
- [ ] All tests pass; typecheck clean

Ship when all checked.

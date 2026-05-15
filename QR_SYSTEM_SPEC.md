# QR System Spec — v1

> Permanent Sippy account capability. Every user can generate, display, and (later) revoke QR codes that route to payment, event onboarding, or referral flows. First consumer: Pizza Day (May 22, 2026) assistant printables.

**Status:** Draft for tech-freeze build (Fri May 15 – Sat May 16, 2026).
**Consumer doc:** [PIZZA_DAY_PLAN.md](PIZZA_DAY_PLAN.md) — uses QR v1 for assistant/event printables.

### Ownership

| Owner      | Scope                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carlos** | `user_preferences.account_type` migration (ENUM + check + backfill default). Quest exclusion reads of `account_type`. WhatsApp bot bracket-token extraction (deterministic first-contact hook, runs **before** LLM/intent parsing — QR attribution is routing metadata, not natural-language intent). |
| **Mateo**  | `qr_links` + `qr_scans` migration (additive, references `user_preferences(phone_number)`, does NOT touch `user_preferences` schema). Short-id generator. PDF rendering. Admin bulk endpoint. Public `/q/:shortId` route.                                                                              |

**Migration sequencing:**

- Two separate migrations. Carlos's `account_type` migration is independent of Mateo's QR tables migration — no FK between them in v1. They can land in either order.
- The QR migration is additive and defaulted: safe to run locally/staging now once the FK targets are confirmed (`user_preferences.phone_number`, `events.slug` — both exist). Prod waits until the `account_type` contract is locked so the resolve API can read it without retrofit.

---

## Design principles

1. **One link primitive, three kinds.** Pay, event, referral. Same table, same URL grammar, type-discriminated routing. Avoids split attribution semantics.
2. **Printed artifacts are permanent.** Once a vendor sticks a QR on a counter, we can't recall it. Bake versioning + revocability in from v1.
3. **No PII in QR URLs.** Short-id is an opaque random handle. Phone numbers, emails, and full names never appear in QR-encoded URLs or in public payloads.
4. **Scan tracking ≠ resolve API.** Public scan route logs scan events; resolve API is for programmatic lookups and is rate-limited separately. Counters are denormalized, not source of truth.
5. **Opt-in for personal QRs.** Exposing your identity to anyone who scans is a meaningful choice. Off by default for regular users, on by default for vendor-typed accounts.

---

## URL grammar

Universal scan route:

```
https://app.sippy.lat/q/<short-id>?v=1
```

- `<short-id>` is the only meaningful component. The server looks it up in `qr_links` and routes based on `kind`.
- `v=1` is the grammar version. Future evolution (v=2) can add params without breaking v=1 prints.
- No typed path aliases (`/pay/<id>`, `/event/<id>`) in v1 — the kind is a property of the row, not the URL. Typed aliases can be added later as UX sugar.

**Why universal not typed:** typed paths mean encoding the kind into something we already store in the DB, and they require enforcement (what if `/pay/<id>` resolves to an event row?). Universal is simpler and equivalent in security. The QR's encoded URL is never hand-typed, so user readability isn't a factor.

---

## Short-id model

**Generation:**

- 8 characters, base32 alphabet without ambiguous chars: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0`/`O`, `1`/`I`/`L`)
- ~40 bits of entropy → ~1 trillion combinations
- Random + lookup (not deterministic HMAC). Each QR is revocable independently.
- On insert, retry on collision (P(collision) at 1M rows ≈ 10⁻⁷, essentially never)

**Why random not HMAC:**

- Per-code revocability. "Print a new sticker if you leaked yours" is a feature.
- Deterministic IDs would require rotating a global secret to revoke one user's QR, breaking everyone else's prints.

**Storage:** plain `TEXT` in `qr_links.short_id`, primary key.

---

## QR rendering modes

| Surface                                  | Format | Size       | ECC   | Notes                                                                        |
| ---------------------------------------- | ------ | ---------- | ----- | ---------------------------------------------------------------------------- |
| In-app display                           | SVG    | responsive | M     | Crisp at any zoom, copy/paste friendly                                       |
| Share sheet                              | PNG    | 1024×1024  | M     | With Sippy frame + caption underneath                                        |
| Print (vendor signage, assistant sheets) | PDF    | vector     | **H** | Survives smudge/fold. Fallback URL printed below QR for damaged-QR recovery. |

**Brand colors** (per `brand/DESIGN_SYSTEM.md`):

- Pay / vendor: cheetah blue `#00AFD7` on white
- Event / referral: electric green `#00D796` on white
- Monochrome fallback: `#1A1A2E` on white (when printing on color-restricted media)

Never ship a generic black-on-white QR — it reads as default SaaS.

---

## Scan & onboarding UX

Sippy is WhatsApp-first. **All QR scans on mobile redirect into WhatsApp**, not the web setup flow. The web `/setup` path remains the secondary onboarding surface (email login, browser-only users), but the QR-scan happy path is WhatsApp.

### Routing logic at `/q/:shortId`

Server-side at the public scan route:

1. Look up `short_id` in `qr_links`. Log a `qr_scans` row.
2. Detect mobile vs desktop from `User-Agent`.
3. **Mobile**: 302 redirect to:
   ```
   https://wa.me/<SIPPY_WHATSAPP_NUMBER>?text=<url-encoded-prefilled-message>
   ```
4. **Desktop**: render a fallback page with:
   - The Sippy WhatsApp number
   - A copy-able code (`[ABC23XYZ]`)
   - A QR encoding the `wa.me` URL ("Scan with your phone to open WhatsApp")

### Prefilled WhatsApp message

One message format for all kinds. The bot inspects the short-id and dispatches:

```
Hola Sippy! [ABC23XYZ]
```

The bracketed token is the QR short-id. On receipt, the WhatsApp bot:

1. Greps for `\[([A-Z0-9]{8})\]` at the start of incoming messages.
2. If matched, looks up the short-id in `qr_links`.
3. Dispatches based on `kind`:
   - `event` → run PR #19's `linkUserToEvent(phone, event_slug, source_tag)`; reply with event welcome
   - `pay` → resolve owner identity, present send confirmation flow ("Quieres enviar a Carlos Q.?")
   - `referral` → store referrer attribution; continue onboarding
4. Writes back to the matching `qr_scans` row: sets `resolved_to_phone_number` once onboarding completes (or immediately if user already exists).

**Why brackets:** unambiguous in free-text WhatsApp messages, survives translation/autocorrect, distinguishes from URLs and phone numbers.

### Status-specific behavior

| Status               | Mobile (WhatsApp)                                                  | Desktop                                 |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `active`             | Redirect to `wa.me` with code                                      | Show fallback page with code + wa.me QR |
| `revoked`            | Redirect to wa.me with a generic "this QR was revoked" message     | Show "no longer active" page            |
| `not_found` (no row) | Redirect to wa.me with a generic "couldn't find that code" message | Show generic landing                    |

In all cases, the user ends up in WhatsApp talking to Sippy — the bot handles the edge case from there.

### Why this is better than `/setup` redirect

- **Native to the product.** Sippy lives in WhatsApp. Forcing users through a web flow before they reach the channel they're going to use anyway is a leaky funnel.
- **No app install required.** Every LATAM phone has WhatsApp. The web setup flow needs a browser + an active session.
- **Attribution carries through.** The short-id reaches the bot, the bot writes `resolved_to_phone_number` back to qr_scans, so we can measure scan → onboarding conversion accurately.

---

## Schema

### `qr_links` — durable metadata, one row per QR

> Identity is anchored on `user_preferences.phone_number` (TEXT PRIMARY KEY), the existing pattern used by `phone_registry`, `user_event_links`, and the rest of the backend. There is no `users` table in this backend.

```sql
CREATE TABLE qr_links (
  short_id            TEXT PRIMARY KEY,
  owner_phone_number  TEXT NOT NULL REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('pay', 'event', 'referral')),

  -- Per-kind payload (nullable, enforced by partial CHECK below)
  event_slug          TEXT REFERENCES events(slug) ON DELETE SET NULL,
  source_tag          TEXT,   -- optional channel attribution for kind='event'

  -- Display preferences (owner-controlled, surfaced by resolve API)
  display_name        TEXT,   -- overrides default; null = use owner's preferred display + phone last-4

  -- Denormalized counter (NOT source of truth; rebuild from qr_scans if needed)
  scan_count          INTEGER NOT NULL DEFAULT 0,
  last_scanned_at     TIMESTAMPTZ,

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_at          TIMESTAMPTZ,
  revoked_reason      TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Required fields per kind
  CHECK (
    (kind = 'event' AND event_slug IS NOT NULL)
    OR (kind IN ('pay', 'referral') AND event_slug IS NULL)
  )
);

CREATE INDEX idx_qr_links_owner ON qr_links(owner_phone_number);
CREATE INDEX idx_qr_links_event ON qr_links(event_slug) WHERE event_slug IS NOT NULL;
```

### `qr_scans` — append-only event log

```sql
CREATE TABLE qr_scans (
  id                  BIGSERIAL PRIMARY KEY,
  -- NO FK to qr_links. We need to log failed lookups (unknown / never-existed
  -- short_ids) for abuse and debugging signal. Keep as plain indexed TEXT.
  -- Trade-off: no referential integrity, but qr_scans is append-only and the
  -- short_id is a lookup key, not a relationship.
  short_id            TEXT NOT NULL,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Request context
  user_agent          TEXT,
  ip_hash             TEXT,    -- HMAC(ip, secret) — one-way for privacy, dedup-friendly
  referer             TEXT,
  device_class        TEXT CHECK (device_class IN ('mobile', 'desktop', 'unknown')),

  -- Resolution result. resolved_to_phone_number is written at two points:
  --   1. Synchronously if the scanner is an authenticated Sippy user at scan time
  --   2. Asynchronously by the WhatsApp bot when a user completes onboarding
  --      via a message containing the QR's short-id code
  resolved_to_phone_number TEXT REFERENCES user_preferences(phone_number) ON DELETE SET NULL,
  resolved_at              TIMESTAMPTZ,
  outcome                  TEXT NOT NULL CHECK (outcome IN ('redirected', 'revoked', 'not_found', 'rate_limited', 'invalid_version'))
);

CREATE INDEX idx_qr_scans_short_id_time ON qr_scans(short_id, scanned_at DESC);
CREATE INDEX idx_qr_scans_outcome ON qr_scans(outcome) WHERE outcome != 'redirected';
CREATE INDEX idx_qr_scans_resolved_phone ON qr_scans(resolved_to_phone_number) WHERE resolved_to_phone_number IS NOT NULL;
```

**Outcome semantics:**

- `redirected` — scan hit a valid active row, user got the wa.me redirect. Does NOT imply onboarding.
- `revoked` — short-id exists but `qr_links.status='revoked'`.
- `not_found` — short-id not in `qr_links`. Important to log for abuse signal.
- `rate_limited` — short-id exceeded the v1 per-short-id scan limit (100/min). Per-IP throttle is deferred post-freeze until real-IP forwarding is in place; see Rate limit section.
- `invalid_version` — URL had `?v=` other than `1`. Future-proofing.

`qr_scans` is the **source of truth** for analytics. `qr_links.scan_count` is a denormalized cache, eventually consistent, rebuildable from `qr_scans` where outcome='redirected'.

---

## APIs

### Public

#### `GET /q/:shortId` — scan route (browser)

Next.js page (apps/web). Server-side:

1. POSTs to `POST /api/qr/scan/:shortId` (apps/backend) with `{deviceClass, userAgent, referer}`.
2. Backend looks up `short_id`, writes a `qr_scans` row, bumps `scan_count` if `outcome='redirected'`.
3. Backend returns `{outcome, kind, waUrl, displayLabel}`.
4. Next.js redirects mobile to `waUrl` or renders desktop fallback (see Scan & onboarding UX).

**Rate limit (v1 — freeze):** **Controller-internal, per-shortId**, 100 scans/minute. NOT middleware-level. Two reasons:

- Middleware 429 short-circuits before the controller runs, leaving `rate_limited` outcome unobservable. Controller-internal logs the outcome correctly.
- Per-IP would always see the Next.js server's IP (the only direct caller of the backend route), so per-IP rate limiting on this endpoint is meaningless until real-IP forwarding is wired.

**Rate limit (post-freeze):** Add per-IP throttle once real-IP is forwarded from apps/web (either via trusted `x-original-ip` header with shared-secret check, or by moving the scan POST client-side and configuring CORS for `app.sippy.lat`). Per-shortId stays as the second line of defense.

**No auth required.** This is the durable public surface.

#### `GET /api/qr/:shortId/resolve` — minimal public lookup

Returns:

```json
{
  "status": "active" | "revoked" | "not_found",
  "kind": "pay" | "event" | "referral",
  // Only when status=active:
  "display": {
    // pay: { name: "Carlos Q.", phoneSuffix: "4521", isVendor: false }
    // event: { eventName: "Pizza Day Cartagena 2026", endsAt: "..." }
    // referral: { name: "Carlos Q." }
  }
}
```

Never returns: phone number, email, wallet address, user ID, or any non-displayed identity field.

**Rate limit:** IP-throttled at 30 req/min/IP (stricter than scan route).

**Used by:** the scan route's client-side preview, programmatic SDK consumers, future browser-extension integrations.

### Authenticated (JWT)

#### `POST /api/qr` — create

Body:

```json
{
  "kind": "pay" | "event" | "referral",
  "eventSlug": "...",        // required when kind='event'
  "sourceTag": "...",        // optional for kind='event' (e.g. "assistant-7")
  "displayName": "..."       // optional, overrides default identity surface
}
```

Returns:

```json
{ "shortId": "ABC23XYZ", "url": "https://app.sippy.lat/q/ABC23XYZ?v=1" }
```

#### `GET /api/qr` — list current user's QRs

Returns array of `{ shortId, kind, status, createdAt, scanCount, lastScannedAt, ... }`.

#### `DELETE /api/qr/:shortId` — revoke

Soft delete: `status='revoked'`, `revoked_at=now()`. Keeps row and scan history.

#### `POST /api/qr/:shortId/regenerate` — convenience

Revokes the existing QR and creates a new one with the same kind/payload. Returns the new short-id. Useful for "I lost my printed sticker" without making the user re-enter settings.

### Admin

#### `POST /api/admin/events/:slug/qr-sheets` — bulk generator

Body:

```json
{
  "assistants": [
    { "label": "Carolina", "sourceTag": "assistant-1" },
    { "label": "Diego", "sourceTag": "assistant-2" }
  ]
}
```

For each entry: creates a kind=`event` QR owned by the admin user, generates a printable PDF (1 QR per page, A4, ECC=H, brand-locked, with assistant label + fallback URL).

Returns: ZIP of PDFs (`assistant-1.pdf`, `assistant-2.pdf`, ...) plus a CSV of `{ label, sourceTag, shortId, url }` for record-keeping.

**Authz:** admin role only.

---

## Privacy boundaries

- **No phone number in any QR URL.** Short-id is the only identifier.
- **No raw phone in any client-facing payload.** Resolve API returns first name + last-4 phone suffix, or owner-chosen `display_name`.
- **No list/enumeration endpoint** that maps short-ids → identities. Resolve requires the exact short-id; rate limits prevent brute force.
- **IP hashing in `qr_scans`** is HMAC(ip, server-side secret) — one-way but dedup-friendly for "how many unique IPs scanned this".
- **Opt-in for personal QRs.** A user must explicitly enable their "Pay me" QR in settings. Vendor-typed accounts have it on by default.
- **Owner-controlled display name.** Users can set `display_name` to e.g. their first name only, a business name (for vendors), or a pseudonym. Default is `<firstName> <lastNameInitial>.` + phone last-4.

---

## Analytics

### Source of truth

`qr_scans` is append-only and authoritative. All metrics (scan counts, conversion rates, unique-scanner counts via `ip_hash` dedup, time-of-day distribution) derive from this table.

### Cached counters

`qr_links.scan_count` and `last_scanned_at` are denormalized for cheap UI reads ("scanned 12 times"). Update in same transaction as `qr_scans` insert on the scan route. If they drift, rebuild from `qr_scans` — they are NOT source of truth.

### Pizza Day attribution

Two distinct queries — they measure different things and the dashboard shows both side by side. Conversion rate (onboardings ÷ scans) is the real signal.

**Top of funnel — scans.** From `qr_scans`. Measures reach.

```sql
SELECT
  ql.source_tag              AS assistant,
  COUNT(*)                   AS total_scans,
  COUNT(DISTINCT s.ip_hash)  AS unique_scanners
FROM qr_scans s
JOIN qr_links ql ON ql.short_id = s.short_id
WHERE ql.event_slug = 'pizza-day-ctg-2026'
  AND s.outcome = 'redirected'
GROUP BY ql.source_tag
ORDER BY total_scans DESC;
```

**Conversions — actual onboardings.** From `user_event_links.metadata->>'source'` (the canonical attribution PR #19 writes when the WhatsApp bot links the user). Measures revenue.

```sql
SELECT
  uel.metadata->>'source'  AS assistant,
  COUNT(*)                 AS onboarded
FROM user_event_links uel
JOIN events e ON e.id = uel.event_id
WHERE e.slug = 'pizza-day-ctg-2026'
  AND uel.metadata->>'source' IS NOT NULL
GROUP BY uel.metadata->>'source'
ORDER BY onboarded DESC;
```

`qr_scans.resolved_to_phone_number` is useful for debugging individual scan→onboarding journeys (who clicked then never completed), but `user_event_links.metadata->>'source'` is the canonical "this assistant brought this user" signal because it's written at the WhatsApp linking step, not at the scan step.

---

## Revocation

- Owner-initiated: `DELETE /api/qr/:shortId` flips status to `revoked`, records `revoked_at` and optional `revoked_reason`.
- Admin-initiated (abuse/fraud response): same endpoint, admin override on authz.
- Scan of a revoked QR: scan route logs `outcome='revoked'` and renders a "no longer active" page with a generic recovery hint. The owner sees the revocation in their QR list.
- Regenerate flow (`POST /api/qr/:shortId/regenerate`): convenience that revokes + creates with same payload in one call.

---

## Phasing

Today is **Fri May 15, 2026**. Freeze is **Sat May 16**. The freeze ships _only_ what Pizza Day needs. Everything else slips to ops week.

### Freeze scope (must land by Sat May 16 EOD)

**Goal: assistant sheets printable Sunday/Monday for the Mon May 18 phone-number deadline cascade.**

**Architecture split for v1:**

- `apps/web` (Next.js 16, Server Components) owns the public `/q/:shortId` route and the admin printable QR page. No direct DB access.
- `apps/backend` (AdonisJS) owns the database, the scan-log endpoint, the short-id service, and the `createQrLink` service.
- The Next.js `/q` page calls the backend's scan-log endpoint, then performs the redirect/render based on the response.

**Tasks:**

- [x] Migration: `qr_links` + `qr_scans` (Mateo). Independent of Carlos's `user_preferences.account_type` migration — they can land in either order. _Done: `apps/backend/database/migrations/0018_create_qr_links_and_qr_scans.ts`, ran locally._
- [ ] Migration: `ALTER TABLE user_preferences ADD COLUMN account_type` (Carlos)
- [x] Short-id generator with collision retry. _Done: `apps/backend/app/services/qr_short_id.service.ts` + 9 unit tests passing in `tests/unit/qr_short_id_service.spec.ts`._
- [x] Internal `createQrLink(kind, payload)` service function (apps/backend). _Done in `app/services/qr_link.service.ts` — validates kind/eventSlug combo, allocates short-id via generator, inserts qr_links row._
- [x] Backend scan endpoint: `POST /api/qr/scan/:shortId` — lookup + scan log + return `{outcome, kind, waUrl, displayLabel}`. _Done in `app/controllers/qr_scan_controller.ts`. Route registered in `start/routes.ts` WITHOUT `middleware.ipThrottle()`; throttle is controller-internal per-shortId (`rate_limit_service.checkQrScanThrottle`, 100/min) so `rate_limited` outcome is logged. Per-IP throttle deferred to post-freeze pending real-IP forwarding._
- [x] Public `/q/:shortId` Server Component (apps/web): calls backend scan endpoint, mobile→`wa.me` redirect, desktop→fallback page with copy-able code. _Done in `apps/web/app/q/[shortId]/page.tsx`. Backend-unreachable graceful degrade also wired (still redirects to generic wa.me)._
- [ ] WhatsApp bot parser hook: extract `[ABC23XYZ]` from incoming messages, look up short-id, dispatch to `linkUserToEvent` (Carlos)
- [x] Admin printable QR page. _Done in `apps/backend/inertia/pages/admin/qr_sheets.tsx` (Inertia React, lives in apps/backend admin UI for consistency with existing admin pages). One QR per print page via `@page` + `page-break-after`. Uses `qrcode.react` 4.2 for SVG rendering (cheetah blue `#00AFD7`, ECC=H). Includes both the QR and the fallback `FRONTEND_URL/q/<short-id>?v=1` printed below for damaged-QR recovery._
- [x] Admin endpoint to bulk-create QRs. _Done in `app/controllers/admin/qr_sheets_controller.ts`. Routes: `GET /admin/qr-sheets/:eventSlug` (show + form, viewer-readable), `POST /admin/qr-sheets/:eventSlug` (gated by `adminRole({role: 'admin'})`). Parses assistants from textarea, validates owner_phone_number against `user_preferences`, rejects duplicate source-tags within the batch and against existing event rows. **All inserts wrapped in `db.transaction()` — partial failures roll back, no orphan rows.** Backed by partial unique index `qr_links_event_source_unique` on `(event_slug, source_tag) WHERE event_slug IS NOT NULL AND source_tag IS NOT NULL AND status='active'` (migration `0019_qr_event_source_unique_index.ts`) to guarantee uniqueness even under racing admin submissions._
- [ ] Generate Pizza Day assistant sheets: open admin page in browser, print to PDF or directly. _Unblocked — needs the `pizza-day-ctg-2026` event row in `events`, an owner phone in `user_preferences`, and the admin to navigate to `/admin/qr-sheets/pizza-day-ctg-2026`._
  - **Pre-flight (P1):** before generating real sheets, verify `FRONTEND_URL` on the backend service points at the apps/web public domain that actually serves `/q/[shortId]`. The admin page surfaces the URL prefix in a banner — eyeball it, then scan one generated QR with a phone before printing the batch. The default fallback `https://www.sippy.lat` may or may not be correct depending on which subdomain serves the Next.js app in prod.

**Explicitly cut from freeze (was previously scoped, now post-freeze):**

- Backend PDF generation with `pdfkit` + `qrcode` (backend deps). Browser print-to-PDF removes the need.
- Admin `POST /api/admin/events/:slug/qr-sheets` ZIP-of-PDFs endpoint. Replaced by the admin printable page.
- The `<SippyQR />` reusable component, personal QR settings page, public `POST /api/qr` create endpoint, list/revoke/regenerate endpoints, resolve API, Pay/Referral kind end-to-end. None on the Pizza Day critical path.

**Why this cut works for Pizza Day:**

- Printables: solved by browser print on a dedicated admin page (visual QA in the browser is easier than PDF debugging anyway)
- No new backend deps (pdfkit, etc.)
- Reusable in-app QR display path stays available for post-freeze "pay me" rollout
- Same `qrcode.react` library covers both the admin printable page and the future personal-QR page

### Explicitly cut from freeze (ships post-freeze)

- `POST /api/qr` public create endpoint (users can't make their own QRs yet)
- `GET /api/qr` list / `DELETE /api/qr/:shortId` revoke / `POST /api/qr/:shortId/regenerate`
- `GET /api/qr/:shortId/resolve` public resolve API
- Personal QR settings page (opt-in toggle, display config)
- Pay and Referral kinds end-to-end (only event kind ships in freeze)
- `<SippyQR />` in-app SVG component (no in-app surface uses it during the freeze)

Why cut: none of the above are on the Pizza Day critical path. Event-kind QRs printed by admin tool are all we need on May 22. Building the rest under freeze pressure invites incomplete work that breaks under real load.

### Post-freeze (May 18–21, ops week + parallel UI build)

- [ ] **Real-IP forwarding for scan endpoint** + per-IP throttle. Two viable paths: (a) trusted `x-original-ip` header from apps/web paired with `x-scan-trust` shared-secret check on backend, or (b) move the scan POST client-side from `/q/:shortId` and configure CORS for `app.sippy.lat`. Either unlocks meaningful per-IP rate limiting on top of the existing per-shortId throttle.
- [ ] **`ip_hash` population in `qr_scans`.** Currently null because apps/web doesn't yet forward the scanner's IP. Same dependency as above. Until it lands, unique-scanner analytics over `qr_scans.ip_hash` will be empty — `scan_count` and `user_event_links.metadata->>'source'` are the trustworthy metrics for Pizza Day.
- [ ] `<SippyQR />` React component (SVG, brand-locked)
- [ ] `POST /api/qr` (authenticated create) + `GET /api/qr` (list)
- [ ] `DELETE /api/qr/:shortId` (revoke) + `POST /api/qr/:shortId/regenerate`
- [ ] `GET /api/qr/:shortId/resolve` with IP rate limit
- [ ] Personal QR settings page (opt-in toggle, display name, download/share)
- [ ] Pay and Referral kind end-to-end (bot dispatch + flows)
- [ ] Vendor variant styling (large QR + business name + menu)
- [ ] Scan analytics dashboard (admin per-event, user "your QR scanned N times")
- [ ] Background job: reconcile `qr_links.scan_count` against `qr_scans` if drift detected

---

## Locked decisions (formerly open questions)

1. **`user_preferences.account_type` is the single source of truth.** Identity is anchored on `user_preferences.phone_number` in this backend — there is no `users` table. ENUM column added via ALTER:

   ```sql
   ALTER TABLE user_preferences
     ADD COLUMN account_type TEXT NOT NULL DEFAULT 'regular'
     CHECK (account_type IN ('regular', 'vendor', 'exchange'));
   ```

   The Pizza Day plan's `type=vendor` / `type=exchange` labels and the QR resolve API's `isVendor` field both derive from this column. **No parallel `is_vendor` boolean anywhere.** `isVendor` exists only as a derived field in the public resolve API payload (computed as `account_type === 'vendor'`).

   **Owner: Carlos.** This column is a shared backend contract for Quest exclusion (Pizza Day), vendor/exchange handling, and QR resolve behavior. Putting it in a separate Carlos-owned migration (not bundled with QR tables) avoids two people landing different semantics around vendor/exchange/regular.

2. **Scan route inlines the lookup, doesn't call resolve.** Public `GET /q/:shortId` does a direct DB read via a shared service function (`getQrLinkForScan(shortId)`). The resolve API uses the same service function. One source of logic, no internal HTTP round-trip.

3. **Bracket-token extraction runs before the LLM/intent parser.** The `\[([A-Z0-9]{8})\]` pattern is a deterministic first-contact hook, not a natural-language intent. Pipeline order in the WhatsApp message handler:
   1. **Bracket-token extraction.** If the incoming message contains a valid token, look it up in `qr_links` synchronously. On match: attach `{qrShortId, kind, payload}` as context to the message, then continue with the normal handler pipeline so onboarding/conversation flow proceeds with attribution attached.
   2. **Existing parser** (regex → LLM Smart Mode fallback) — runs as today, but with QR context already on the message envelope where downstream logic can see it.
   3. Onboarding-completion handlers read `qrShortId` from message context and write the appropriate `user_event_links.metadata.source`, `qr_scans.resolved_to_phone_number`, etc.

   The token never enters the LLM prompt as user content — it's stripped to context before parsing. Avoids the LLM hallucinating about codes or treating them as intent.

## Open questions (still open)

1. **Cross-network QR.** v1 assumes app.sippy.lat. If we add SMS-only users (project roadmap), do they get QRs? Probably yes via a `qr.sippy.lat` short-domain that redirects. Out of v1 scope; reserve the domain now.
2. **QR for non-USDC.** Pay QRs assume USDC on Arbitrum. If we ever support EUR or COP, does the QR encode the currency intent? Likely as `?ccy=` under v=2. Mark as v2.
3. **Display name moderation.** Free-text `display_name` is owner-controlled. Profanity filter or report flow needed by M2 — defer with a TODO.

---

## Pizza Day integration

Pizza Day consumes QR v1 in exactly one place: the admin bulk-generator endpoint. From the event plan's perspective:

- Each of 8–10 event assistants gets a kind=`event` QR with `event_slug='pizza-day-ctg-2026'` and `source_tag='assistant-N'`.
- The admin endpoint produces a printable PDF per assistant.
- Attendees scan → existing PR #19 onboarding flow handles linking.
- Live attribution dashboard reads `qr_scans` joined to `event_attendees` (Carlos's admin endpoint) to show "who onboarded the most attendees" per assistant.

Pizza Day does NOT need: personal "pay me" QRs, referral QRs, vendor styling polish. Those are the broader user-facing feature shipping in parallel.

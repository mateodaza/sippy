# POC Plan: Migrate Backend from Express to AdonisJS 6

## Context

The Sippy backend is currently a ~710-line Express monolith (`server.ts`) with 6 services, 3 command handlers, 6 utils, and 18 routes. It works, but it lacks structure — no ORM, no proper middleware, no admin UI. The M1 plan already calls for custom auth (P4.6), admin controls (P4.5), and monitoring (P7) — all of which benefit from a framework with conventions.

AdonisJS 6 gives us: Lucid ORM, proper middleware, env validation, Inertia.js for an admin dashboard (React), and a clear project structure. The Ponder indexer (already planned in [PONDER_M1_PLAN.md](./PONDER_M1_PLAN.md)) feeds on-chain data into the same Postgres — the admin dashboard reads from both Ponder tables and existing tables.

**Hard constraints:**
- Same route paths (Meta webhook URLs can't change)
- Same PostgreSQL database (Railway, no schema changes)
- Single replica (M1 constraint, in-memory state OK)

**Migration strategy:** Build → Validate → Replace
1. Scaffold `backend-v2/` as sibling to `backend/` (both live in repo during migration)
2. Run both side-by-side for validation (Express :3001, AdonisJS :3333)
3. Once parity confirmed: delete `backend/`, rename `backend-v2/` → `backend/`, deploy to Railway
4. Meta webhook URLs unchanged — same paths, same domain, just new framework serving them

---

## Architecture Mapping

| Express | AdonisJS 6 |
|---------|-----------|
| `server.ts` monolith (710 lines) | `start/routes.ts` + 6 Controllers |
| `app.use(cors())` | `config/cors.ts` (built-in) |
| `express.json()` | Built-in body parser |
| `verifyCdpSession()` inline auth | `CdpAuthMiddleware` class |
| Raw `pg.Pool` queries | `db.rawQuery()` via `@adonisjs/lucid` (same SQL) |
| `process.env.X` scattered | `env.get('X')` with validation in `start/env.ts` |
| `setInterval()` cleanups | Provider `boot()` + singleton service |
| 4 in-memory Maps (dedup, spam, IP, user throttle) | `RateLimitService` singleton |
| `zod` validation | Keep `zod` (works fine in AdonisJS) |
| No admin UI | Inertia.js + React admin dashboard |

---

## File Structure

```
backend-v2/
├── adonisrc.ts
├── start/
│   ├── routes.ts              # All 18 routes (exact same paths)
│   ├── kernel.ts              # Middleware registration
│   └── env.ts                 # Env validation (type-safe)
├── config/
│   ├── app.ts, cors.ts, database.ts, inertia.ts
│   └── network.ts             # Chain + token addresses (from current)
├── app/
│   ├── controllers/
│   │   ├── health_controller.ts           # GET /, GET /api/health
│   │   ├── webhook_controller.ts          # GET+POST /webhook/whatsapp
│   │   ├── resolve_controller.ts          # GET /resolve-phone, /resolve-address
│   │   ├── notify_controller.ts           # POST /notify-fund
│   │   ├── debug_controller.ts            # GET /debug/*
│   │   ├── embedded_wallet_controller.ts  # POST /api/* (8 routes)
│   │   └── admin/
│   │       ├── dashboard_controller.ts    # Inertia: overview
│   │       ├── users_controller.ts        # Inertia: user list + detail
│   │       └── transfers_controller.ts    # Inertia: transfer list (Ponder)
│   ├── middleware/
│   │   ├── cdp_auth_middleware.ts          # CDP token → ctx.cdpUser
│   │   └── ip_throttle_middleware.ts       # IP rate limiting
│   ├── services/                           # Direct port (no Express deps)
│   │   ├── whatsapp_service.ts
│   │   ├── cdp_wallet_service.ts
│   │   ├── embedded_wallet_service.ts
│   │   ├── llm_service.ts
│   │   ├── refuel_service.ts
│   │   └── rate_limit_service.ts          # NEW: consolidates 4 Maps
│   ├── providers/
│   │   ├── rate_limit_provider.ts         # Registers singleton + cleanup timers
│   │   └── cdp_provider.ts               # Registers CDP client singleton
│   ├── commands/                           # Direct port (pure functions)
│   │   ├── start_command.ts
│   │   ├── balance_command.ts
│   │   └── send_command.ts
│   ├── utils/                              # Direct copy (zero framework deps)
│   │   ├── message_parser.ts, messages.ts, language.ts
│   │   ├── phone.ts, sanitize.ts, errors.ts
│   │   └── db.ts                          # query() wrapper → db.rawQuery()
│   └── types/
│       ├── index.ts                        # Direct copy
│       └── schemas.ts                      # Direct copy (zod)
├── inertia/
│   ├── app/app.tsx                        # React entry
│   ├── pages/
│   │   ├── dashboard.tsx                  # Stats cards + recent activity
│   │   ├── users/index.tsx                # User table (phone_registry)
│   │   ├── transfers/index.tsx            # Transfers (Ponder data)
│   │   └── stats/index.tsx                # Parse pipeline stats
│   └── components/
│       ├── layout.tsx                     # Sidebar + header
│       └── stats_card.tsx
├── database/migrations/                   # Empty (schema already exists)
└── tests/functional/                      # Japa integration tests
```

---

## Route Preservation (exact same paths)

```typescript
// start/routes.ts
import router from '@adonisjs/core/services/router'

// Health
router.get('/', [HealthController, 'index'])
router.get('/api/health', [HealthController, 'apiHealth'])

// WhatsApp webhook — EXACT paths registered in Meta
router.get('/webhook/whatsapp', [WebhookController, 'verify'])
router.post('/webhook/whatsapp', [WebhookController, 'handle'])

// Public resolution
router.get('/resolve-phone', [ResolveController, 'byPhone']).use(middleware.ipThrottle())
router.get('/resolve-address', [ResolveController, 'byAddress'])

// Notifications + debug
router.post('/notify-fund', [NotifyController, 'fund'])
router.get('/debug/wallets', [DebugController, 'wallets'])
router.get('/debug/parse-stats', [DebugController, 'parseStats'])

// CDP-authenticated API routes (middleware on group)
router.group(() => {
  router.post('/register-wallet', [EmbeddedWalletController, 'registerWallet'])
  router.post('/register-permission', [EmbeddedWalletController, 'registerPermission'])
  router.post('/revoke-permission', [EmbeddedWalletController, 'revokePermission'])
  router.post('/ensure-gas', [EmbeddedWalletController, 'ensureGas'])
  router.get('/wallet-status', [EmbeddedWalletController, 'walletStatus'])
  router.post('/log-export-event', [EmbeddedWalletController, 'logExportEvent'])
  router.post('/resolve-phone', [EmbeddedWalletController, 'resolvePhone'])
  router.post('/log-web-send', [EmbeddedWalletController, 'logWebSend'])
}).prefix('/api').use(middleware.cdpAuth())

// Admin (Inertia + React) — NEW
router.group(() => {
  router.get('/', [DashboardController, 'index'])
  router.get('/users', [UsersController, 'index'])
  router.get('/transfers', [TransfersController, 'index'])
  router.get('/stats', [StatsController, 'index'])
}).prefix('/admin').use(middleware.auth())
```

---

## Key Design Decisions

### DB: Keep raw queries, thin wrapper swap
```typescript
// Current: pool.query(sql, params)
// AdonisJS: db.rawQuery(sql, params)
// The query() helper function signature stays identical — all 30+ callers unchanged
```

### Webhook 200-then-process pattern
```typescript
// Meta requires immediate 200. Express does: res.sendStatus(200) then continues.
// AdonisJS approach:
async handle({ request, response }: HttpContext) {
  response.status(200).send('')  // Respond immediately
  // Process async — AdonisJS doesn't kill context after response
  this.processWebhook(request.body()).catch(err => logger.error(err))
}
```
This is the **highest risk** item — must validate in POC Phase 4.

### CDP Auth → Middleware
```typescript
// Current: verifyCdpSession() called manually in each route handler
// AdonisJS: CdpAuthMiddleware applied to /api/* group
// Controllers access ctx.cdpUser.phoneNumber, ctx.cdpUser.walletAddress
```

### In-Memory State → Singleton Service
```typescript
// Current: 4 Maps scattered across server.ts + embedded-wallet.routes.ts
// AdonisJS: RateLimitService singleton with all 4 Maps + cleanup timers
// Registered via Provider, injected into middleware/controllers
// Ready for Redis swap in M2 (change implementation, not interface)
```

---

## Complexity Assessment

| Component | Files | Complexity | Notes |
|-----------|-------|-----------|-------|
| Utils (6 files) | Direct copy | **LOW** | Zero framework deps |
| Types + Schemas | Direct copy | **LOW** | Pure TypeScript |
| Services (6 files) | Import path changes | **LOW** | No Express coupling |
| Command handlers (3) | Direct copy | **LOW** | Pure functions |
| Route definitions | New file | **LOW** | 1:1 mapping |
| DB wrapper | 3-line change | **LOW** | `pool.query` → `db.rawQuery` |
| Env validation | New file | **LOW** | Improvement (catches missing vars at boot) |
| CDP auth middleware | New pattern | **MEDIUM** | Logic exists, new AdonisJS pattern |
| Rate limit service | Refactor | **MEDIUM** | Consolidate 4 Maps into 1 class |
| Webhook controller | Port + validate | **MEDIUM-HIGH** | 200-then-process pattern needs testing |
| ESM compat (ethers v5) | Config | **MEDIUM** | CJS in ESM context, may need workaround |
| Admin dashboard | New feature | **MEDIUM** | Inertia + React, well-documented |

---

## Migration Steps (priority order — migrate existing backend first, admin last)

### Phase 0: Scaffold (1-2h)
1. `npm init adonisjs@latest backend-v2 -- --db=postgres` (no Inertia yet — add later for admin)
2. Configure `config/database.ts` with Railway `DATABASE_URL`
3. Configure `start/env.ts` with all 15+ env vars
4. Install existing deps (`@coinbase/cdp-sdk`, `ethers`, `groq-sdk`, `zod`, `jose`, `axios`)
5. Verify boot + DB connection

### Phase 1: Port Core (2-3h)
6. Copy `utils/` verbatim (6 files — zero framework deps)
7. Copy `types/` verbatim
8. Copy `config/network.ts`
9. Adapt `db.ts` wrapper (`pool.query` → `db.rawQuery`)
10. Port 6 services (import path changes, `env.get()` instead of `process.env`)

### Phase 2: Middleware + State (1-2h)
11. Create `RateLimitService` (consolidate 4 Maps)
12. Create `RateLimitProvider` (singleton + cleanup timers)
13. Create `CdpAuthMiddleware`
14. Create `IpThrottleMiddleware`
15. Register in `start/kernel.ts`

### Phase 3: Controllers + Routes (3-4h)
16. Create 6 controllers (Health, Webhook, Resolve, Notify, Debug, EmbeddedWallet)
17. Port 3 command handlers (direct copy)
18. Wire routes in `start/routes.ts` (exact same paths)
19. Test webhook 200-then-process pattern

### Phase 4: Validate — full parity with Express (2-3h)
20. curl every route, compare responses with Express
21. Simulated webhook payload → verify WhatsApp message sent
22. CDP auth → verify token validation
23. Rate limits → verify dedup + spam protection
24. DB queries → verify against Railway Postgres
25. **Deploy to Railway staging, swap Express → AdonisJS**

### Phase 5: Admin Dashboard (4-6h) — LAST, after backend is stable
26. Add Inertia.js + React + Tailwind (`node ace add @adonisjs/inertia`)
27. Admin auth (session-based, env-configured credentials for POC)
28. Admin layout (sidebar: Overview, Users, Transfers, Stats, Gas Refuel)
29. Dashboard page (summary cards from DB: users count, transfers today, LLM stats)
30. Users page (paginated table from `phone_registry`)
31. Parse Stats page (from `parse_log` table)
32. Transfers + Gas Refuel pages (Ponder placeholders, show "coming from indexer")

---

## Admin Dashboard Pages

**Dashboard:** Total users, transfers today, LLM usage (regex vs LLM ratio), GasRefuel balance
**Users:** Paginated table — phone (masked), wallet address, permission status, daily limit, registered date
**Transfers:** Ponder-fed table — from, to, amount, timestamp, tx hash (placeholder until Ponder deploys)
**Parse Stats:** 24h pipeline — regex vs LLM counts, latency percentiles, error rate, language distribution
**Gas Refuel:** Contract balance, total refuels, ETH spent, recent refuel events (Ponder placeholder)

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Webhook 200-then-process breaks | HIGH | Test in POC Phase 4. Fallback: `setImmediate()` wrapper |
| ethers v5 (CJS) in AdonisJS (ESM) | MEDIUM | Test in Phase 1. Fallback: dynamic `import()` or `createRequire` |
| CDP SDK TypeScript conflicts | MEDIUM | Test in Phase 1. SDK is plain npm, should work |
| Route path mismatch | HIGH | AdonisJS routes are explicit. Verify with curl |

---

## Timeline

| Phase | Hours | What | Priority |
|-------|-------|------|----------|
| 0: Scaffold | 1-2h | AdonisJS project + DB + env | **P0** |
| 1: Port core | 2-3h | Services, utils, types | **P0** |
| 2: Middleware | 1-2h | Auth, rate limits, state | **P0** |
| 3: Controllers | 3-4h | 6 controllers, 18 routes | **P0** |
| 4: Validate + deploy | 2-3h | Full parity, swap on Railway | **P0** |
| 5: Admin dashboard | 4-6h | Inertia + React (after stable) | **P1** |
| **Total POC** | **13-20h** | **~2-3 working days** | |

**Phases 0-4 = migrate what exists.** Phase 5 = new feature, only after the backend is running stable on AdonisJS.

---

## Verification Checklist

1. **Route parity:** curl all 18 endpoints on both Express and AdonisJS, diff responses
2. **Webhook:** Send simulated Meta payload → verify WhatsApp message arrives
3. **Auth:** Send CDP-authenticated request → verify `ctx.cdpUser` populated
4. **Rate limits:** Send 11 messages in 1 minute → verify 11th is blocked
5. **Admin:** Visit `/admin` → verify React page renders with DB data
6. **DB:** Query `phone_registry`, `parse_log` → verify data matches

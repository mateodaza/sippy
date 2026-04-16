# Colurs Onramp & Offramp — Implementation Plan

> **Status: IN PROGRESS**
> Staging: `https://dev.backend.colurs.co`
> Production: `https://backend.colurs.co`
>
> **Confirmed by Colurs (April 2026):**
>
> - No webhooks of any kind — polling only
> - `/execute/` is required after `/initiate/` for offramp
> - `/initiate/` only accepts `quote_id`, `bank_account_id`, `external_id`, `destination_description`
> - R2P status polling: `GET /reload/r2p/status/{money_movement_id}/`
> - Exchange status polling: `GET /v2/exchange/movements/{uuid}/`

---

## Overview

Two flows powered by Colurs fiat rails:

| Direction   | Path                                                                                    |
| ----------- | --------------------------------------------------------------------------------------- |
| **Onramp**  | COP (PSE/Nequi/Bancolombia) → Colurs R2P → USDT (ETH mainnet) → LiFi → USDC (Arbitrum)  |
| **Offramp** | USDC (Arbitrum) → Sippy spender → Colurs USD balance → FX exchange → COP (bank account) |

### Offramp: pre-funded balance model

Offramp does **not** bridge per transaction. Sippy maintains a pre-funded USD balance in Colurs. When a user offramps, Sippy pays COP from that balance via Colurs FX rails. Ops rebalances the Colurs USD balance periodically — this is not inline transaction logic.

---

## What is already built

| Component                   | Status      | Notes                                                   |
| --------------------------- | ----------- | ------------------------------------------------------- |
| `colurs_auth.service.ts`    | Done        | JWT login, refresh, token cache                         |
| `colurs_payment.service.ts` | Done        | PSE, Nequi, Bancolombia initiation                      |
| `colurs_fx.service.ts`      | Needs fixes | see changes below                                       |
| `colurs_bank.service.ts`    | Done        | register/list bank accounts, getBanks, getDocumentTypes |
| `colurs_kyc.service.ts`     | Done        | KYC register, OTP, verify, upload, refresh level        |
| `OnrampController`          | Done        | KYC + payment initiation routes                         |
| `OfframpController`         | Needs fixes | missing executeExchange call                            |
| `WebhookColursController`   | **Delete**  | no webhooks exist                                       |
| DB migrations               | Done        | onramp_orders, offramp_orders, colurs_bank_accounts     |
| `onramp_bridge.service.ts`  | Done        | LiFi USDT→USDC bridge                                   |
| Webhook route               | **Delete**  | no webhooks exist                                       |
| Polling jobs                | **TODO**    | both onramp and offramp                                 |
| Scheduler provider          | **TODO**    | node-cron in-process                                    |

---

## Confirmed API flows

### Onramp (COP → USDT)

```
POST /api/reload/r2p/pse/           → initiate payment, get money_movement_id
POST /api/reload/r2p/nequi/         →  (same)
POST /api/reload/r2p/bancolombia/   →  (same)

Poll GET /reload/r2p/status/{money_movement_id}/
  initiated → pending → processing → succeeded / failed / expired
  succeeded → triggerBridge()
```

R2P statuses:

| Status       | Meaning                               |
| ------------ | ------------------------------------- |
| `initiated`  | Waiting for user to pay               |
| `pending`    | Payment pending confirmation          |
| `processing` | Processing                            |
| `succeeded`  | Payment complete ✅ → trigger bridge  |
| `failed`     | Payment failed ❌ → mark order failed |
| `expired`    | Link expired ❌ → mark order failed   |

### Offramp (USDC → COP)

```
POST /v2/exchange/quotes/           → get rate + COP amount (valid ~3 min)
POST /v2/exchange/initiate/         → lock rate, send USDT to Colurs wallet
POST /v2/exchange/execute/          → REQUIRED: process movement internally
[automatic]                         → COP dispersed to bank account on completion

Poll GET /v2/exchange/movements/{sale_crypto_id}/
  initiated → processing → completed / failed / rejected
  completed → mark order completed, notify user
```

Exchange movement statuses:

| Status       | Meaning              |
| ------------ | -------------------- |
| `initiated`  | Movement created     |
| `processing` | FX being processed   |
| `completed`  | COP sent to bank ✅  |
| `failed`     | Movement failed ❌   |
| `rejected`   | Movement rejected ❌ |

---

## Changes needed

### 1. Fix `colurs_fx.service.ts`

**`initiateExchange()`** — remove fields not in Colurs spec:

- Remove `source_account_id`
- Remove `destination_account_id`
- Remove env reads for `COLURS_SOURCE_ACCOUNT_ID` / `COLURS_DESTINATION_ACCOUNT_ID`

Correct body:

```typescript
{
  quote_id: quoteId,
  bank_account_id: bankAccountId,
  external_id: externalId,
}
```

**`executeExchange()`** — fix field name:

- `sale_crypto_id` → `sales_crypto_id` (note the 's' — Colurs uses different names in initiate response vs execute body)

**Add `getMovement(uuid)`**:

```typescript
GET /v2/exchange/movements/{uuid}/
→ { status, sale_crypto_id, quote_id, ... }
```

---

### 2. Fix `offramp_controller.ts`

Add `executeExchange(movement.sale_crypto_id)` call immediately after `initiateExchange()` succeeds. Both calls must complete before responding 201.

---

### 3. Delete `webhook_colurs_controller.ts`

No webhooks exist. The entire file is dead code.
Also remove the `/webhook/colurs` route from `routes.ts`.

---

### 4. Add `getPaymentStatus()` to `colurs_payment.service.ts`

```typescript
GET /reload/r2p/status/{money_movement_id}/
→ { status, money_movement_id, tracking_key, ... }
```

---

### 5. DB migrations — add polling columns

**`offramp_orders`:**

```sql
ALTER TABLE offramp_orders
  ADD COLUMN polled_at TIMESTAMPTZ,
  ADD COLUMN poll_count INTEGER NOT NULL DEFAULT 0;
```

**`onramp_orders`:**

```sql
ALTER TABLE onramp_orders
  ADD COLUMN polled_at TIMESTAMPTZ,
  ADD COLUMN poll_count INTEGER NOT NULL DEFAULT 0;
```

`polled_at` — timestamp of last poll, used to space polls (avoids hammering Colurs on every tick if the scheduler fires faster than the interval).
`poll_count` — used to give up after a threshold (e.g. 7 days × 1440 polls/day = ~10k polls → mark `needs_reconciliation`).

---

### 6. New: `app/jobs/poll_colurs_movements.ts`

Polls exchange movement status for all active offramp orders.

```
Find offramp_orders WHERE status IN ('pending_fx', 'processing')
  AND colurs_movement_id IS NOT NULL
  AND (polled_at IS NULL OR polled_at < now() - interval '55 seconds')

For each order:
  GET /v2/exchange/movements/{colurs_movement_id}/
  completed  → status = 'completed', notify user via WhatsApp
  failed     → status = 'failed'
  rejected   → status = 'failed'
  poll_count > 10080 (7 days at 1/min) → status = 'needs_reconciliation'
  Update polled_at, poll_count on every tick
```

---

### 7. New: `app/jobs/poll_r2p_payments.ts`

Polls R2P payment status for all active onramp orders.
Contains the logic previously in `WebhookColursController.onPaymentCompleted()`.

```
Find onramp_orders WHERE status IN ('pending', 'initiating_payment')
  AND colurs_payment_id IS NOT NULL
  AND (polled_at IS NULL OR polled_at < now() - interval '25 seconds')

For each order:
  GET /reload/r2p/status/{colurs_payment_id}/
  succeeded → atomic claim (pending → paid) → second claim (paid → initiating_bridge) → triggerBridge()
  failed    → status = 'failed'
  expired   → status = 'failed'
  poll_count > 2880 (24 hours at 1/30s) → status = 'needs_reconciliation'
  Update polled_at, poll_count on every tick
```

The atomic two-phase claim logic from the old webhook handler is preserved exactly:

1. `UPDATE WHERE status IN ('pending','initiating_payment') SET status='paid'` — idempotent
2. `UPDATE WHERE status='paid' SET status='initiating_bridge' RETURNING id` — prevents double bridge

---

### 8. New: `providers/scheduler_provider.ts`

Runs both polling jobs inside the existing web server process via `node-cron`.
No new Railway service. No Redis.

```typescript
// Boot on app start
cron.schedule('* * * * *', () => pollColursMovements()) // every 60s — offramp
cron.schedule('*/30 * * * * *', () => pollR2pPayments()) // every 30s — onramp
```

Each job uses a module-level `isRunning` flag to prevent overlapping runs if Colurs is slow.

---

### 9. Register provider in `adonisrc.ts`

```typescript
providers: [
  // ...existing
  () => import('#providers/scheduler_provider'),
]
```

---

### 10. Env cleanup

Remove from `.env` and `env.ts`:

- `COLURS_SOURCE_ACCOUNT_ID`
- `COLURS_DESTINATION_ACCOUNT_ID`
- `COLURS_WEBHOOK_SECRET`

---

## Polling intervals rationale

| Job                          | Interval | Why                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| Offramp (exchange movements) | 60s      | FX takes 1–3 business days — 1-min resolution is plenty                  |
| Onramp (R2P payments)        | 30s      | User is actively waiting at the payment screen — faster feedback matters |

---

## Give-up thresholds

| Order type | Threshold                       | Action                                          |
| ---------- | ------------------------------- | ----------------------------------------------- |
| Offramp    | 7 days (10,080 polls at 1/min)  | `needs_reconciliation`                          |
| Onramp     | 24 hours (2,880 polls at 1/30s) | `needs_reconciliation` — PSE/Nequi links expire |

---

## Notifications (post-polling)

| Event             | Trigger                   | Template            |
| ----------------- | ------------------------- | ------------------- |
| Onramp completed  | `succeeded` → bridge done | `onramp_completed`  |
| Onramp failed     | `failed` / `expired`      | `onramp_failed`     |
| Offramp completed | `completed`               | `offramp_completed` |
| Offramp failed    | `failed` / `rejected`     | `offramp_failed`    |

WhatsApp templates must be pre-approved in Meta Business Manager before use.

---

## Build order

1. Fix `colurs_fx.service.ts` (initiate body, execute field, add getMovement)
2. Add `getPaymentStatus()` to `colurs_payment.service.ts`
3. Fix `offramp_controller.ts` (add executeExchange call)
4. Delete `webhook_colurs_controller.ts` + remove route
5. DB migrations (polled_at, poll_count on both tables)
6. `app/jobs/poll_colurs_movements.ts`
7. `app/jobs/poll_r2p_payments.ts`
8. `providers/scheduler_provider.ts` + register in `adonisrc.ts`
9. Env cleanup

---

## What stays unchanged

| Component                       | Notes                         |
| ------------------------------- | ----------------------------- |
| `colurs_auth.service.ts`        | No changes                    |
| `colurs_payment.service.ts`     | Add `getPaymentStatus()` only |
| `colurs_bank.service.ts`        | No changes                    |
| `colurs_kyc.service.ts`         | No changes                    |
| `OnrampController`              | No changes                    |
| `onramp_bridge.service.ts`      | No changes                    |
| `webhook_alchemy_controller.ts` | No changes                    |
| `onchain_writer.service.ts`     | No changes                    |
| LiFi widget in `apps/fund`      | No changes                    |
| Coinbase onramp                 | No changes                    |
| Spend permission / CDP wallet   | No changes                    |

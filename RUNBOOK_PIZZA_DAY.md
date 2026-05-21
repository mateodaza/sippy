# Pizza Day Cartagena 2026 — Ops Runbook

Read this before doors open. Keep this terminal open at the stand.

---

## TL;DR for the stand

| You see                               | Run                                                     | Time                   |
| ------------------------------------- | ------------------------------------------------------- | ---------------------- |
| Anything weird before doors           | `cd apps/backend && pnpm tsx scripts/preflight.ts`      | 30s                    |
| Want a health snapshot mid-event      | `pnpm tsx scripts/audit_24h.ts`                         | 5s                     |
| User stuck mid-onboarding             | `pnpm tsx scripts/smoke_onboarding.ts +57<their_phone>` | until they retry       |
| Test the full flow on a fresh number  | same script + drive a real phone                        | 3-5 min                |
| Sanity check vendor pay-QR resolution | `pnpm tsx scripts/pay_qr_smoke.ts`                      | 5s (writes 1 scan row) |
| Suspect classifier regression         | `node ace smart:eval --preset=primary`                  | 2 min, costs ~$0.03    |

All scripts read `apps/backend/.env` for prod credentials. Don't change `.env` mid-event.

---

## Pre-event checklist (run once before doors)

```bash
cd apps/backend
pnpm tsx scripts/preflight.ts          # 12 checks, exit 0 = cleared
pnpm tsx scripts/audit_24h.ts          # 24h snapshot, exit 0 = no anomalies
pnpm tsx scripts/pay_qr_smoke.ts       # verify receive path end-to-end
```

All three must exit 0. If any fails, **don't open doors** — diagnose first.

---

## Live state (snapshot before event)

|                                        | Value                                        | Healthy if                                 |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| GasRefuel V1 (`0xE4e5...4936`) balance | 0.026 ETH                                    | ≥ 0.015 ETH (300 attendees × 0.00005 drip) |
| GasRefuel `refuelAmount`               | 0.00005 ETH                                  | matches backend `GAS_MIN_BALANCE_ETH`      |
| GasRefuel `minBalance`                 | 0.0005 ETH                                   | ≥ backend constant                         |
| Spender (`0xB396...beb1`) balance      | 0.0074 ETH                                   | ≥ 0.002 ETH (~4,000 UserOps)               |
| SMART classifier pass rate             | 100% (baseline 93.8%)                        | regression alerts vs baseline              |
| Owner wallet for top-ups               | `0x42782400B08345f1A9232b08203b09a3E847B985` | has key, can sign                          |

---

## Common scenarios + actions

### "User said the bot didn't reply / setup didn't work"

1. Get their phone number.
2. Run: `pnpm tsx scripts/smoke_onboarding.ts +57<their_phone>` — watches them through 5 checkpoints in real time.
3. Tell them to retry. Watch which checkpoint goes red.
4. Map the failure:

| Checkpoint timeout              | What to do                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (bot received first inbound)  | Bot didn't see their message. Check WhatsApp Cloud API status. Have them retry.                                                                |
| 2 (CDP wallet created)          | /setup flow stalled. Have them refresh the /setup link. Check CDP status.                                                                      |
| 3 (gas refuel landed)           | GasRefuel contract issue. Check `paused()` + balance with preflight.                                                                           |
| 4 (spend permission registered) | UserOp failed. Either: gas spike on Arbitrum, CDP listSpendPermissions race, or bundler hiccup. Wait 2 min, have them retry from Terms screen. |
| 5 (first USDC send)             | Send-path issue. Check spender ETH balance (audit script).                                                                                     |

### "User's wallet has no ETH and onboarding said failed"

- Likely hit the V1 contract cooldown (10 min) or daily cap (3/day). Read their state:
  ```bash
  # From the DB
  DB_URL=$(grep '^DATABASE_URL=' apps/backend/.env | cut -d= -f2-)
  psql "$DB_URL" -c "SELECT phone_number, wallet_address, spend_permission_hash FROM phone_registry WHERE phone_number = '+57XXXXXXXXXX';"
  ```
- If their balance < 0.00005 ETH and contract cooldown still firing, manual fund from owner wallet:
  ```bash
  cd contracts/gas-refuel
  source .env
  cast send --private-key "$REFUEL_ADMIN_PRIVATE_KEY" --rpc-url "$ARBITRUM_RPC_URL" <user_wallet_address> --value 100000000000000  # 0.0001 ETH direct
  ```
  Bypasses GasRefuel entirely. ~$0.001 cost.

### "GasRefuel contract is running low"

```bash
# Top up by 0.01 ETH from owner wallet (replace 10000000000000000 wei for different amount)
cd contracts/gas-refuel
source .env
cast send --private-key "$REFUEL_ADMIN_PRIVATE_KEY" --rpc-url "$ARBITRUM_RPC_URL" \
  0xE4e5474E97E89d990082505fC5708A6a11849936 --value 10000000000000000
```

Or send directly from owner wallet via any wallet UI to `0xE4e5474E97E89d990082505fC5708A6a11849936`.

### "Spender ETH is somehow low"

Spender pays UserOp gas. Each UserOp costs ~$0.001. 0.0074 ETH ≈ 14,800 UserOps of headroom — should never run out at 300-attendee scale. If it does:

```bash
cd contracts/gas-refuel
source .env
cast send --private-key "$REFUEL_ADMIN_PRIVATE_KEY" --rpc-url "$ARBITRUM_RPC_URL" \
  0xB396805F4C4eb7A45E237A9468FB647C982fBeb1 --value 1000000000000000  # 0.001 ETH
```

### "Vendor's pay-QR doesn't scan / sends user nowhere"

```bash
cd apps/backend
pnpm tsx scripts/pay_qr_smoke.ts   # tests the picked-at-random active pay-QR end-to-end
```

If output fails on:

- Step 3 (backend responds non-2xx): backend down or webhook stale. Check `preflight.ts` step 1.
- Step 4 (outcome not 'redirected'): QR revoked. Vendor needs to mint a new one via `mi codigo de pago`.
- Step 7 (bracket token missing): bot parser will silently break. Roll back recent backend deploy if any.

### "Bot says 'no entendí' a lot"

That's the SMART classifier returning null. Usually means:

- Groq API is degraded (check https://status.groq.com)
- Or a specific phrasing isn't covered

To diagnose:

```bash
cd apps/backend
node ace smart:eval --preset=primary
```

Pass rate should be ≥ 90%. If below baseline, surface failed cases via the `↳ reasoning:` line. If only a few specific phrases fail, regex layer probably catches the canonical forms — UX papercut, not money-loss.

---

## Kill switches

|                                         | What it does                                                                                   | Toggle                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `SMART_MODE_ENABLED=true` (Railway env) | Enables LLM classifier. Setting to `false` falls back to regex-only — safer if Groq goes down. | Railway env var, redeploy                      |
| GasRefuel V1 `pause()` (admin only)     | Halts all refuels. Existing users with balance still work; new onboarding stops.               | `cast send 0xE4e5...4936 "pause()"` from owner |
| Spender wallet drain                    | Emergency only — would freeze all sends. Don't unless told to.                                 | Owner sends from spender to a holding address  |

**Owner key lives only in `contracts/gas-refuel/.env` (`REFUEL_ADMIN_PRIVATE_KEY`).** Treat it like cash.

---

## Rollback plan

If a backend deploy breaks things:

1. **Railway dashboard** → Sippy backend service → "Deployments" tab
2. Find the previous green deploy (the one before the bad one)
3. Click "Redeploy" on that previous deploy
4. Typically live within 60-90 seconds
5. Confirm with `pnpm tsx scripts/preflight.ts`

Frontend rollback: same flow on Vercel dashboard.

**On-chain change rollback:** see "common scenarios" — `setRefuelAmount` and `setMinBalance` are owner-only and can be re-set to any prior value. Use the existing safe script: `pnpm tsx contracts/gas-refuel/scripts/update-params.ts` (dry-run by default, requires `CONFIRM=yes` to send).

---

## During-event ops cadence

- **Every ~30 min**: `pnpm tsx scripts/audit_24h.ts` — eyeball stuck wallets, refuel volume, send volume.
- **Every ~hour**: glance at GasRefuel + Spender balances via preflight or Arbiscan:
  - https://arbiscan.io/address/0xE4e5474E97E89d990082505fC5708A6a11849936
  - https://arbiscan.io/address/0xB396805F4C4eb7A45E237A9468FB647C982fBeb1
- **When a user reports a problem**: smoke_onboarding script with their phone, watch live.

---

## What we know is safe (proven night-before)

- ✅ Bot intent classifier (regex layer): 24/24 acceptance commands pass (Japa spec)
- ✅ Bot intent classifier (SMART/LLM layer): 100% golden eval pass with schema patches
- ✅ Pay-QR receive path: bracket token preserved end-to-end, owner has wallet
- ✅ V1 contracts published (Sourcify + Arbiscan)
- ✅ Drip + minBalance invariant holds (`GAS_MIN_BALANCE_ETH ≤ refuelAmount ≤ minBalance`)
- ✅ 2 new users onboarded successfully today after the GAS_MIN_BALANCE_ETH fix deployed
- ⏳ Fresh-phone end-to-end E2E with real WhatsApp + browser + OTP: **NOT YET TESTED** — do this with a spare phone before doors open

## What is NOT covered tonight

- WhatsApp template delivery to non-LATAM country codes (memory: business verification pending)
- POAP DM flow (Carlos working on it)
- Behavior under genuine bundler / Groq / Twilio outage
- Multiple concurrent onboardings (race conditions in spend-permission flow)
- Long-tail Spanish/Portuguese phrasings not in golden dataset

---

## Contacts / handles

- Mateo: product + ops
- Carlos: backend + POAP
- Lina: legal + compliance (not on-call for event-day technical)
- Stand location: confirm with Cartagena Onchain organizers
- Sippy bot WhatsApp number: `+1 472-226-1449`

---

_Last reviewed: 2026-05-21, eve of Pizza Day Cartagena 2026._

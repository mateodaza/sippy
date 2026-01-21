# Embedded Wallets + Spend Permissions - Implementation TODO

## Status: Ready for E2E Testing

### Completed - Core Implementation
- [x] Backend: `embedded-wallet.service.ts` - Core spend permission transfer logic
- [x] Backend: Atomic batched spend+transfer in single user operation
- [x] Backend: `getRemainingAllowance()` - Query on-chain spend tracking
- [x] Backend: `send.command.ts` - Integrated embedded wallet flow
- [x] Backend: `start.command.ts` - Detect embedded vs legacy wallets
- [x] Frontend: `setup/page.tsx` - CDP SMS auth + spend permission creation
- [x] Frontend: `cdp-provider.tsx` - CDP React context
- [x] Config: Network config with SIPPY_SPENDER_ADDRESS
- [x] Backend: `/api/register-wallet` endpoint - Store wallet after OTP verification
- [x] Backend: `/api/register-permission` endpoint - Store permission hash after approval
- [x] Backend: `/api/revoke-permission` endpoint - Clear permission from database
- [x] Backend: `/api/wallet-status` endpoint - Check wallet/permission status
- [x] Backend: Verify CDP access token in register endpoints (JWT validation)
- [x] Frontend: Settings page (`/settings`) - View/revoke/change permissions

### Completed - Audit Fixes (Round 1)
- [x] Fix: permissionHash mismatch - Frontend sends dailyLimit only, backend finds permission onchain via `listSpendPermissions`
- [x] Fix: evmAccounts vs evmSmartAccounts - Check `evmSmartAccounts` first with fallback to `evmAccounts`
- [x] Fix: Legacy recipient support - `sendToPhoneNumber` now checks both embedded and legacy wallets
- [x] Fix: SIPPY_SPENDER_ADDRESS vs dynamic spender - Routes now use `getSippySpenderAccount()` for consistency

### Completed - Audit Fixes (Round 2)
- [x] Fix: Permission registration non-blocking - UI now throws on failure, preventing "done" state with broken DB
- [x] Fix: Permission selection non-deterministic - Uses stored hash with fallback to most recent (by start time)
- [x] Fix: Revoke missing paymaster - Added `useCdpPaymaster: true` so users without gas can revoke

### Completed - Audit Fixes (Round 3)
- [x] Fix: daily_limit from client not validated - Backend derives from onchain permission allowance (source of truth)
- [x] Fix: No remaining allowance pre-check - Send path now checks `getRemainingAllowance()` before attempting transfer
- [x] Fix: Revoke response not validated - UI throws if backend `/api/revoke-permission` fails

### Completed - Audit Fixes (Round 4)
- [x] Fix: Settings UI ignores backend response - Now uses `data.dailyLimit` from `/api/register-permission` response

---

## High Priority - Testing Required

### End-to-End Testing Checklist
- [ ] **Setup Flow**: WhatsApp link → SMS OTP → Wallet creation → Permission approval → Backend registration
- [ ] **Settings Flow**: SMS auth → View current limit → Change limit → Verify onchain → Revoke → Re-enable
- [ ] **Send Flow**: WhatsApp "send $5 to +57..." → Allowance pre-check → Atomic spend+transfer → Remaining shown
- [ ] **Limit Change + Send**: Change limit in settings → Send via WhatsApp → Confirm new limit applies
- [ ] **Allowance Exhaustion**: Spend up to limit → Verify clear error message with reset time
- [ ] **Revoke + Send**: Revoke in settings → Attempt send via WhatsApp → Verify error directs to setup

### Database Migration
- [ ] Add `spend_permission_hash` column to `phone_registry` (if not exists)
- [ ] Add `daily_limit` column to `phone_registry` (if not exists)
- [ ] Add `permission_created_at` column to `phone_registry` (if not exists)

---

## Medium Priority - User Experience

- [ ] Backend: `limit` command - Show remaining allowance via WhatsApp
- [ ] Backend: Better error messages for specific spend permission failures
- [ ] Frontend: Show remaining allowance on settings page (fetch from backend)

---

## Security Enhancements (Optional)

- [ ] PIN verification for transfers above threshold (e.g., >$50)
- [ ] Rate limiting per phone number
- [ ] Suspicious activity detection (many small transfers, new recipients)
- [ ] Notification on permission creation/revocation

---

## LatAm Expansion Prep (Future)

- [ ] Multi-country phone number parsing (Mexico +52, Argentina +54, Brazil +55)
- [ ] Regional RPC endpoints for latency optimization
- [ ] **Regional spenders per country** (e.g., `sippy-spender-co`, `sippy-spender-mx`, `sippy-spender-ar`)
  - Assign spender at user setup based on phone country code
  - Enables parallelism across regions
  - Isolates risk per country
  - Simplifies regulatory compliance if needed
- [ ] Database read replicas for scale
- [ ] WhatsApp Business API rate limit monitoring

---

## Technical Debt

- [ ] Remove legacy server wallet code once migration complete
- [ ] Add proper TypeScript types for CDP SDK responses (remove `any` casts)
- [ ] Unit tests for `embedded-wallet.service.ts`
- [ ] Integration tests with CDP testnet

---

## Architecture Notes

### Spend Permission Flow
```
User Setup (one-time, web):
1. WhatsApp → Sippy sends setup link
2. User opens web, verifies phone via SMS OTP
3. CDP creates embedded wallet (user owns keys)
4. User approves spend permission (signs once)
5. Permission stored on-chain, backend registers hash

Daily Usage (WhatsApp only):
1. User: "send $5 to maria"
2. Backend pre-checks remaining allowance
3. Sippy backend executes atomic userOp:
   - SpendPermissionManager.spend() → pulls USDC to spender
   - USDC.transfer() → sends to recipient
4. No signature needed - permission already granted
5. User sees: "Sent! $95 remaining (resets in 18 hours)"
```

### Key Contracts
- SpendPermissionManager: `0xf85210B21cC50302F477BA56686d2019dC9b67Ad`
- USDC (Arbitrum): `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- Sippy Spender: `0xB396805F4C4eb7A45E237A9468FB647C982fBeb1`

### Key Implementation Details
- **Permission Selection**: Prefers stored `spend_permission_hash`, falls back to most recent by `start` time
- **Daily Limit**: Derived from onchain permission `allowance` field (source of truth)
- **Remaining Allowance**: Queried from `SpendPermissionManager.getCurrentPeriod()` before each send
- **Gas**: All user operations use CDP paymaster (gasless for users)

### Scalability
- Single spender can handle millions of users
- CDP rate limit: 500 writes/10s (~4.3M tx/day)
- Main bottlenecks: Database, WhatsApp API (80 msg/sec)

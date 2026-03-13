# Security Audit — M1 (AU-001)

Date: 2026-03-13
Scope: All backend controllers, key services (cdp_wallet, embedded_wallet), send_command, errors, schemas.

## Findings

| ID    | File                                          | Finding                                                                                                                                    | Severity | Status        |
|-------|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|----------|---------------|
| F-001 | `embedded_wallet_controller.ts:628`           | `sendFromWeb` catch block returned raw `error.message` to user — leaks internal error text (network names, internal URLs, allowance details) | P0       | Fixed (AU-001) |
| F-002 | `embedded_wallet_controller.ts:600-603`       | `sendFromWeb` validated positive/non-NaN but NOT ≤ 6 decimal places or max $10,000 cap before on-chain tx                                  | P0       | Fixed (AU-001) |
| F-003 | `auth_api_controller.ts`                      | 11 catch blocks (`sendOtp`, `verifyOtp`, `sendEmailCode`, `verifyEmailCode`, `emailStatus`, `sendGateCode`, `verifyGateCode`, `validateExportGate`, `userLanguage`, `setLanguage`, `jwks`) used bare `catch {}` with no `logger.error()` — server-side errors silently discarded | P1 | Fixed (AU-001) |
| F-004 | `notify_controller.ts:43-49`                  | `amount` and `txHash` fields validated only for presence, not type (`typeof ... !== 'string'`)                                              | P1       | Fixed (AU-001) |
| F-005 | `embedded_wallet.service.ts:278`              | `sendWithSpendPermission` passed `amount` directly to `ethers.utils.parseUnits` — no decimal validation at service layer; callers must validate or ethers throws opaque error | P1 | Fixed (AU-001) |
| F-006 | `resolve_controller.ts:84-89`                 | `byAddress` did not validate address against `^0x[a-fA-F0-9]{40}$` before DB query                                                        | P2       | Fixed (AU-001) |
| F-007 | `debug_controller.ts`                         | `/debug/wallets` returns all phone→wallet mappings with no authentication                                                                   | P2       | Documented only — design choice, deferred to future security task (AC-001 or MO task) |

## Notes

- All phone normalization confirmed using `canonicalizePhone()` throughout. No SQL injection found (all parameterized queries).
- F-007 deferred: adding auth to debug endpoints requires admin token infrastructure not yet built.
- This document also serves as the AU-002 anchor for memory/race findings.

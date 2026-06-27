# Onboarding reliability — queued follow-ups (run in parallel with / after Track B)

Two small, independent pieces to pick up while Track B (sponsored onboarding / GasRefuel removal) is in flight. Both are scoped, both want their own branch + a diff handed back for audit before merge. Context: A2/A3 (setup auth retry-before-clear + idempotent register-permission adopt-first/backoff) is **live and validated on a real prod signup** — these are the next reliability moves.

---

## 1 · Onboarding-health monitor (backend scheduled job + alert) — **prioritize this**

So a success-rate dip gets caught automatically (the same day), not discovered at a demo. This is the safety net that the 12%-stuck discovery (via Pascal at a live talk) should have come from.

- **Mirror the existing scheduled-job + alert pattern** — the `gas_aa` reconciler / its `ALERT_AGE_SEC` stuck-op alarm, wired to the same channel the team actually watches. Run **daily**.
- **Query** — note `phone_registry.created_at` is stored as epoch **milliseconds**; if joining `onchain.refuel_event`, normalize address casing with `lower()` on both sides (checksummed in `phone_registry`, lowercase on-chain):

  ```sql
  SELECT
    count(*) FILTER (WHERE to_timestamp(created_at/1000) > now() - interval '7 days')                       AS reg_7d,
    count(*) FILTER (WHERE to_timestamp(created_at/1000) > now() - interval '7 days'
                     AND spend_permission_hash IS NOT NULL)                                                 AS done_7d
  FROM phone_registry;
  ```

- **Metric + alert:** `done_7d / reg_7d` = rolling 7-day onboarding success. **Alert** when it drops below **0.90** _and_ `reg_7d >= 5` (no low-volume false alarms). Include the absolute stuck-this-period count in the alert.
- **Also** emit a short **weekly summary** (rate + stuck count) even when healthy, so the number stays visible.
- Read-only (SELECT only). Tests for the threshold + min-volume logic. Separate from Track B.

---

## 2 · A4 (diagnosable errors) + A6 (address casing) — one small PR, separate branch

Both are **permanent** Track-A fixes (Track B does not supersede them). A4 makes failures legible (and feeds the monitor above); A6 kills a latent silent-miss bug.

### A4 — two-layer errors in the permission step

- Location: `apps/web/app/setup/page.tsx`, `handleApprovePermission` catch (~:1295). Today failures collapse to opaque `errCreatePermission` / `errRegisterPermission`.
- Introduce **stable error codes** (enum, e.g. `GAS_INSUFFICIENT`, `GRANT_FAILED`, `REGISTER_FAILED`, `SDK_NOT_READY`, `SESSION_EXPIRED`).
- **Log the full provider/CDP/RPC cause internally**, tagged with the code.
- **Surface to the user only the code + human copy** — never raw provider/CDP/RPC text.
- Net: every onboarding failure is greppable/measurable by code (the monitor can break the rate down by failure code), and the user sees clean copy.

### A6 — normalize address casing in backend lookups

- `phone_registry.wallet_address` is **checksummed**; `onchain.refuel_event."user"` (and likely other lookups) is **lowercase**. Any case-sensitive `=` / `===` on addresses silently misses → re-drips, missed adoptions, mis-bucketed users.
- Grep the gas / permission / refuel paths for address comparisons and `lower()` both sides.
- Add a test that a checksummed address matches its lowercase counterpart.

Tests green + lint on both; hand the diff back for audit before merge.

---

## Sequencing

1. **Monitor first** — independent of everything, turns "found out at the talk" into "pinged the same day."
2. **A4 + A6** — small cleanup PR; A4 makes the monitor's data legible, A6 removes the silent-miss bug.
3. **Track B** (V3-proper → sponsored cold op → decommission GasRefuel) continues on its own track; these don't block it and it doesn't supersede them.

When CC's diffs land (monitor, A4/A6, Track B's V3-proper), each gets an audit pass before merge.

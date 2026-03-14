# Sippy M2 Plan — Public Launch

**Grant:** Questbook Arbitrum $25K  
**Milestone:** M2 — $9,250 — Public launch  
**Deadline:** June 5, 2026  
**Starting point:** M1 beta-ready codebase, 50-user beta used to validate onboarding, sends, funding, and ops

---

## Purpose

M2 is not "build the core product." That is already done in M1.

M2 is the milestone where Sippy stops being a strong beta and becomes a product that can survive:

- real user growth
- partial outages
- retries and deploys
- public traffic beyond a single warm operator watching logs

The code focus for M2 is therefore:

1. make money movement durable under failure
2. make auth and recovery strong enough for normal users
3. make onramp/off-ramp real, not demo-grade
4. remove single-instance assumptions before public launch
5. tighten the web product for repeated, real-world use

---

## Starting State

As of March 14, 2026:

- WhatsApp send, balance, history, settings, privacy, and language flows are live
- web wallet fallback is live
- custom auth (Twilio OTP + JWT + CDP `authenticateWithJWT`) is live
- security hardening, tiered limits, moderation, monitoring, and audit fixes are in
- fund page supports crypto funding and Coinbase card/bank onramp UI
- beta readiness is code-complete; remaining M1 work is mostly operational

This means M2 should not re-open M1 scope unless beta feedback shows an actual blocker.

---

## M2 Deliverable Definition

M2 is complete when Sippy can handle public launch traffic with:

- a reliable funding path
- a reliable cash-out path
- durable auth and recovery
- deploy-safe state handling
- observable, recoverable money movement
- a web product polished enough for repeat usage, not just first-run setup

---

## M2 Code Workstreams

### W1. Durable Money Movement

Public launch requires every transfer path to answer: did the money move, and if the answer is unclear, how do we reconcile it?

#### W1.1 Transaction reconciliation for uncertain outcomes

- Add a transaction reconciliation layer for CDP timeout / unknown-outcome sends
- Persist "send attempt" records with status lifecycle:
  - `initiated`
  - `submitted`
  - `confirmed`
  - `unknown`
  - `failed`
- Reconcile unknown sends by tx hash, sender, recipient, amount, or CDP operation reference
- Update user-facing messaging:
  - if outcome is unknown, never imply failure
  - give clear "check balance / we are verifying" guidance

**Why:** M1 correctly avoids lying on timeouts, but public launch needs a durable answer after timeout, crash, or partial downstream failure.

#### W1.2 Persist pending confirmations

- Move pending send confirmations out of in-memory state
- Store confirmation records in DB or Redis with TTL
- Survive backend restart between:
  - send request
  - confirmation prompt
  - user reply

**Why:** acceptable for a 50-user beta, not acceptable for public launch.

#### W1.3 Persist global pause and critical safety flags

- Move `isPaused` and any other launch-critical switches out of memory
- Read them on boot
- Make pause state durable across restart/redeploy

---

### W2. Multi-Instance Safety

M1 explicitly accepts single-instance assumptions. M2 removes them.

#### W2.1 Redis-backed ephemeral state

Move the following out of in-memory process state:

- OTP storage / rate buckets
- webhook dedup
- active sends / concurrency guards
- pending confirmations
- velocity limiter buckets
- spam protection
- any LLM quota state that affects real behavior

**Why:** public launch cannot assume one process forever. Split-brain on money or auth state is not acceptable.

#### W2.2 Durable LLM and webhook rate limit state

- Persist or centralize LLM quota tracking
- Ensure deploys and crashes do not reset effective caps
- Keep webhook dedup durable enough to survive restart

---

### W3. Onramp and Off-Ramp

For public launch, funding and cash-out must be productized, not just "possible."

#### W3.1 Real onramp backend integration

Depending on partner path:

- implement partner API client
- create order lifecycle storage
- add signed webhook receiver
- add idempotent completion handling
- support frontend status polling
- wire notifications from backend truth, not UI optimism

Minimum backend pieces:

- `onramp_orders` table
- service client
- `POST /webhook/onramp`
- `GET /api/onramp-status/:orderId`
- notification + reconciliation logic

#### W3.2 Coinbase onramp completion reconciliation

If Coinbase remains part of the public flow:

- add `partnerUserRef` / traceable order metadata
- reconcile completion via backend status/webhook path
- remove any dependence on popup-close heuristics

#### W3.3 Off-ramp integration

This is the highest product-risk feature after core money safety.

Build at least one real off-ramp path with:

- partner abstraction (`offramp.service.ts`)
- order / payout lifecycle tracking
- payout status UI
- WhatsApp status notifications
- failure / reversal handling
- manual-ops fallback hooks for early launch

Minimum launch goal:

- user can move from USDC balance to documented COP cash-out path
- system can show whether payout is pending, complete, failed, or needs support

---

### W4. Auth, Recovery, and Account Security

M2 should make account access feel resilient, not fragile.

#### W4.1 Passkeys / WebAuthn

Implement the M1-deferred passkey work:

- WebAuthn registration after successful OTP auth
- passkey sign-in for returning users
- OTP fallback on new device / lost credential
- passkey management UI in settings

Recommended stack:

- `@simplewebauthn/server`
- `@simplewebauthn/browser`

Minimum DB additions:

- credential ID
- public key
- counter / authenticator metadata
- created / last-used timestamps

#### W4.2 Lost-phone recovery flow

Implement the M1 design-doc item:

- recovery flow backed by verified email
- admin-assisted re-link in early version
- auditable phone reassignment
- explicit checks to prevent account takeover

Minimum backend pieces:

- recovery request record
- secure admin endpoint for phone relink
- verification audit trail
- notification to old and new contact points where possible

#### W4.3 Stronger web session model

- evaluate httpOnly cookie session for web surfaces, or keep JWT but harden rotation and storage
- reduce reliance on long-lived localStorage auth for sensitive flows
- unify session expiry / re-auth UX across setup, wallet, and settings

---

### W5. Web Product Maturity

M1 makes the web product usable. M2 makes it feel deliberate and repeatable.

#### W5.1 Wallet UX polish

- improve send error specificity in wallet UI
- better activity status states
- stronger empty/loading/error states
- consistent re-auth overlays

#### W5.2 Funding UX

- unify crypto funding and fiat funding language
- clear status during pending deposits
- funding history / status if onramp orders exist

#### W5.3 Public profile / shareability polish

- cleaner profile states when privacy is enabled
- improve receipts and sharing flow
- make receipt and profile pages more trustworthy for first-time recipients

#### W5.4 Mobile-first hardening

- finish remaining mobile keyboard / viewport / focus issues
- verify OTP, permission, fund, and send flows on real Android + iPhone
- reduce fragile timing assumptions in React/CDP hook flows

---

### W6. Observability, Ops, and Release Discipline

This is the difference between "it works" and "we can operate it."

#### W6.1 Money movement visibility

- add dashboards for:
  - send attempts by status
  - unknown outcome queue
  - onramp orders
  - off-ramp orders
  - refuel failures
- alert on:
  - repeated CDP timeouts
  - low GasRefuel balance
  - webhook verification failures
  - rising unknown transaction rate

#### W6.2 Release-safe test structure

- separate live LLM tests from main CI path
- fail hard in CI for missing DB where DB-backed specs matter
- add targeted integration coverage for:
  - `/api/send`
  - webhook blocked/pause flow
  - register-wallet onboarding path
  - onramp/off-ramp order lifecycle
  - reconciliation after timeout

#### W6.3 Health and deploy discipline

- Railway health checks for all apps
- explicit release checklist for backend/web/indexer
- deploy-safe migration ordering
- rollback instructions for money-moving changes

---

## Proposed M2 Execution Order

### Phase A — Launch-Critical Public Safety

1. Redis-backed ephemeral state
2. pending confirmation persistence
3. durable pause / critical flags
4. CDP transaction reconciliation
5. `/api/send` and webhook integration coverage upgrades

### Phase B — Funding and Cash-Out

1. onramp order model + backend truth
2. partner webhook/status integration
3. off-ramp path implementation
4. user-facing status and notifications

### Phase C — Auth and Recovery

1. passkeys
2. lost-phone recovery
3. stronger session model for web

### Phase D — Product Polish and Ops

1. wallet/fund/profile UX polish
2. monitoring/alerting
3. CI/test discipline
4. release checklist and rehearsals

---

## Sprinted Execution Plan

Assume M2 starts immediately after the 50-user beta opens and runs through June 5.

### Sprint 0 — Beta Readout and Scope Lock

**Window:** March 27 to March 31

Goals:

- classify beta issues into:
  - must-fix bugs
  - public-launch blockers
  - post-launch polish
- lock the real public-launch funding path
- lock the real public-launch off-ramp path, or explicitly declare fallback mode
- decide whether Redis is:
  - required before any other M2 build
  - or partially replaceable with DB-backed persistence in specific flows

Outputs:

- final M2 scope lock
- named owner per workstream
- partner decision deadline calendar
- public-launch critical-path list

### Sprint 1 — Shared State and Money Safety

**Window:** April 1 to April 12

Must ship in this sprint:

1. Redis-backed shared state foundation
2. pending confirmation persistence
3. durable pause / critical safety flags
4. transaction-attempt persistence
5. reconciliation skeleton for timeout / unknown sends

Minimum unlock set for Sprint 2:

- Redis-backed shared state foundation
- pending confirmation persistence

If Sprint 1 slips, these two items are the hard gate. The remaining three items may spill into Sprint 2, but Sprint 2 should not start without shared state and durable confirmation persistence in place.

Definition of done:

- restart does not drop pending send confirmations
- multi-instance-safe concurrency guard exists for money flows
- timeout path creates a reconcilable record, not just a log line

### Sprint 2 — Reconciliation and Launch-Critical Coverage

**Window:** April 13 to April 26

Must ship in this sprint:

1. full CDP unknown-outcome reconciliation flow
2. integration tests for:
   - `/api/send`
   - webhook blocked-user flow
   - webhook global pause flow
   - register-wallet onboarding path
   - reconciliation after timeout
3. CI hardening:
   - live LLM tests isolated
   - DB-backed tests fail correctly in CI
4. lost-phone recovery backend foundation:
   - recovery request record
   - admin relink endpoint
   - audit trail
   - notification hooks where applicable

Partner decision gate:

- by **April 15**, off-ramp primary path must be chosen
- if not chosen, the launch plan switches to fallback mode immediately

Definition of done:

- no money-moving flow depends on in-memory-only truth
- CI meaningfully protects launch-critical paths

### Sprint 3 — Funding and Cash-Out

**Window:** April 27 to May 10

Must ship in this sprint:

1. onramp order model and backend truth
2. onramp status polling or webhook completion
3. off-ramp service skeleton
4. off-ramp order lifecycle and support states
5. user-facing WhatsApp / web status messaging

Conditional scope:

- if partner integration is stable, complete real off-ramp path
- if partner integration is unstable, ship:
  - explicit fallback UX
  - manual-ops support state
  - admin visibility into pending/failed payouts

Definition of done:

- funding status is driven by backend truth
- off-ramp path is either integrated or explicitly fallback-driven, not ambiguous

### Sprint 4 — Recovery, Session Hardening, and Web Polish

**Window:** May 11 to May 24

Primary work:

1. lost-phone recovery user-facing flow and end-to-end testing
2. stronger session model for web
3. wallet/fund/profile UX polish
4. mobile hardening on real devices
5. monitoring dashboards and alerts

Stretch only:

6. passkeys / WebAuthn

Definition of done:

- recovery exists and is auditable
- web auth feels durable for normal repeat usage
- launch-week monitoring is wired

### Sprint 5 — Launch Stabilization

**Window:** May 25 to June 5

Goals:

1. staging rehearsal of public launch flows
2. bug triage and fixes only
3. no new feature starts
4. runbook completion
5. deploy/rollback rehearsal

Required manual drills:

- unknown-outcome send reconciliation
- onramp completion and failure path
- off-ramp completion and support fallback
- blocked user and global pause behavior
- recovery flow
- refuel low-balance response

---

## June 5 Must-Ship Subset

If scope pressure hits, these are the items that still must ship for public launch.

### Must Ship

- Redis-backed or otherwise shared durable state for money/auth-critical ephemeral flows
- persistent pending confirmations
- transaction reconciliation for unknown outcomes
- durable pause and safety controls
- real onramp backend truth for at least one funding path
- at least one usable off-ramp path, integrated or explicit fallback with operator support
- lost-phone recovery implementation
- launch-critical integration coverage
- dashboards, alerts, runbooks, and health checks

### Should Ship

- stronger web session model
- wallet/fund/profile UX polish
- better user-facing funding and payout status
- admin visibility into reconciliation and payout queues

### Can Slip to M3

- passkeys / WebAuthn
- broader web polish beyond launch-critical clarity
- non-essential UX refinement work
- any new AI-agent or automation layer

---

## Scope Cut Rules

If anything slips, cut in this order:

1. passkeys
2. non-essential UI polish
3. secondary funding-path polish
4. expanded off-ramp automation beyond a reliable fallback

Do **not** cut:

- Redis/shared-state hardening
- reconciliation
- recovery
- launch-critical tests
- monitoring/runbooks

These are not polish. They are the line between beta behavior and public-launch behavior.

---

## Off-Ramp Contingency Decision

Off-ramp is the biggest schedule risk in M2 because it depends on an external partner timeline.

### Decision deadline

By **April 15**, choose one of:

1. **Integrated launch path**
   - partner API path is stable enough to build against
   - proceed with full off-ramp integration in Sprint 3

2. **Fallback launch path**
   - public launch still includes off-ramp, but via explicit assisted/manual-ops flow
   - build:
     - request capture
     - payout status states
     - operator tooling / admin visibility
     - user messaging and SLA expectations

3. **No-launch condition**
   - if neither integrated nor fallback off-ramp is viable, re-evaluate June 5 scope

### Rule

Do not let off-ramp ambiguity silently consume May. If partner reliability is unclear by mid-April, switch to fallback mode deliberately and keep the rest of M2 moving.

---

## Explicit M2 Backlog From Existing Docs

These are the items already implied by current project docs and should be treated as first-class M2 scope:

- passkey support (deferred in M1)
- lost-phone recovery implementation (design-doc only in M1)
- onramp backend integration once partner path is real
- Redis migration before multi-replica / public traffic
- persistent LLM / rate-limit state
- removal of single-instance assumptions accepted in M1
- off-ramp implementation and partner integration

---

## Out of Scope Unless Beta Feedback Forces It

- major WhatsApp command redesign
- new chain support
- new stablecoin support beyond USDC
- broad consumer social features
- loyalty / rewards systems
- speculative AI agent features beyond support and routing

The right M2 instinct is not "add more product." It is "make the existing product survive public use."

---

## Suggested Success Criteria

M2 should be considered ready for public launch when all are true:

- a user can fund reliably through at least one real path
- a user can cash out through at least one real path
- a send with uncertain outcome is later reconciled by the system
- restart / deploy does not erase critical auth or money state
- lost-phone recovery exists and is auditable
- core money flows have real integration coverage
- the team has dashboards, alerts, and runbooks for launch-week failures

Optional stretch criterion:

- passkeys or equivalent stronger return-user auth is live

---

## Immediate Next Step

Start M2 with a short scoping pass after the 50-user beta:

1. classify beta feedback into bugs vs launch blockers vs M2 polish
2. lock the public-launch funding/off-ramp partner path
3. choose state architecture:
   - DB-only where possible
   - Redis where ephemeral shared state is required
4. cut the first M2 sprint around:
   - Redis + pending confirmation persistence
   - CDP reconciliation
   - onramp/off-ramp backend skeleton

That gives M2 a clean shape: public-launch reliability first, new capability second.

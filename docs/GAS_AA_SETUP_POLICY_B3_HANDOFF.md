# Track B — setup sponsorship policy created + the one CC change left before B3

**TL;DR.** I created the prod Pimlico **setup** sponsorship policy. There is exactly **one** small backend change CC must make before B3 can run: the webhook verifier currently checks **one** secret, but Pimlico signs each policy's webhook with its **own** secret, so the setup policy's webhooks would fail verification. Everything else is config you set. The onboard flag stays **OFF** until B3 passes.

---

## 1 · What I created in Pimlico (done)

New policy on the prod account, alongside the two free-send policies:

| Field                 | Value                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| Name                  | `Sippy Gas AA setup onboarding (prod)`                                       |
| **Policy ID**         | **`sp_round_nick_fury`**                                                     |
| Status                | **Inactive** (Pimlico's default for new policies — leave it until B3 step 1) |
| Chains                | All mainnet (Arbitrum One included; the op only ever runs on 42161)          |
| Global cap            | **$50** total, reset _never_                                                 |
| Per-op cap            | **$1.00** per user operation                                                 |
| Per-user cap          | none (the webhook DB-binding is the per-user gate, mirroring free-send)      |
| Webhook               | enabled → `https://backend.sippy.lat/webhook/pimlico/sponsorship`            |
| Webhook secret        | auto-generated, **per-policy** (distinct from the free-send secret)          |
| Contract restrictions | off (the webhook row-binding is the authority, mirroring free-send)          |

Caps rationale: a cold setup op is ~478–520k gas ≈ ~$0.20 on Arb One even at an elevated gas price. **$1/op** is ~5× headroom so a real onboarding is never rejected by the cap, while still bounding per-op blast radius. **$50 global** ≈ ~250 setup ops of runway at current volume (~16 reg/30d → >1yr) and a bounded ceiling if anything misbehaves. Both are adjustable in 10s on the policy's Edit page — raise the global cap before you exceed ~250 onboards or if volume grows. (Note: hitting the global cap silently rejects further setup ops → the onboarding-health monitor in `GAS_AA_ONBOARDING_FOLLOWUPS.md` is what catches that.)

---

## 2 · The one blocker → CC task: multi-secret webhook verifier

**Why.** Pimlico signs each sponsorship policy's webhook with that policy's **own** secret (confirmed in the dashboard — the secret is shown per-policy, auto-generated at creation, with no field to set a custom one — and in the [docs](https://docs.pimlico.io/guides/how-to/sponsorship-policies/webhook): "the webhook secret … you can find in the sponsorship policy settings"). The setup policy posts to the **same** endpoint as free-send, but signed with a **different** secret. Today `verify()` checks only `PIMLICO_WEBHOOK_SECRET`, so setup webhooks are rejected before lane dispatch. We can't sidestep this by reusing the free-send secret — Pimlico won't let you set a custom secret on a policy.

**Scope: ~20 lines + one env + tests.** No new dependency, no schema change, no logic change to lane dispatch (the lanes already key off `PIMLICO_SETUP_SPONSORSHIP_POLICY_ID`).

### 2a · `apps/backend/start/env.ts` — add the setup webhook secret

In the Track B section (next to `PIMLICO_SETUP_SPONSORSHIP_POLICY_ID`, ~line 253):

```ts
  // The setup lane's OWN Pimlico webhook secret. Pimlico signs each policy's
  // webhook with a distinct per-policy secret, so the verifier must accept this
  // in addition to PIMLICO_WEBHOOK_SECRET (free-send). Unset → setup webhooks
  // can't be verified, so the setup lane stays dark.
  PIMLICO_SETUP_WEBHOOK_SECRET: Env.schema.string.optional(),
```

### 2b · `apps/backend/app/controllers/webhook_pimlico_controller.ts` — select the secret by policy id

**Do NOT blind-try both secrets.** Per-policy secrets exist to isolate the lanes: a verifier that accepts _either_ secret for _any_ payload means a leaked free-send secret also authenticates setup payloads (and vice-versa) — throwing away the isolation. Instead pick the secret from the payload's `sponsorshipPolicyId` and verify against **only** that one. Reading the (still-untrusted) policy id from the raw body to _select_ a candidate secret is safe: the signature check is still the gate — an attacker can claim any policy id but can't forge a signature for a secret they don't hold.

Reuse the existing `freeSendPolicyId()` / `setupPolicyId()` resolvers (they already honor the test overrides). Replace `verify()` (~lines 77–82) and add a selector:

```ts
/** Map the payload's sponsorship policy id to its OWN webhook secret. null ⇒ reject. */
function secretForPolicy(policyId: string): string | null {
  if (!policyId) return null
  if (policyId === freeSendPolicyId()) return env.get('PIMLICO_WEBHOOK_SECRET', '') || null
  if (policyId === setupPolicyId()) return env.get('PIMLICO_SETUP_WEBHOOK_SECRET', '') || null
  return null // unknown / unconfigured policy id
}

function verify(headers: any, payload: string): any {
  if (verifierOverride) return verifierOverride(headers, payload)
  // Parse the raw body ONLY to choose which per-policy secret to check.
  // The pimlicoWebhookVerifier call below is the actual authentication gate.
  let policyId = ''
  try {
    policyId = String(extractObject(JSON.parse(payload))?.sponsorshipPolicyId ?? '')
  } catch {
    throw new Error('malformed webhook body')
  }
  const secret = secretForPolicy(policyId)
  if (!secret) throw new Error('unknown or unconfigured sponsorship policy id')
  return pimlicoWebhookVerifier(secret)(headers, payload) // wrong secret for this policy ⇒ throws ⇒ 401
}
```

Satisfies all four cases: free-send id ⇒ `PIMLICO_WEBHOOK_SECRET`; setup id ⇒ `PIMLICO_SETUP_WEBHOOK_SECRET`; wrong secret for the right id ⇒ verifier throws ⇒ 401; unknown/missing id ⇒ 401. Lane dispatch's `policyMismatch` stays as a second gate — a leaked free-send secret on a setup-shaped op that claims the free-send id still dies there.

**Precondition — keep free-send working.** Secret selection now keys off `freeSendPolicyId()`, so **every env where free-send runs must have `PIMLICO_SPONSORSHIP_POLICY_ID` set** to that env's policy id (prod `sp_round_shiver_man`, staging `sp_wet_tyrannus`). It already is — but confirm before merge, because an unset free-send policy id would now 401 free-send webhooks. Also update the header comment (lines 4–7): verification is per-policy (free-send secret for the free-send policy id, setup secret for the setup policy id).

### 2c · `apps/backend/tests/functional/gas_aa_webhook.spec.ts` — cover per-policy isolation

The harness has `SECRET` / `WRONG_SECRET` + a `sign(secret, payload)` helper, and `__setConfiguredPolicyForTest` / `__setSetupPolicyForTest` for the two policy ids. For the real-verify group (no `verifierOverride`), set both policy ids and both env secrets, then assert:

- free-send policy id + signed with `SECRET` → **accepted** (unchanged);
- setup policy id + signed with `SETUP_SECRET` → **accepted** (new);
- setup policy id + signed with `SECRET` (wrong secret for the right policy) → **401**;
- free-send policy id + signed with `SETUP_SECRET` → **401**;
- unknown or missing `sponsorshipPolicyId` → **401** (both `requested` and `finalized`).

**Acceptance:** all four webhook suites green (`onboard_prepare`, `setup_ledger`, `setup_submitter`, `gas_aa_webhook`); a setup-policy-id payload signed with the setup secret reaches lane dispatch, and the same payload signed with the free-send secret 401s.

---

## 3 · Env vars you set (prod backend) — you do these, not CC

I never handle secrets; copy the secret yourself from the dashboard.

1. `PIMLICO_SETUP_SPONSORSHIP_POLICY_ID = sp_round_nick_fury` _(already in env schema)_
2. `PIMLICO_SETUP_WEBHOOK_SECRET = <copy from the policy page>` _(CC adds this key in 2a)_
   - Dashboard → Sponsorship Policies → **Sippy Gas AA setup onboarding (prod)** → **Webhook Secret** → reveal (eye) → copy.
3. `GAS_AA_ONBOARD_ENABLED` — **leave OFF** until B3 below passes.

---

## 4 · B3 validation runbook (after CC ships §2 and you set §3)

1. **Enable the policy** — dashboard → the setup policy → green **Enable** (it's Inactive now). Without this, Pimlico won't sponsor and the op falls back to legacy, so you'd never actually exercise the sponsored path.
2. **One real frontend onboarding** (no active users on main, so do it there). Prepare → sign → submit → land → register. Watch:
   - the setup op lands on Arb One (I'll decode the first one on-chain to confirm the `[deploy + approve]` envelope and the spender allowance);
   - the spend permission is registered (settings show $50/day), no duplicate grant;
   - **zero GasRefuel delta** — no ETH drip to the new account (that's the whole point);
   - Pimlico **Requests/UserOp logs** show the setup policy sponsored it (not free-send), within the $1 cap.
3. **Canary**: keep the flag on, watch the onboarding-health number + Pimlico usage for the next few real signups. Rollback = flip `GAS_AA_ONBOARD_ENABLED` off (frontend `/prepare` 404s → legacy path, byte-identical to today).

---

## 5 · State summary

- **Built + committed** on `feat/gas-aa-onboard-b1`: B1.0 → B1.1d (prepare/submit, ledger, off-CDP submitter, lane-dispatch webhook, frontend swap). Tests green.
- **Pimlico**: setup policy `sp_round_nick_fury` created, configured, **Inactive**.
- **Remaining before B3**: CC §2 (per-policy verify — secret bound to `sponsorshipPolicyId`, not blind try-both) → you set §3 envs → enable policy → validate.
- The onboarding-health monitor + A4/A6 (`GAS_AA_ONBOARDING_FOLLOWUPS.md`) are independent and still queued.

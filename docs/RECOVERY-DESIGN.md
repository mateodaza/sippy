# Recovery Design

## 1. Overview

Sippy uses Coinbase CDP to manage wallets. This is a non-custodial model — Sippy never holds user private keys. The CDP vault holds the key material; Sippy only holds a reference (wallet ID) bound to the user's phone number.

Because the wallet is bound to a phone number and not a password or seed phrase, losing the phone creates a recovery problem that cannot be solved client-side. This document describes the recovery architecture.

**Two recovery paths exist depending on what the user has:**

| Scenario | Recovery Path |
|---|---|
| User has a verified recovery email on file | M2 admin-assisted relink (Section 4) |
| User has no email and no exported key | Account is unrecoverable (Section 6) |
| User previously exported private key | Import into any compatible wallet directly |

---

## 2. M1 vs M2 Scope

| Feature | Milestone | Status |
|---|---|---|
| Email collection during setup (optional) | M1 | Shipped (ER-005) |
| Email management in settings | M1 | Shipped (ER-006) |
| Email verification via 6-digit code | M1 | Shipped (ER-004, ER-008) |
| Email as 2FA gate for sensitive operations | M1 | Shipped (ER-007) |
| Admin relink endpoint (`POST /admin/relink-phone`) | M2 | Not yet implemented |
| Passkey (FIDO2/WebAuthn) as second factor | M2 | Not yet implemented |

**M1 ships the infrastructure that makes M2 recovery possible** — specifically, the verified recovery email that proves identity during a relink request.

---

## 3. M1: What Ships Now

M1 establishes the recovery email system:

- **Email collection:** Users can add a recovery email during onboarding (optional) or later via the settings page.
- **Email verification:** A 6-digit code is sent via `email_service.ts` (Resend). The code expires after a fixed TTL.
- **Storage:** Three columns are written to `user_preferences`:
  - `email_encrypted` — AES-encrypted email address (for sending future codes)
  - `email_hash` — SHA-256 hash of normalized email (for lookup without decrypting)
  - `email_verified` — boolean flag, set `true` only after code confirmation
- **Sensitive operation gating:** Export key and revoke permission require `email_verified = true` before proceeding (ER-007).

M1 does not ship any recovery flow — it only builds the identity proof layer that M2 will consume.

---

## 4. M2: Lost-Phone Recovery Flow

This flow is for users who have a verified recovery email on file and have lost access to their phone.

**Step 1 — User contacts support**

The user reaches out via the Sippy support channel (channel TBD). They provide their old phone number and explain that they have lost access to it.

**Step 2 — Support verifies identity via recovery email**

Support locates the user's account by old phone number and confirms that a verified recovery email is on file. Support triggers a verification code send to that email address.

**Step 3 — User proves identity**

The user reads the 6-digit code from their recovery email inbox and provides it back to support.

**Step 4 — Support confirms new phone**

Support confirms the user's new phone number (E.164 format). The new number must not already be registered.

**Step 5 — Admin calls relink endpoint**

Support staff calls `POST /admin/relink-phone` with the old phone, new phone, and the email verification proof. The endpoint atomically updates `phone_number` in **both `phone_registry` and `user_preferences`** within a single database transaction, then invalidates all JWTs issued for the old phone.

This dual-table update is required because `phone_registry.phone_number` is the primary key that `jwt_auth_middleware.ts` uses to resolve the wallet and authorize every request. If only `user_preferences` were updated, the new phone's JWT would fail the `phone_registry` lookup on every request and the user would still be locked out. Both tables must be relinked atomically so that no split-brain state exists between the wallet binding and the user preferences.

---

## 5. Admin Endpoint Spec: `POST /admin/relink-phone`

> **Status: M2 — not yet implemented**

```
POST /admin/relink-phone
Auth: Admin Bearer token (scope: admin:relink)

Body:
{
  "oldPhone": string,       // E.164 format
  "newPhone": string,       // E.164 format
  "verificationProof": one of:
    { "type": "email_code", "email": string, "code": string }
}

Responses:
200 { success: true }
401 { error: "unauthorized" }
403 { error: "verification_failed" }
404 { error: "user_not_found" }
409 { error: "new_phone_already_registered" }
422 { error: "invalid_request" }
```

### Implementation notes (for M2 engineers)

- The admin endpoint is behind separate auth middleware — it is not accessible via the regular user JWT path.
- The relink operation **must** be wrapped in a single database transaction that updates `phone_number` in **all phone-keyed account tables**:
  - `phone_registry` — primary wallet binding; `jwt_auth_middleware.ts` queries this table to resolve the wallet and authorize every request. This is the critical table — leaving it unrelinked means the recovered user's JWT (now issued for `newPhone`) will fail the registry lookup and return 401 on every call.
  - `user_preferences` — recovery email and preferences; also keyed on `phone_number`.
- `parse_log.phone_number` is historical logging data, not a live account reference. It does **not** need to be updated for the relink to succeed.
- Existing JWTs issued for `oldPhone` must be invalidated after the transaction commits (e.g., by invalidating the session or rotating a per-user token secret).
- No partial state — if either table update fails, the entire transaction must roll back.
- Audit log the relink event (who performed it, when, old phone hash, new phone hash). **Never log plain phone numbers in audit records.**

---

## 6. Edge Case: No Email + Lost Phone

If the user did not add a recovery email during setup and has since lost their phone:

- There is no way for Sippy support to verify their identity.
- The only recovery path is if the user previously **exported their private key** from the app.
  - If the private key was exported: the user can import it into any compatible wallet directly. The Sippy account is inaccessible but the funds are not lost.
  - If the private key was **never exported** and no email is on file: **the account is unrecoverable.** Sippy cannot help.

**UI recommendation:** Surface the following message to users who have not added an email and have not exported their key:

> "Export your private key and/or add a recovery email to protect your account."

This message should appear in the settings page and/or as a one-time nudge after onboarding.

---

## 7. M2 Passkey Scope (reference only)

Passkeys (FIDO2/WebAuthn) are planned for M2 as a second authentication factor. They would allow recovery without email by binding a device passkey to the account — if the user registers a passkey on a secondary device before losing their primary phone, they could authenticate with the passkey to prove identity.

No implementation spec is provided here. Passkey support would require either:

- A self-service flow: user authenticates with passkey proof to trigger relink without admin involvement.
- An admin-assisted flow: passkey proof is submitted as a new `verificationProof` type on `POST /admin/relink-phone`.

This section is included for context only. Passkey design is deferred to the M2 planning cycle.

---

## 8. Security Considerations

- **Admin endpoint access:** `POST /admin/relink-phone` must never be callable by regular users. It must be behind a separate admin authentication layer with a scoped token (`admin:relink`).
- **Audit logging:** Every relink event must be logged with hashed identifiers only. Plain phone numbers must never appear in logs or audit records.
- **Identity verification:** Support staff must confirm user identity via the email verification code — not just a user claim over a support channel.
- **Atomic update:** The relink transaction must atomically update `phone_registry` and `user_preferences` in a single database transaction. This prevents split-brain state where the wallet lookup succeeds but preferences are orphaned (or vice versa), which would leave the user partially recovered and unable to perform email-gated operations.
- **Session invalidation:** After relinking, all JWTs issued for the old phone number must be invalidated immediately. Stale tokens for the old phone must not remain valid.

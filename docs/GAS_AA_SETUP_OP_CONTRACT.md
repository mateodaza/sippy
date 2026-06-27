# Gas → AA Setup-Op Contract (Track B / slice 2) — LOCKED SEAM

Locks the **prepare → browser-sign → submit** seam for sponsored onboarding _before_
B1.0 bakes interfaces. The reason it can't reuse slice 1's machine verbatim: Pimlico
sponsorship happens at `/prepare`, **before** the browser signature exists — so slice 1's
"once `prepared`, the signed op is persisted and fallback is forbidden"
([off_cdp_submitter.ts:17](../apps/backend/app/services/gas_aa/off_cdp_submitter.ts),
[ledger.ts:140](../apps/backend/app/services/gas_aa/ledger.ts)) needs an explicit
pre-signature state in front of it. This contract adds that state and first-classes the
`initCode` binding. Scope: backend seam + bindings; B1.0 codes the pure parts only.

## 1. Lifecycle — a new `awaiting_signature` state [P1 #1]

```
free_send (unchanged): authorized → prepared → landed | failed | expired
setup     (new):       authorized → awaiting_signature → prepared → landed | failed | expired
```

- **authorized** — row written; `nonce + calls_hash + init_code_hash + bindings` set. The
  Pimlico webhook matches **here** (during `/prepare`'s paymaster fetch). No op returned yet.
- **awaiting_signature** — the sponsored **unsigned** op + `userOpHash` are stored and returned
  to the browser. **No `signed_user_op` yet.** Fallback-eligible (nothing broadcast).
- **prepared** — the verified **signed** op is persisted (at `/submit`). Point of no return:
  rebroadcast-only, exactly as slice 1. **`prepared` still means "`signed_user_op` exists"** —
  it is never set before the signature. (This is the whole point of [P1] #1.)

**`awaiting_signature` is NONCE-ACTIVE everywhere** [P1] — every status set the slice-1 nonce
machinery treats as active must include it, or a second `/prepare` reuses the nonce while the
first unsigned op waits for its signature:

- **ACTIVE** (holds a nonce — the partial-unique index `(chain_id, entry_point, sender,
sender_nonce)`, `maxActiveNonce`, and `findActiveMatch` all gate on this set) =
  `{authorized, awaiting_signature, prepared}`.
- **SWEEPABLE** (no `signed_user_op` ⇒ safe to expire ⇒ releases the nonce) =
  `{authorized, awaiting_signature}`. `prepared` is **never** swept (broadcast — reconciled instead).
- **TERMINAL** (releases the nonce; never matches) = `{landed, failed, expired, cancelled}`.
  `cancelled` is new — the fallback-terminalize state (§2).

## 2. Fallback boundary — the rule

**Signed-op persistence is the boundary**, so slice 1's invariant holds verbatim:

- status ∈ {`authorized`, `awaiting_signature`} (no `signed_user_op`) → legacy **GasRefuel
  onboarding allowed** (nothing was broadcast).
- status = `prepared` (`signed_user_op` persisted) → **only idempotent rebroadcast of the exact
  op**; never GasRefuel, never a rebuild.

**Fallback MUST terminalize the row first, atomically** [P1] — or it double-grants. Falling back
to legacy GasRefuel from `awaiting_signature` requires flipping the row to a terminal state
**before** legacy starts; otherwise the app legacy-grants and a delayed `/submit` on the
still-active sponsored op also broadcasts = the duplicate approve this track kills.

- `cancelSetupOp(opId)` = `UPDATE … SET status='cancelled' WHERE id=$1 AND status='awaiting_signature'`.
  Legacy onboarding proceeds **only if `rowCount=1`** (it won the row). `rowCount=0` ⇒ the op already
  advanced (`prepared`/landed) ⇒ legacy must **not** run.
- `/submit` flips `awaiting_signature → prepared` under the **same** conditional guard
  (`WHERE status='awaiting_signature'`). So `/submit` and `cancelSetupOp` are mutually exclusive —
  exactly one wins. `/submit` on a non-`awaiting_signature` row ⇒ `409`, **no broadcast**.

We only inserted a fallback-eligible window in front of `prepared`, guarded by atomic
terminalization; `prepared ⇒ signed ⇒ no fallback` is unchanged.

## 3. Endpoints

### `POST /api/setup-op/prepare` — authenticated (JWT → phone, walletAddress)

All security-bearing fields are server-built; the browser supplies nothing trusted.

1. ToS gate (as register-permission). Resolve **userEOA** from CDP (authoritative owner of
   `walletAddress`) — not from the request.
2. Build the `SpendPermission`: `account=walletAddress, spender=Sippy, token=USDC,
allowance=tier cap ($50 unverified), period=86400, start=now, end=max-uint48, salt=random`.
3. `calls = [approve(permission)]` → `callsHash`.
4. `initCode = CoinbaseFactory.createAccount([userEOA, SPM], 0)` → `initCodeHash`.
   **ASSERT** `toCoinbaseSmartAccount({owners:[userEOA, SPM]})` derives `walletAddress`
   (convergence, V1) — else `409`, no row written.
5. `insertAuthorized(lane='setup', sender=walletAddress, decodedUser=walletAddress, callsHash,
initCodeHash, capBucket='acct:walletAddress', expiry, meta={salt, allowance, userEOA})`.
6. `claimNonce` (fresh account ⇒ 0) → `setNonce`.
7. `bundler.prepareUserOperation({ sender=walletAddress, initCode, calls, nonce })` — the
   paymaster fetch **fires the webhook**, which matches the `authorized` row (incl.
   `init_code_hash`) and sponsors.
8. Compute the **`userOpHash`** (raw v0.6 4337 hash). This IS the hash the owner signs — **no
   replay-safe wrap** (that's only for `isValidSignature`/messages; `validateUserOp` recovers over
   the userOpHash directly — proven in the Signature-seam section). Store as `user_op_hash`.
9. Store the unsigned op; flip → **awaiting_signature**.

→ `{ opId, unsignedOp, userOpHash }`

### Browser

`useSignEvmHash({ evmAccount: userEOA, hash: userOpHash }) → { signature }` — V2(b) **PASSED**
(runtime sign→ECDSA-recover→owner-in-list, [GAS_AA_SLICE2_STEP0_FINDINGS.md](GAS_AA_SLICE2_STEP0_FINDINGS.md)).

### `POST /api/setup-op/submit` — authenticated · `{ opId, signature }`

1. Load row by `opId`; require row's user == JWT user (same session). Else `409`.
2. **Verify against PERSISTED bytes only** (never recompute from request state): read
   `user_op_hash` + `user_eoa` from the row and check
   `ECDSA-recover(signature, row.user_op_hash) == row.user_eoa`. Else `400` — never broadcast an
   unverified op. The request supplies only `opId` + `signature`; nothing trusted comes from it.
3. Wrap the raw sig as `SignatureWrapper(ownerIndex=0, sig)` (owner[0] = userEOA in `[userEOA, SPM]`)
   and set `op.signature` on the row's persisted `unsigned_user_op`.
4. `markPrepared(opId, userOpHash, signedOp)` — the **atomic** flip
   `… WHERE id=$1 AND status='awaiting_signature'`. `rowCount=0` ⇒ the row was cancelled by a
   fallback (§2) or already advanced ⇒ `409`, **no broadcast**. `rowCount=1` ⇒ **prepared**
   (point of no return).
5. Broadcast → `waitReceipt` → `markLanded`. Post-prepare ambiguity ⇒ reconcile (rebroadcast the
   exact op), **never legacy**. A pre-broadcast failure here leaves the row pre-`prepared` ⇒ the
   frontend may fall back to legacy GasRefuel onboarding **only via `cancelSetupOp` first** (§2).

## 4. Webhook = lane dispatch, not a free-send branch [P1 #3]

Refactor [webhook_pimlico_controller.ts](../apps/backend/app/controllers/webhook_pimlico_controller.ts)
(`decodeAndSanityCheck` is free-send-only today, rejecting non-spender senders at :204):
authenticate raw body → find the row (by paymasterContext `opId` / match key) → **dispatch on
`row.lane`**. Each lane is `{ decode, policy, sanityCheck, bind }`:

| lane        | decoder            | policy                                              | sender must be                        | binds              |
| ----------- | ------------------ | --------------------------------------------------- | ------------------------------------- | ------------------ |
| `free_send` | `decodeFreeSendOp` | `PIMLICO_FREE_SEND_POLICY`                          | the Sippy spender                     | spend + transfer   |
| `setup`     | `decodeSetupOp`    | `PIMLICO_SETUP_POLICY` (own, per-op cap ≥ 478k gas) | `permission.account == walletAddress` | approve + initCode |

A setup op is **never** sponsored by the free-send policy, and vice-versa.

## 5. The setup binding set — every one ⇒ a negative test [P1 #2]

Row is the authority; the calldata decode only _derives_ the bound fields. For `lane=setup` the
**row match** binds: `chain_id, entry_point, sender, sender_nonce, calls_hash` (existing spine)
**+ `init_code_hash`** (new) **+ `decoded_user == sender`**. The decoded op must additionally
satisfy (`sanityCheck`):

- callData decodes to **exactly one** `approve(SpendPermission)` call to the SPM, **no extra
  calls**, **no ETH value**. The outer executor envelope may be **`execute(...)` OR
  `executeBatch([...])`** — viem's `encodeCalls` emits `execute` for a one-call op (verified:
  selector `0xb61d27f6`), while the CDP-built grants used `executeBatch`; both decode to the same
  single call and the **same `calls_hash`**, so the envelope is immaterial to the on-chain effect.
  `calls_hash` + the §5 fields + the row spine are the authority — the envelope is **not** separately
  bound. (If exact-bytes pinning is ever wanted, add a `call_data_hash` of the raw outer callData;
  not needed for security, since both envelopes produce the identical approve.)
- `initCode` present **and == expected** `factory.createAccount([userEOA, SPM], 0)`;
- `permission.account == sender`; `permission.spender == Sippy`; `permission.token == USDC`;
- `permission.allowance ≤ tier cap`.

Anything else ⇒ `{ sponsor: false }`.

## 6. Storage [P1 #2, P2]

**Migration 0032** — setup-only columns (`NULL` for free_send) + the nonce-machinery / status
changes. Every field `/submit` trusts is persisted at `/prepare`; **`/submit` verifies against
these bytes, never against anything recomputed from the request** (only `opId`+`signature` come
from the request).

| column                   | written at                                   | used by                                                                                     |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `init_code_hash TEXT`    | `authorized`                                 | the §5 binding (`findActiveMatch`, webhook)                                                 |
| `unsigned_user_op JSONB` | `awaiting_signature`                         | `/submit` attaches the wrapped sig to THESE bytes (not a rebuild)                           |
| `user_eoa TEXT`          | `awaiting_signature`                         | `/submit` verifies the sig recovers to this                                                 |
| `user_op_hash` (exists)  | set at `awaiting_signature` (known pre-sign) | **IS the `hashToSign`** — `/submit` verifies `recover(signature, user_op_hash) == user_eoa` |

(No separate `hash_to_sign` column — the sig-seam spike proved `hashToSign = userOpHash`.)

- **Status enum** (`GasAaStatus`) gains `awaiting_signature` + `cancelled`.
- **Active-set SQL** — the partial-unique active-nonce index, `maxActiveNonce`, and
  `findActiveMatch` gate on `status IN ('authorized','awaiting_signature','prepared')` (was
  `('authorized','prepared')`). **`sweepExpired`** gates on `('authorized','awaiting_signature')`.
  (0032 drops + recreates the index with the widened `WHERE`.)
- `MatchKey` gains optional `initCodeHash`; `findActiveMatch` binds it for the setup lane (a setup
  row whose `init_code_hash` is null or `!=` the decoded op never matches).

Typed columns over `meta` for every money-path binding (indexable, typed match).

## 7. B1.0 — unblocked by this contract (pure; no DB, no money path)

- [config.ts:24](../apps/backend/app/services/gas_aa/config.ts): `Lane = 'free_send' | 'setup'`.
- `decode.ts`: `buildSetupCalls(permission) → [approve]`; `decodeSetupOp(callData) →
{permission, callsHash} | null`; `expectedSetupInitCode(userEOA) → {initCode, initCodeHash}`;
  the setup `sanityCheck` predicate (§5).
- `flag.ts`: `isGasAaOnboardEnabled()` (`GAS_AA_ONBOARD_ENABLED`, default off).
- Unit tests: encode/decode round-trip; `initCode` convergence vs viem
  `toCoinbaseSmartAccount`; **a negative test per §5 binding**.

B1.1 (submitter prepare/submit split + webhook lane dispatch + migration 0032 +
register-wallet refuel-removal-under-flag) and B1.2 (frontend browser-sign) follow,
money-path-reviewed. **Do not start B1.1/B1.2 until this contract is signed off.**

## Signature seam — RESOLVED 2026-06-26 (B1.1 sig-seam spike, `b11_sig_seam.mjs`)

The spike proved all three of the sharpened criteria (manual hash byte-matches viem · wrapper
byte-matches viem · full counterfactual cold-op EntryPoint validation, `sigFailed=false` / no AA24):

- **`hashToSign = userOpHash`** — the RAW v0.6 4337 hash, **NOT** a replay-safe wrap. The Coinbase
  wallet's `validateUserOp → _validateSignature` recovers over the userOpHash directly (it already
  binds chainId + entryPoint); the EIP-712 replay-safe hash is **only** for `isValidSignature` /
  message signing. viem's `signUserOperation` signs the raw userOpHash (proven byte-equal; the
  replay-safe variant correctly did **not** match). ⇒ `/prepare` returns the `userOpHash`; there is
  **no separate `hash_to_sign`** (it equals `user_op_hash`).
- **`SignatureWrapper = (uint256 ownerIndex, bytes signatureData)`, `ownerIndex = 0`** (owner[0] in
  `[userEOA, SPM]`) — byte-matches viem. The browser signs `userOpHash`; `/submit` recovers the raw
  sig to `user_eoa` and wraps it as `SignatureWrapper(0, sig)`.
- The wrapped sig validated through EntryPoint `simulateValidation` on the **undeployed** account
  (initCode deploys in-sim) — the manual-wrap path the §2.0 gate never covered.

Still open for B3: **Pimlico setup policy + per-op cap ≥ 478k gas** (your setup before the canary).

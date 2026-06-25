# Follow-on — collapse spender-relay sends in the dashboard metrics

Run on `main` (small branch). The stats polish + grant-KPI work is merged; this fixes an **undercount** it left, and surfaces a possible Season-1 launch blocker.

## The problem (verified on prod)

The live feed **collapses** `user→spender→recipient` relay pairs into one logical send (and shows it). But the KPI metrics — `transactedVolume`, `maw`, `activeThisWeek`, `retention`, `dailyTransactedVolume`, `onchainTransactionCount` — **exclude the spender on both legs**, so a relayed send contributes **$0 and 0 transactions**. Prod query result:

> **$1,220 across 208 verified-user → spender transactions** are being dropped.

Those are real sends (very likely the Cartagena event micro-payments — Sippy's best "real usage" proof). The feed shows them; the totals don't. Net effect:

- value-out undercounts (~$9.5K shown vs ~$10.7K true)
- `onchainTransactionCount` drops ~208 logical sends
- **the feed and the dashboard disagree about the same on-chain activity** — a real inconsistency

## Step 1 — confirm what the relays are (don't assume)

Before touching the math: read the send / spend-permission code path and sample the data to confirm the `user→spender` transfers are **relayed sends** (`user→spender` then `spender→recipient`, same tx hash), not something else (gas funding, fee collection, off-ramp legs). Pin the exact collapse rule: match a `user→spender` leg with the `spender→recipient` leg in the **same tx** → one logical `user→recipient` send valued at the user-leg amount. Report what you find before implementing.

## Step 2 — one shared relay-collapse, used by feed AND definitions

The feed already has a relay-collapse `source` (in `season_transactions_controller.ts`). **Extract it into one shared helper** and apply it in `#season/definitions` so the feed and the dashboard use the _same_ collapse:

- `transactedVolume` / `dailyTransactedVolume` — sum the collapsed `user→recipient` value (relayed send counted once, at the user-leg amount; still exclude self / operator / dust).
- `maw` / `activeThisWeek` / `retention` — count verified senders with ≥1 collapsed value-out.
- `onchainTransactionCount` — count the collapsed logical transaction **once** (a relay pair = 1, never 0, never 2).

After: `/stats` value-out and the live feed agree; the transaction count includes the relayed sends; value-out rises to ~$10.7K on prod — honestly, by counting activity that already happened.

## Step 3 — flag the score-side implication (investigate, do NOT fix here)

If Sippy's real sends route through the spender, the **score projector** (`projector.ts`) also misses them: a relayed `user→spender→recipient` records as flagged/unverified legs that earn **0**, so a user's real send wouldn't score when Season 1's flag flips. **Report whether the projector needs the same collapse before go-live** — it's flag-off today so there's no live impact yet, but if confirmed it's a **launch blocker** (scores would undercount real usage). Do not change the projector in this pass unless the fix is trivial and fully tested; otherwise flag it as its own task.

## Verify

- Prod-shaped data: collapsed value-out > raw value-out; transaction count includes the relay pairs once; **feed count == dashboard count**.
- No double-count: a relay pair = exactly one transaction, its user-leg USD counted once.
- Score engine otherwise untouched (the guard test still passes); typecheck + lint + season suite green.
- **Do not hardcode** — compute live. Branch as usual; no commit-final / deploy / flag-flip.

# Pizza Day Plan — May 22, 2026

> First Sippy live event. Cartagena Onchain. ~200 attendees expected.
> Tech freeze Saturday May 16. Week of May 18 is ops training and dry runs only.
> Doubles as the M2 ($9,250) public launch dress rehearsal (M2 deadline June 5).

---

## Event context

- **Date:** May 22, 2026 (Friday)
- **Host:** Cartagena Onchain
- **Attendance target:** ~200
- **Pizza funding:** Cartagena Onchain provides (not Sippy)
- **Onramp at venue:** Manual cash-for-USDC exchange. 2–3 preloaded Sippy "exchange" wallets staffed by 2–3 people at the venue. Attendee hands over cash, exchange staff sends USDC to attendee's Sippy wallet. Colurs.io is NOT available for this event — they're still integrating.
- **POAP:** Cartagena mints, one per attendee. Sippy does not run a parallel POAP.
- **Vendor count:** 2 labeled Sippy accounts (acts as first street-vendor PoC).
- **Exchange wallets:** 2–3 labeled Sippy accounts, separate from vendors. Excluded from Quest scoring.

---

## Why this event matters: Sippy primitives shipped

Pizza Day isn't only an event. It's a stress test for five reusable Sippy primitives that compound into future events, partnerships, and the M2/M3 narrative:

1. **Event onboarding + RSVP flow** (PR #19 foundation). QR-tagged sign-up with per-event welcome message, POAP link delivery, source tracking per assistant. Becomes the reusable "Sippy-hosted event" infrastructure for any future partner event.
2. **Vendor mode** (street-vendor payments PoC). Labeled Sippy accounts as merchants, receiving USDC from attendees. First real-world test of Sippy as a payment rail for street vendors, food carts, neighborhood shops.
3. **Sippy Quest** (event-scoped engagement). Leaderboards, prizes, P2P incentives scoped to an event. Reusable framework for activating attendees at any Sippy-supported event.
4. **AI Smart Mode** (smarter parser). LLM-first parsing with regex fallback. Event-scoped rollout this round, but the groundwork carries forward to broader users.
5. **QR primitive v1** (account-level capability). Pay / event / referral QRs with versioning, revocation, and unified attribution. Pizza Day consumes the admin bulk-generator for assistant printables; full spec lives in [QR_SYSTEM_SPEC.md](QR_SYSTEM_SPEC.md). The user-facing "Pay me" and vendor signage variants ship in parallel.

Each is a feature worth building on its own merit. Pizza Day is the forcing function and the first proof point for all five at once.

---

## Critical deadlines

| Date               | Item                                                                                   | Owner |
| ------------------ | -------------------------------------------------------------------------------------- | ----- |
| **Sat May 16**     | Tech freeze. All code merged, no new features after this.                              | Both  |
| Sat May 16         | Saturday call with organizers                                                          | Mateo |
| **Mon May 18 EOD** | **Vendor phone numbers locked. Required to generate printable QR sheets and signage.** | Mateo |
| Tue May 19         | Print assets finalized, sent to print                                                  | Mateo |
| Wed May 20         | Printing complete                                                                      | Mateo |
| Thu May 21         | Final dry run with print materials in hand                                             | Both  |
| Fri May 22         | **PIZZA DAY**                                                                          | Both  |

---

## Locked decisions

- **Tech freeze: Sat May 16.** Week of May 18 = ops training and dry runs only.
- **Budget shape.** Pizza funded externally. Sippy's $2K marketing budget covers Quest prizes (~$300 cap), printing, post-event content. Don't blow the budget.
- **Vendor model.** 2 labeled Sippy accounts marked `type=vendor`. Excluded from Quest scoring. Doubles as PoC for street-vendor onboarding.
- **Exchange model.** 2–3 preloaded Sippy accounts marked `type=exchange`. Staffed by 2–3 people. Hold USDC float, send to attendees in exchange for cash. Excluded from Quest scoring (otherwise their tx count tops the leaderboard). Distinct from vendor wallets to keep accounting clean.
- **Onramp at venue:** Cash → exchange wallet rep → USDC to attendee Sippy wallet. No Colurs.
- **POAP UX.** After onboarding, two buttons: "Claim to my Sippy address" (default, one-click) or "Claim to my own wallet" (paste address). Default-to-Sippy keeps the funnel tight while giving users agency.
- **SMART_MODE flag.** Per-user or per-event env. Parser tries LLM (Llama 4 Scout) first, regex fallback on failure. Never degrades current behavior. Enable for users tagged with `source=pizza-day`.
- **Gas refuel "toteado".** Top up `GasRefuel.sol` on Arbitrum One before May 22. 200 cold wallets = lots of first-tx gas.
- **Privacy.** Covered by existing onboarding ToS. No extra QR-side consent needed.
- **Spanish in-app doc.** `/pizza-day` page in the app. Fun, friendly, trilingual not required (event is in Spanish-speaking context). Covers Quest rules, how to send, how to claim POAP, how to fund.

---

## Progress tracker

**Freeze: Sat May 16.** Update marks as items ship.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

### Carlos (backend / contracts / parser)

> **Read first.** If you can do only one thing this week, do the **⚠️ bracket-token handler** below. Without it, every printed QR at Pizza Day is a dead end — users scan, land in WhatsApp with `[ABC23XYZ]`, the bot ignores them. ~1–2 hours. Everything else is your standard Pizza Day lane. Saturday call decides one conditional item (pay-kind dispatch). PR #19 baseline is shipped; the only follow-up is the review fixes, not a blocker.

#### Pizza Day blockers (must land before Thu May 21 dry run)

- [ ] **⚠️ WhatsApp bot: bracket-token first-contact handler.** Extract `\[([A-Z0-9]{8})\]` from incoming messages (deterministic, runs BEFORE LLM/intent parsing). Look up the short-id in `qr_links` (already exists in prod, migration 0018). Dispatch by `kind`:
  - **`kind='event'`** (the only kind needed for Pizza Day): call your existing `linkUserToEvent(phone, event_slug, source_tag)` from PR #19, reply with event welcome.
  - Other kinds: see conditional item below.

  Spec: [QR_SYSTEM_SPEC.md](QR_SYSTEM_SPEC.md) → "Locked decisions #3 — Bracket-token extraction runs before the LLM/intent parser". The token should never enter the LLM prompt — strip to context before parsing. **Effort: ~1–2 hours.**

- [ ] **Vendor + Exchange Quest exclusion via phone-list.** No migration. Read `PIZZA_DAY_VENDOR_PHONES` and `PIZZA_DAY_EXCHANGE_PHONES` env vars (comma-separated E.164). Small util `isVendorPhone(phone)` / `isExchangePhone(phone)` / `getQuestExcludedPhones()` for Quest exclusion. Phones supplied by Mateo when vendor/exchange staff identities land **Mon May 18**. **Effort: ~30 min.** _Originally spec'd as a `users.account_type` migration; deferred at this scale — see QR_SYSTEM_SPEC.md Locked decision #1._

- [ ] **Quest endpoint: MVP score + Connector score** (one query each).
  - MVP score per attendee: `(p2p_sends_count × 10) + (vendor_purchases × 2)`. See "Sippy Quest → Scoring" section above.
  - Connector: see "Connector tracking — SQL" above for the exact shape (note: confirm `transfers` column names against the onchain table schema; may need `phone_registry` bridge if attribution is wallet-keyed).
  - Both queries filter by the phone-list util from the item above.

- [ ] **Admin endpoint: `GET /admin/events/:slug/attendees`.** Powers the live monitoring dashboard (onboarded-count, per-assistant attribution). Joins `user_event_links` to whatever onchain summary makes sense for live counts + per-source-tag breakdown.

- [ ] **`SMART_MODE` flag in parser**, with regex fallback on LLM error. Enable for users tagged with `source=pizza-day` (event link metadata). LLM = Llama 4 Scout per existing parser conventions. Falls back to current regex parser on LLM error. Never degrades current behavior.

- [ ] **Gas refuel top-up on Arbitrum One.** Top up `GasRefuel.sol` float. 200 cold wallets onboarding = lots of first-tx gas. Estimate: current per-tx gas × 200 + buffer.

#### Conditional — Saturday May 16 call decides

- [ ] **WhatsApp bot: `kind='pay'` dispatch.** Resolve owner identity from `qr_links.owner_phone_number`, present send confirmation flow ("¿Quieres enviar a {ownerDisplayName}? ¿Cuánto?"). Required ONLY if we ship vendor pay-QRs at Pizza Day. **Go/no-go: Saturday May 16 call.** If no, vendors use existing alias path (`send 5 to @pizza-station`). Same handler as the bracket-token item above, just additional dispatch branch. **Effort if green-lit: ~4–6 hours including confirm flow + tests.**

##### Mateo's matching admin extension (if go-decision)

If pay-QRs are green-lit on Saturday, Mateo extends the admin sheets page to support `kind='pay'` creation. ~30 min, drop-in on top of existing code:

1. **Backend** (`apps/backend/app/controllers/admin/qr_sheets_controller.ts`): add a parallel route or a kind toggle. For pay kind, drop the eventSlug requirement, accept `displayName` (e.g. "Carolina's Pizza"). Reuse `createQrLink({kind: 'pay', ownerPhoneNumber, displayName})` — service already supports it, no changes needed there.
2. **Inertia page** (`apps/backend/inertia/pages/admin/qr_sheets.tsx`): variant of `PrintableSheet` for vendor signage — bigger QR, vendor name in place of event name, copy "Paga aquí con Sippy" instead of "Escanea para empezar". Cheetah blue `#00AFD7` consistent with pay-kind brand.
3. **DB / migrations**: nothing. `kind='pay'` already supported by `qr_links` schema (migration 0018) and `createQrLink` already validates it.
4. **No new env vars.** Vendor phones are already in `PIZZA_DAY_VENDOR_PHONES` from Carlos's item — admin form accepts them as `ownerPhoneNumber`.

Print + distribute one vendor sheet per booth. Attendee scans → lands in WhatsApp → Carlos's pay-dispatch handles the confirm flow. End-to-end.

#### Already shipped

- [x] **PR #19 baseline merged** on main (commit `0f37178`) — `events` + `user_event_links` tables, `linkUserToEvent`, `markPoapClaimed`, retroactive linking for returning users, source attribution.

#### Backlog (not a Pizza Day blocker — close when you can)

- [ ] **PR #19 review follow-ups** — POAP race, tests, `welcomeMessage` decision, env var. Ideal to close this week, won't block the event if they slip.

### Mateo (UI / ops / content)

- [~] Generate Pizza Day assistant sheets via QR admin endpoint (consumes QR v1; see [QR_SYSTEM_SPEC.md](QR_SYSTEM_SPEC.md)). _QR primitive v1 code-complete (migrations 0018+0019, scan endpoint, admin sheets page, runtime path validated via curl). Awaiting browser smoke + the actual print run after vendor phones land May 18. Each printable QR encodes `${FRONTEND_URL}/q/<short-id>?v=1` and on scan redirects into WhatsApp with a `[short-id]` code. Payload metadata stored in `qr_links`: `{kind: 'event', event_slug: 'pizza-day-ctg-2026', source_tag: 'assistant-NN'}`._
- [ ] Public leaderboard page (top 10 MVP + top 10 Connector + live counters)
- [ ] Vendor mode receiver UI (mobile-first)
- [x] Spanish `/pizza-day` in-app doc. _Server Component at `apps/web/app/pizza-day/page.tsx`. Covers conseguir USDC, mandar plata, pagar pizza/bebidas, Quest premios, POAP claim, ayuda. Mobile-first, brand-aligned. Will be live on next apps/web deploy at `https://www.sippy.lat/pizza-day`._
- [ ] Live monitoring dashboard
- [x] Backup plan doc + printed fallback materials. _Backup plans table above. Printable WhatsApp-number flyer at `apps/web/app/pizza-day/flyer/page.tsx` — public URL `https://www.sippy.lat/pizza-day/flyer` once deployed. Cmd/Ctrl+P → print. Hand out as catch-all when sheets get lost / Wi-Fi dies._
- [ ] Preload USDC float into 2–3 exchange wallets

### Pre-event ops (May 18–21)

- [ ] Collect 4–5 staff phone numbers (2 vendors + 2–3 exchange) by **Mon May 18 EOD**. Assistant identities are NOT needed — sheets use generic source-tags `pizzaday-ctg-2026-checker1` through `checkerN`, with the integer as the printed label. Lets us generate + print assistant sheets independently of staffing.
- [ ] Print assets finalized by **Tue May 19**
- [ ] Printing complete by **Wed May 20**
- [ ] Internal dry run with 5 testers by **Thu May 21**

### Deferred

- [ ] 20-min Sippy deck (draft after Saturday call once audience + slot known)
- [ ] Post-event recap publish target: **Thu May 29** (within 7 days of event, in time for M2 grant report inclusion)

---

## Sippy Quest

P2P usage is at zero today across the user base (per project memory). Pizza Day is the chance to seed it. Scoring rewards P2P specifically so the leaderboard tells us about social usage, not just who ate the most pizza.

### Scoring (P2P-weighted, volume-blind on the top prize)

Live onramp at the venue means attendees will arrive with different USDC amounts based on what they can spend. Scoring by USD volume would punish the broke and reward the funded. So the headline prize uses **pure tx count**, not volume.

```
top_score = (p2p_sends_count × 10) + (vendor_purchases × 2)
```

Volume is still displayed on the leaderboard for color, but doesn't drive the headline prize.

### Categories

| #   | Prize           | Criteria                                                | Cash      |
| --- | --------------- | ------------------------------------------------------- | --------- |
| 1   | **Pizza MVP**   | Highest `top_score` (P2P + vendor tx count)             | $150 USDC |
| 2   | **Connector**   | Most unique P2P recipients who are also event attendees | $100 USDC |
| 3   | **First Mover** | First P2P send at the event                             | $50 USDC  |

**Total prize budget: $300** (from $2K marketing). Leaves ~$1.7K for printing, post-event content, paid social.

### Connector tracking — SQL

Both sender and recipient must be event attendees. Vendor + exchange phones excluded via env-supplied list (no DB column — see Carlos's tracker line). Self-sends excluded. Event time-window applied.

```sql
-- :excluded_phones is the union of PIZZA_DAY_VENDOR_PHONES + PIZZA_DAY_EXCHANGE_PHONES,
-- passed as a TEXT[] bind from the Quest service. Empty array = no exclusions.
SELECT sender_phone, COUNT(DISTINCT recipient_phone) AS connections
FROM transfers t
JOIN user_event_links uel_s ON uel_s.phone_number = t.sender_phone
JOIN user_event_links uel_r ON uel_r.phone_number = t.recipient_phone
JOIN events e ON e.id = uel_s.event_id AND e.id = uel_r.event_id
WHERE e.slug = 'pizza-day-ctg-2026'
  AND NOT (t.recipient_phone = ANY(:excluded_phones))
  AND t.sender_phone != t.recipient_phone
  AND t.created_at BETWEEN <event_start> AND <event_end>
GROUP BY sender_phone
ORDER BY connections DESC;
```

_Note: column names in `transfers` need Carlos to confirm against the onchain table schema. The shape above assumes phone-keyed attribution; if attribution is wallet-keyed, the join needs `phone_registry` to bridge wallet → phone._

Returns a leader for the Connector prize. Same query feeds the public leaderboard.

### Leaderboard UX

- Public URL, refresh every 30s
- Top 10 by score, first name + last-4 of phone (privacy-aware)
- Live counters for the projector at venue: total attendees, total tx, total USDC volume
- Renders Connector score separately from MVP score so people see both races

---

## Monitoring dashboard (event day)

Mobile-friendly admin page, refresh 15–30s:

- Onboarded count vs 200 target + per-minute rate
- POAP claims (Cartagena's) vs onboarded — should track 1:1
- Total tx count + USDC volume
- Vendor account balances (both vendors)
- Exchange wallet USDC floats (all 2–3) — alert when any drops below threshold
- Top 5 Quest leaders (MVP) + top 5 Connectors
- PostHog error rate, last 5 min
- SMART_MODE fallback rate (regex hits / total parses)
- Last 10 onboardings: timestamp, assistant ID, success/fail

PostHog alerts to Mateo's phone for:

- Onboarding error spike
- POAP claim failure
- Backend 5xx
- SMART_MODE fallback rate climbing above threshold
- Vendor account balance dropping (in case of pre-funding model)

---

## Backup plans

| Failure                            | Plan B                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue Wi-Fi dies                   | Pre-printed flyer with WhatsApp number; users DM Sippy later, manual onboard                                                                                                                                                                      |
| Backend hiccup                     | "Saved, onboarding you in 2 min" message + retry queue                                                                                                                                                                                            |
| Assistant's phone breaks           | Spare phones with QR sheets pre-loaded                                                                                                                                                                                                            |
| POAP claim breaks (Cartagena side) | Manual paper claim list, retroactive mint coordinated with Cartagena                                                                                                                                                                              |
| SMART_MODE LLM fails               | Regex fallback automatic, no user impact                                                                                                                                                                                                          |
| Specific assistant unreachable     | Catch-all QR with `source_tag='assistant-fallback'` (provision via admin UI as `Fallback \| assistant-fallback`; ops carries a printed copy). Attribution still flows through `source_tag` so we can see how often fallback gets used post-event. |
| Exchange wallet runs out of USDC   | One of the 3 floats covers while we top up the empty one from treasury wallet on the fly. Set per-wallet alert threshold (e.g. <$100 USDC remaining).                                                                                             |
| Exchange staffer's phone breaks    | Other 1–2 exchange wallets keep running. Spare phone with wallet pre-loaded as backup.                                                                                                                                                            |

---

## Day-of operator runbook

A single tactical card for **Fri May 22, 2026**. Pin this; everything else in this doc is context.

### Pre-flight (T-60 minutes, before doors open)

- [ ] Open Railway dashboard. Confirm `sippy-backend` and `sippy-web` services are healthy (green, no recent crashes).
- [ ] Open `/admin/qr-sheets/pizza-day-ctg-2026`. Confirm:
  - URL prefix banner is **sky-blue** (not amber). If amber, `FRONTEND_URL` is unset on backend — set it before the event starts.
  - All printed assistant sheets render correctly.
  - **Fallback QR is in the list** (source_tag `assistant-fallback`). If missing, generate it now.
- [ ] Open WhatsApp on a test phone. Open one printed QR's `/q/<short-id>` URL. Confirm it deeplinks into a chat with Sippy (not into "choose contact").
- [ ] Confirm each exchange wallet has its preloaded USDC float.
- [ ] Open the live monitoring dashboard in a browser tab. Leave it visible.
- [ ] Distribute QR sheets to assistants. Each assistant gets one labeled sheet + a copy of the fallback.

### During the event

- [ ] **Onboarding rate** (monitoring dashboard): expect spikes when waves arrive. Investigate if rate drops to zero unexpectedly.
- [ ] **PostHog error rate**: alert threshold already set on Mateo's phone. Investigate any spike.
- [ ] **Exchange wallet floats**: alert fires at <$100 USDC. Top up from treasury wallet on the fly.
- [ ] **Quest leaderboard projector**: refresh visible to attendees, drives engagement.
- [ ] **Failure response**: refer to Backup plans section below for the specific failure mode.

### End of event

- [ ] **Snapshot Quest leaderboard** at the cutoff time. Pin the 3 prize winners (Pizza MVP, Connector, First Mover) for payout.
- [ ] **Capture screenshots**: leaderboard final state, monitoring dashboard final counters, any noteworthy moments. Needed for the post-event recap.
- [ ] Disburse Quest prizes (3 × USDC transfers from treasury).
- [ ] Drain exchange wallet floats back to treasury (or leave for next event).

---

## Release checklist (QR system → prod)

Pre-deploy verification for the QR primitive. **Status as of May 15, 2026: all items below either ✅ done or ⚠️ unverified — confirm before Pizza Day.**

### Database

- [x] Migration `0017_create_events_and_user_event_links` applied on prod (batch 11)
- [x] Migration `0018_create_qr_links_and_qr_scans` applied on prod (batch 11)
- [x] Migration `0019_qr_event_source_unique_index` applied on prod (batch 12)
- [x] Seeder `pizza_day_seeder.ts` ran on prod → `events` row `pizza-day-ctg-2026` exists

### Backend env vars (`sippy-backend` service on Railway)

- [ ] `FRONTEND_URL` — set to the apps/web public domain (the one that serves `/q/[shortId]`). Drives URL banner color + printed QR contents.
- [ ] `SIPPY_WHATSAPP_NUMBER=14722261449` — drives wa.me deeplink. If unset, code falls back to the same canonical via `SIPPY_WHATSAPP_NUMBER_FALLBACK` constant, but explicit is safer.
- [ ] `SIPPY_EVENT_QR_OWNER_PHONE` (optional) — prefills the owner phone field in `/admin/qr-sheets/<slug>`. Convenience only.
- [ ] `PIZZA_DAY_VENDOR_PHONES` — comma-separated E.164 list of the 2 vendor phones. Quest exclusion + future `isVendor` derivation read this. Phones land Mon May 18.
- [ ] `PIZZA_DAY_EXCHANGE_PHONES` — comma-separated E.164 list of the 2–3 exchange staff phones. Quest exclusion reads this. Phones land Mon May 18.

### Frontend env vars (`sippy-web` service on Railway)

- [ ] `NEXT_PUBLIC_BACKEND_URL` — apps/web's Server Component calls this to hit `/api/qr/scan/:shortId`.
- [ ] `NEXT_PUBLIC_SIPPY_WHATSAPP_NUMBER` (optional) — display-only; `WHATSAPP_BOT_NUMBER` constant in `lib/constants.ts` is the durable source.

### Code presence on prod

- [x] Backend route `POST /api/qr/scan/:shortId` reachable
- [x] Backend route `GET/POST /admin/qr-sheets/:eventSlug` reachable (admin-auth gated)
- [ ] Apps/web route `/q/[shortId]` reachable — **verify via a test scan from a phone**

### End-to-end smoke

- [ ] Generate 2 test sheets via admin UI on prod
- [ ] Scan one with a phone → confirm WhatsApp opens **directly to Sippy** (not the contact-picker page)
- [ ] Bot receives a message containing `[<SHORTID>]` (Carlos's bracket-token extraction lands here; defer this row until his side ships)
- [ ] Delete test sheets after verification

---

## Pitch deck

Deferred. 20-min slot, Mateo presents. Draft after Saturday once we know:

- Audience composition (Pizza Day attendees vs separate Cartagena Onchain session)
- Time slot (during the event vs adjacent)

Arc skeleton (per project memory):

1. Open broad — money in LATAM, market-level data, no company names
2. Narrow — WhatsApp is where people live, DeFi is where they don't want to live
3. Product — live or recorded demo of the actual Pizza Day flow
4. Expand — "make my money grow" agent vision, Arbitrum thesis
5. Close — echo opener, money should feel like sending a WhatsApp

Rules: no em dashes, no AI accent ("revolutionizing", "empowering"), causal transitions, don't mention Maash.

---

## Open questions

1. **Deck audience and slot.** When and to whom is the 20-min slot? Determines framing.
2. **Vendor + exchange staff identity.** 2 vendor accounts + 2–3 exchange accounts = 4–5 people total. Need their phones by **Mon May 18 EOD** so we can generate printable QR sheets and labeled signage.
3. **Exchange wallet float size.** How much USDC do we preload per wallet? Function of expected onramp demand at 200 attendees. Rough cut: if 50% onramp ~$10 average, that's $1K total = ~$350 per wallet across 3 floats. Confirm before May 21.

---

## Post-event deliverables (M2 narrative)

Pizza Day produces the M2 ($9,250, deadline June 5) public launch story:

- Real attendees onboarded cold
- Real P2P transactions on Arbitrum
- Real Quest leaderboard + winners
- Photos + short video edit
- Recap post (numbers, story, attendee quotes) for Arbitrum and grant reporting

Plan to publish the recap within 7 days of event (by May 29) to have time for grant report inclusion.

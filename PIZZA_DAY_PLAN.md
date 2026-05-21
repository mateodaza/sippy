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
3. **Sippy Quest** (global engagement mechanic; per-event prize draws). Entries-based raffle infrastructure shipped 2026-05-18: lifetime-global referral codes, atomic capture/drain of pending referrals, scoring CTE with attendance + referee gates, public leaderboard at `/quest/<event-slug>`. Pizza Day inaugurates the system; future events plug in by registering a new `events` row + setting up venue QRs — no schema or scoring changes needed.
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
- **Budget shape.** Pizza funded externally. Sippy's $2K marketing budget covers Quest prizes (~$140 cap), printing, post-event content. Don't blow the budget.
- **Vendor model.** 2 labeled Sippy accounts marked `type=vendor`. Excluded from Quest scoring. Doubles as PoC for street-vendor onboarding.
- **Exchange model.** 2–3 preloaded Sippy accounts marked `type=exchange`. Staffed by 2–3 people. Hold USDC float, send to attendees in exchange for cash. Excluded from Quest scoring (otherwise their tx count tops the leaderboard). Distinct from vendor wallets to keep accounting clean.
- **Onramp at venue:** Cash → exchange wallet rep → USDC to attendee Sippy wallet. No Colurs.
- **POAP UX.** Cartagena Onchain mints; Sippy DMs the claim link. **Trigger:** first successful Pay-QR-initiated payment at the event (not first onboarding) — scanning a pay-QR is the "I'm actively here at the event" signal. **Mechanism:** atomic SELECT-FOR-UPDATE-SKIP-LOCKED in `claimPendingPoapInvite` so concurrent payments can't double-fire the DM; failure-to-deliver releases the reservation so the next payment retries. **Status (2026-05-18):** lives in Carlos's PR #23 (in review). Once merged + deployed, the DM contains Cartagena's `poapClaimUrl` and the user can claim to any wallet (Sippy or their own). No "two buttons" UI — the link in the DM is the entire surface.
- **SMART_MODE flag.** Per-user or per-event env. Parser tries LLM (Llama 4 Scout) first, regex fallback on failure. Never degrades current behavior. Enable for users tagged with `source=pizza-day`.
- **Gas refuel "toteado".** Top up `GasRefuel.sol` on Arbitrum One before May 22. 200 cold wallets = lots of first-tx gas.
- **Privacy.** Covered by existing onboarding ToS. No extra QR-side consent needed.
- **Spanish in-app doc.** `/pizza-day` page in the app. Fun, friendly, trilingual not required (event is in Spanish-speaking context). Covers Quest rules, how to send, how to claim POAP, how to fund.
- **Unified Event Operator Dashboard** (decided May 16, Mateo + Carlos). Single admin surface that merges three things into one tool for the on-the-ground operator at the venue:
  1. **Live attendee list** — sees each new attendee appear as they complete onboarding (source-tagged so we know which assistant funnel they came through).
  2. **Per-attendee "Send USDC" button** — once an attendee's wallet exists, the operator clicks once to seed them with the event's standard amount (Cartagena-funded). Replaces the manual cash-for-USDC exchange-wallet flow for seed distribution. (If cash-for-USDC top-ups still happen separately at the venue, that's a different lane; the dashboard owns the seed.)
  3. **QR management** — the existing `/admin/qr-sheets/:eventSlug` page (already built, in prod) becomes a section of this dashboard rather than a separate URL. One operator UI, one URL to remember.

  **Owner: Carlos.** Foundation already exists (`apps/backend/inertia/pages/admin/qr_sheets.tsx` + `qr_sheets_controller.ts` + `event.service.ts`); Carlos extends with the live-attendee view + seed-send action. Mateo works the vendor-mode UI in parallel (separate surface for vendors, not operators).

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

- [x] **Vendor + Exchange Quest exclusion.** Shipped: `getQuestExcludedPhones()` in `app/utils/special_accounts.ts` derives merchants from `qr_links WHERE kind='pay' AND status='active'` (issuance is the merchant declaration — no vendor env list) and UNIONs with `PIZZA_DAY_EXCHANGE_PHONES` env for cash-booth staff. Exchange phones supplied by Mateo when staff identities land **Mon May 18**.

- [x] **Quest endpoint + scoring service.** Shipped 2026-05-18 as `apps/backend/app/services/quest/scoring.service.ts` (`getUserQuestStatus`, `getLeaderboard`, `getQuestStats`) + `apps/backend/app/controllers/quest_controller.ts` exposing `GET /api/quest/:slug/leaderboard` (public, IP-throttled, masked phones). Single CTE drives all three reads. The original "distinct senders, ≥$0.10" design was replaced by the entries-based raffle (see Quest section above) — no `transfers` join needed, scoring derives from `user_event_links` + `referral_attributions`.

- [ ] **Event Operator Dashboard (unified).** Extends the existing `/admin/qr-sheets/:eventSlug` page into a single operator surface. Three sections:
  1. **Live attendees list** — polls `user_event_links` for the event (or pushes via SSE if simple); shows each attendee with source-tag, onboarding timestamp, wallet status.
  2. **"Send USDC seed" button per attendee** — fires a tx from a configured treasury/operator wallet to the attendee's Sippy wallet for the standard event seed amount (env var, e.g., `PIZZA_DAY_SEED_USDC=2`). Idempotent (don't double-seed the same phone). Disabled until the attendee's wallet exists.
  3. **QR management** — the existing admin sheets form + printable sheets stay as a section/tab of the dashboard, not a separate page.

  Replaces the originally-spec'd standalone `GET /admin/events/:slug/attendees` endpoint and the standalone "live monitoring dashboard" — one tool, one URL. Foundation already in prod (`apps/backend/inertia/pages/admin/qr_sheets.tsx` + `qr_sheets_controller.ts`); extend rather than rebuild.

- [ ] **`SMART_MODE` flag in parser**, with regex fallback on LLM error. Enable for users tagged with `source=pizza-day` (event link metadata). LLM = Llama 4 Scout per existing parser conventions. Falls back to current regex parser on LLM error. Never degrades current behavior.

- [ ] **Gas refuel top-up on Arbitrum One.** Top up `GasRefuel.sol` float. 200 cold wallets onboarding = lots of first-tx gas. Estimate: current per-tx gas × 200 + buffer.

#### Conditional — Saturday May 16 call decides

- [ ] **WhatsApp bot: `kind='pay'` dispatch.** Resolve owner identity from `qr_links.owner_phone_number`, present send confirmation flow ("¿Quieres enviar a {ownerDisplayName}? ¿Cuánto?"). Required ONLY if we ship vendor pay-QRs at Pizza Day. **Go/no-go: Saturday May 16 call.** If no, vendors use existing alias path (`send 5 to @pizza-station`). Same handler as the bracket-token item above, just additional dispatch branch. **Effort if green-lit: ~4–6 hours including confirm flow + tests.**

##### Mateo's matching admin extension (if go-decision)

If pay-QRs are green-lit on Saturday, Mateo extends the admin sheets page to support `kind='pay'` creation. ~30 min, drop-in on top of existing code:

1. **Backend** (`apps/backend/app/controllers/admin/qr_sheets_controller.ts`): add a parallel route or a kind toggle. For pay kind, drop the eventSlug requirement, accept `displayName` (e.g. "Carolina's Pizza"). Reuse `createQrLink({kind: 'pay', ownerPhoneNumber, displayName})` — service already supports it, no changes needed there.
2. **Inertia page** (`apps/backend/inertia/pages/admin/qr_sheets.tsx`): variant of `PrintableSheet` for vendor signage — bigger QR, vendor name in place of event name, copy "Paga aquí con Sippy" instead of "Escanea para empezar". Cheetah blue `#00AFD7` consistent with pay-kind brand.
3. **DB / migrations**: nothing. `kind='pay'` already supported by `qr_links` schema (migration 0018) and `createQrLink` already validates it.
4. **No new env vars.** Admin operator types the vendor phone directly into the pay-sheets form; the only requirement is that the phone already exists in `user_preferences` (onboarded). Issuance of the pay-QR is itself the merchant declaration — Quest exclusion picks them up automatically.

Print + distribute one vendor sheet per booth. Attendee scans → lands in WhatsApp → Carlos's pay-dispatch handles the confirm flow. End-to-end.

#### Already shipped

- [x] **PR #19 baseline merged** on main (commit `0f37178`) — `events` + `user_event_links` tables, `linkUserToEvent`, `markPoapClaimed`, retroactive linking for returning users, source attribution.
- [x] **Quest foundation (2026-05-18).** Migration `0022_create_quest_tables` (referral_codes, referral_attributions, pending_referrals); `referral.service.ts` with atomic capture/drain + self-referral guard + FK-form phone handling; `bracket_token.service.ts` `[REF-XXXXXX]` extraction; `mi codigo` webhook handler; `sippy.lat/r/<code>` redirect route (WhatsApp anti-spam workaround).
- [x] **Quest scoring + leaderboard (2026-05-18).** `scoring.service.ts` with entries-based CTE + cap + rank; `mi quest` webhook handler; `quest_controller.ts` public endpoint; `apps/web/app/quest/[slug]/page.tsx` public leaderboard. Migration `0023_backfill_event_qr_source_tag` flips printed event QRs to `source_tag='venue'` so existing-user venue scans credit attendance.
- [x] **Quest globalization (2026-05-18).** Migration `0024_promote_referral_codes_to_global` flips per-event codes to a global namespace; `ensureReferralCode(phone)` defaults to global; attribution still records the actual event where capture/drain happened. One code per user, lifetime — survives across future events.
- [x] **Pizza-day attendee guide** at `apps/web/app/pizza-day/page.tsx`. Updated to the entries-based mechanic + links to `/quest/pizza-day-ctg-2026`.

#### Backlog (not a Pizza Day blocker — close when you can)

- [ ] **PR #19 review follow-ups** — POAP race, tests, `welcomeMessage` decision, env var. Ideal to close this week, won't block the event if they slip.

### Mateo (UI / ops / content)

- [~] Generate Pizza Day assistant sheets via QR admin endpoint (consumes QR v1; see [QR_SYSTEM_SPEC.md](QR_SYSTEM_SPEC.md)). _QR primitive v1 code-complete (migrations 0018+0019, scan endpoint, admin sheets page, runtime path validated via curl). Awaiting browser smoke + the actual print run after vendor phones land May 18. Each printable QR encodes `${FRONTEND_URL}/q/<short-id>?v=1` and on scan redirects into WhatsApp with a `[short-id]` code. Payload metadata stored in `qr_links`: `{kind: 'event', event_slug: 'pizza-day-ctg-2026', source_tag: 'assistant-NN'}`._
- [x] Public leaderboard page. Shipped 2026-05-18 as `apps/web/app/quest/[slug]/page.tsx` — server-rendered with 60s ISR, top 20 masked, live counters (entries + participants), draw-mechanic copy, CTA to WhatsApp. Brand-polished (cheetah blue accents, draw date in hero) on the same day. Single leaderboard, not the old MVP/Connector split.
- [~] **Vendor mode receiver UI** (mobile-first dashboard) — **Mateo's solo lane this week**, while Carlos builds the unified operator dashboard in parallel. Design locked May 15:
  - **Attendee scan flow:** scan vendor QR (`kind='pay'`) → WhatsApp opens with `[short-id]` → bot asks "¿Cuánto pagar a {vendorName}?" → user types amount → confirm → send. (Carlos's pay-dispatch lane, conditional on Saturday call.)
  - **Vendor receive flow:** on each incoming payment, Sippy bot sends the vendor a WhatsApp message like `"+$5 USDC de Sippy_user_4521 → ver: sippy.lat/vendor"`. The link opens the mobile dashboard.
  - **Vendor dashboard** (new mobile-first page at apps/web `/vendor`, auth-gated by phone): today's tx count, total received USDC, last 10 transactions with sender + amount + timestamp. Auto-refresh every 30s. ~2 hours to build. Reads vendor's incoming payments from the on-chain transfer indexer (separate data source from Quest scoring — Quest derives from `referral_attributions` + `user_event_links`, not from on-chain transfers).
- [x] Spanish `/pizza-day` in-app doc. _Server Component at `apps/web/app/pizza-day/page.tsx`. Covers conseguir USDC, mandar plata, pagar pizza/bebidas, Quest premios, POAP claim, ayuda. Mobile-first, brand-aligned. Will be live on next apps/web deploy at `https://www.sippy.lat/pizza-day`._
- ~~Live monitoring dashboard~~ → **merged into Carlos's Event Operator Dashboard** (unified surface, see his tracker)
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

**Entries-based raffle. Winners drawn at random from valid entries — not "top of leaderboard wins."** Designed as a global, ongoing Sippy mechanic that Pizza Day inaugurates; the leaderboard URL is event-scoped (`/quest/pizza-day-ctg-2026`) for this season's draw but the per-user referral code is lifetime-global (carries forward to future events).

> **History:** earlier drafts of this section described a volume-based "convince others to send you ≥$0.10" mechanic with distinct-senders scoring and a top-3 leaderboard-wins prize structure. Replaced 2026-05-18 with the entries-based raffle described below. Volume-based scoring is no longer in the code — do NOT explain the old mechanic to operators or attendees.

### The game: collect entries, win the raffle

Each attendee can collect up to **5 entries** for Pizza Day's draw. Two ways to earn an entry:

1. **+1 entry — Asistir.** Show up at the venue and scan any printed Sippy QR (or, for new users, complete onboarding at the event). The scoring credit fires on the `linked_at_step='done'` (new user) or `linked_at_step='returning' + metadata.source='venue'` (existing user) link. Off-venue social-link taps don't count.
2. **+1 entry per friend — Traer amigos a Sippy.** Share your personal referral link (`sippy.lat/r/<code>`). Each friend who joins Sippy through your link credits you with one entry — **whether or not they attend the event**. Product rule (2026-05-18 update, was attendance-gated earlier): Sippy benefits from any new user joining anywhere; mom-from-Bogotá counts toward the referrer's Pizza Day entries the same way a friend physically at the venue does. The viral acquisition reward is the point.

Max 5 entries per person. The cap is exposed via `QUEST_MAX_ENTRIES_PER_USER` env (default 5) and applied in SQL via `LEAST(raw_entries, $cap)`.

### Scoring (deterministic, derived at query time)

Entries are derived at query time from two tables:

- `user_event_links` for the attendance branch (`linked_at_step='done'` OR `'returning' + metadata->>'source' = ANY('{venue}')`) — your OWN +1 still requires you to attend.
- `referral_attributions` for the referrals branch — straight count of attribution rows, no attendance check on the referee. The FK from `referral_attributions` to `user_preferences` enforces "the referee is a real Sippy user with a wallet."

Both branches are scoped to the current event slug (the attribution's `event_slug` is the campaign the referee was invited under — captured at `captureReferral` time and preserved through drain). Self-referrals are blocked at capture time by the `referee_phone != referrer_phone` PK constraint + service-layer guard. There is no separate "exclusion list" — vendor/exchange phones simply don't accumulate entries because they're not referring or being referred under the Quest flow.

**Drain hook**: `drainPendingReferral(phone)` fires at wallet registration (`POST /api/register-wallet`, the "joined Sippy" moment) AND as a best-effort fallback on genuine venue attendance writes. The pending row's own `event_slug` is preserved on drain — callers don't override it.

Single source of truth: `getLeaderboard()`, `getUserQuestStatus()`, `getQuestStats()` in `apps/backend/app/services/quest/scoring.service.ts`. All three share one CTE so the math can't drift between the in-WhatsApp `mi quest` reply, the public leaderboard, and the totals counters.

### Winners: random draw, not top-of-leaderboard

The leaderboard shows entries ranking for engagement, but **winners are drawn at random from all valid entries** — more entries = more probability, not "highest entries wins." This is the strictly-pinned product contract; the leaderboard page repeats it in plain Spanish at `/quest/pizza-day-ctg-2026` so attendees can't reasonably misread it.

### Prizes

Prize amounts + winner count TBD by Mateo + Carlos. Hold under $140 total per the $2K marketing budget allocation. Whatever the split, the random-draw mechanic decouples prize structure from leaderboard rank (you can have 1 winner or 5 winners, prize amounts can be equal or tiered, doesn't change the scoring math).

### Why this works

- One rule, one sentence: "show up + bring friends, more entries means more chance."
- Wealth-blind. You don't need any money to play — physical attendance + a couple of friends is enough.
- Survives the "everyone gets 5 entries" edge case. If 200 people max out, you have 1000 entries and the random draw still produces a clean winner.
- No "the bot is wrong about my points" disputes — entries are deterministic from on-chain attendance + DB attribution; no fuzzy distinct-sender counting.
- Quest infrastructure is reusable for future Sippy events (M2 weekly tasks model).

### Quest leaderboard — SQL

The scoring CTE lives in [`apps/backend/app/services/quest/scoring.service.ts`](apps/backend/app/services/quest/scoring.service.ts). Three exports share it:

- `getUserQuestStatus({ phone, eventSlug })` — for the `mi quest` WhatsApp reply
- `getLeaderboard({ eventSlug, limit })` — for the public page top-N
- `getQuestStats(eventSlug)` — for the totals counters on the public page

Per-user entries are capped via `LEAST(raw_entries, $cap)`; ranks are computed with `RANK() OVER (ORDER BY entries DESC, phone_number ASC)` for deterministic tiebreaking. Anti-farming: the activity branch only counts `linked_at_step='done'` OR (`'returning'` + `metadata->>'source' = ANY('{venue}')`), where `venue` is the source tag the QR sheets controller stamps on the printed event QR. Twitter / SMS deep-link taps don't qualify as attendance.

If you need to debug, the relevant SQL is in `scoring.service.ts` under the `ENTRIES_CTE` constant. Don't try to re-derive it from `transfers` — the old volume-based query in earlier drafts of this doc is gone.

### Leaderboard UX

Live at `/quest/pizza-day-ctg-2026`:

- Public URL, ISR with 60s revalidate (snappy + cheap)
- Top 20, masked phones (`+57 *** 4567`), no names
- Counters: total entries in play + total participants
- Explicit "Cómo se eligen ganadores" panel — pins the draw-mechanic copy so the page reads correctly even for a first-time visitor
- CTA: deep-link to WhatsApp prefilled with `Hola Sippy! mi quest` so the user lands in their own standing

User-side: `mi quest` in WhatsApp returns `Tu Quest: X/5 entradas` + breakdown (`Asistencia: 1`, `Amigos unidos: N`) + rank. `mi codigo` returns the user's lifetime-global referral code + share URL.

---

## Monitoring dashboard (event day)

Mobile-friendly admin page, refresh 15–30s:

- Onboarded count vs 200 target + per-minute rate
- POAP claims (Cartagena's) vs onboarded — should track 1:1
- Total tx count + USDC volume
- Vendor account balances (both vendors)
- Exchange wallet USDC floats (all 2–3) — alert when any drops below threshold
- **Quest totals**: total entries in play + total participants (mirrors the public leaderboard counters at `/quest/pizza-day-ctg-2026`). One race, not two — the old MVP/Connector split is gone; entries are unified under the entries-based raffle.
- PostHog error rate, last 5 min
- SMART_MODE fallback rate (regex hits / total parses)
- Last 10 onboardings: timestamp, assistant ID, success/fail

PostHog alerts to Mateo's phone for:

- Onboarding error spike
- POAP claim failure
- Backend 5xx
- SMART_MODE fallback rate climbing above threshold
- Vendor account balance dropping (in case of pre-funding model)
- Quest scoring CTE errors (would surface as empty leaderboard + `quest.scoring: leaderboard query failed` in backend logs — `getLeaderboard` swallows errors and returns `[]`, so an empty board mid-event with active onboardings is the symptom)

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
- [ ] Open `sippy.lat/quest/pizza-day-ctg-2026` in a browser. Confirm counters render (will be `0` / `0` pre-event, with the "Aún no hay entradas" empty state — that's correct).
- [ ] Send `mi codigo` and `mi quest` to Sippy from a test phone. Confirm replies render correctly (code returned, `0/5` entries shown).
- [ ] Confirm each exchange wallet has its preloaded USDC float.
- [ ] Open the live monitoring dashboard in a browser tab. Leave it visible.
- [ ] Distribute QR sheets to assistants. Each assistant gets one labeled sheet + a copy of the fallback.

### During the event

- [ ] **Onboarding rate** (monitoring dashboard): expect spikes when waves arrive. Investigate if rate drops to zero unexpectedly.
- [ ] **PostHog error rate**: alert threshold already set on Mateo's phone. Investigate any spike.
- [ ] **Exchange wallet floats**: alert fires at <$100 USDC. Top up from treasury wallet on the fly.
- [ ] **Quest leaderboard projector**: project `sippy.lat/quest/pizza-day-ctg-2026` on a venue screen. The page ISR-revalidates every 60s; manual refresh shows the latest. Drives engagement and reminds attendees how entries work.
- [ ] **Explain the Quest mechanic correctly**: "Show up + bring friends. Up to 5 entries each. Winners are drawn at random from valid entries — not 'top of leaderboard wins.'" The leaderboard page repeats this verbatim under "Cómo se eligen ganadores". Do NOT describe the old "convince others to send you $0.10" mechanic (volume-based scoring is no longer in the code).
- [ ] **Failure response**: refer to Backup plans section below for the specific failure mode.

### End of event

- [ ] **Snapshot Quest leaderboard** at the cutoff time. Screenshot the `/quest/pizza-day-ctg-2026` page. Pin the total entries + total participants counter for the post-event recap.
- [ ] **Run the random draw** from the qualifying entries. Whatever prize structure was locked (TBD: count + amounts, capped at $140 total), winners are drawn from valid entries — NOT top-N of the leaderboard. Source: the `referral_attributions` + `user_event_links` data backing the scoring query at event-end.
- [ ] **Capture screenshots**: leaderboard final state, monitoring dashboard final counters, any noteworthy moments. Needed for the post-event recap.
- [ ] Disburse Quest prizes (USDC transfers from treasury).
- [ ] Drain exchange wallet floats back to treasury (or leave for next event).

### Operator wallet attribution (read before inspecting rows)

- The superadmin (`admin@sippy.lat`) can send through any event's operator wallet via `/admin/operator/send?event=<slug>` (also reachable from "Send from this wallet" on the event-attendees admin panel).
- Superadmin sends are attributed to the wallet's assigned operator in `operator_sends.operator_id` — same as if the operator themselves had sent. If you query `operator_sends` during the event and see a send the operator says they didn't make, check Railway logs.
- Railway logs for `operator_send.start` / `operator_send.confirmed` include `caller_user_id` (the actual sender) and an `override` flag (true when superadmin acted through another operator's wallet). Grep on `superadmin-override` to find them quickly.
- Caps (hourly + per-tx) and the duplicate-recipient guard still apply to superadmin sends — there is no bypass. The wallet's hourly cap is shared between the operator and the superadmin.
- DB-level forensic attribution (`operator_sends.initiated_by_user_id` column) is deferred until after Cartagena; logs are the authoritative source during the event.

### Operator wallet drain (post-event)

- Drain endpoint (`POST /admin/events/:slug/operator-wallet/drain`) is **superadmin-only**: only `admin@sippy.lat` can call it. Other admins see a 403 and a "Drain is restricted to the superadmin account" hint on the admin panel.
- Optional partial-drain amount: leave the amount input blank for a full sweep, or enter a USDC amount to drain that exact portion (useful for pre-event smoke checks).

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
- ~~`PIZZA_DAY_VENDOR_PHONES`~~ — **removed**. Vendor identity is now derived from `qr_links WHERE kind='pay' AND status='active'` (issuance is the merchant declaration). Generate vendor sheets via `/admin/pay-sheets` instead.
- [ ] `PIZZA_DAY_EXCHANGE_PHONES` — comma-separated E.164 list of the 2–3 exchange staff phones. Used by `getQuestExcludedPhones()` in `app/utils/special_accounts.ts` for any non-Quest-scoring exclusion contexts (e.g. operator dashboards, vendor stats). **Note (2026-05-18):** the new entries-based Quest scoring does NOT use this exclusion list — vendors/exchange wallets simply don't accumulate entries because they're not in the referral graph. Env still useful for other surfaces. Phones land Mon May 18.

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
4. **How attendees actually receive USDC.** **Largely answered (May 16):** the unified operator dashboard owns seed distribution — operator clicks "Send USDC" per attendee once their wallet exists. Cartagena funds. Residual to lock: (a) exact seed amount (`PIZZA_DAY_SEED_USDC`, suggest $2-3 — covers pizza price + Quest play money), (b) whether cash-for-USDC top-ups still happen at the venue as a separate manual flow for attendees who want more, or if seed is the only on-ramp at the event. If no cash-for-USDC, the original "Exchange model" Locked decision becomes obsolete and exchange wallets get retired.
5. **Pay-QR for vendors: go / no-go.** Original brief had "QR para pagos". Saturday locks whether vendor signage is QR-scannable or attendees use alias path (`paga 5 a pizza`). If go: Carlos's pay-dispatch + Mateo's admin extension + vendor dashboard. If no: same alias path that already works.

---

## Post-event deliverables (M2 narrative)

Pizza Day produces the M2 ($9,250, deadline June 5) public launch story:

- Real attendees onboarded cold
- Real P2P transactions on Arbitrum
- Real Quest leaderboard + winners
- Photos + short video edit
- Recap post (numbers, story, attendee quotes) for Arbitrum and grant reporting

Plan to publish the recap within 7 days of event (by May 29) to have time for grant report inclusion.

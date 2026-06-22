# Sippy M2 Progress Log

Running record of M2 work as it ships. New entries go on top.

Each entry tags which M2 checklist item (see `M2_CHECKLIST.md`) the work advances, or `Ongoing` for continuous categories (maintenance, support, feature iterations, event ops).

---

## 2026-06-22 — content + measurement sprint

- **#9 / #10 Blog posts**: built an on-site `/blog` system in `apps/web` (Next.js, dependency-free Markdown renderer, EN/ES/PT swappable) + wrote, copy-edited, and resynced 2 multilingual posts:
  - "A dollar wallet inside WhatsApp" (`how-sippy-works`) — product explainer + closed-beta UX lessons.
  - "The crypto people use before they learn the words" (`training-wheels-for-web3`) — AI + crypto vision / investment case, with Cartagena as the proof point.
  - Tweet-thread versions + notes in `marketing/blog-tweet-threads.md`.
  - ✅ **Copy audit complete**: EN/ES/PT bodies, localized metadata, and X threads tightened for publication.
  - ✅ **ES/PT resync complete (2026-06-22)**: both posts' Spanish + Portuguese bodies re-translated from the edited English; localized titles/descriptions updated in `lib/blog.ts`. Structure verified (headings/bold/numbered-list/quote/links match EN); prettier + `tsc --noEmit` pass.
  - ⚠️ **Pending**: deploy so `/blog` is live (KPI = "published & accessible").
- **#7 User testimonials (10–15)**: built + **published** 2 Tally forms (free plan), Google Sheets synced on both:
  - 🇪🇸 `https://tally.so/r/lbg4Mp` · 🇬🇧 `https://tally.so/r/5BrOOb`
  - 8 questions incl. a **0–10 NPS** item (also feeds the NPS KPI). Consent right after the name. Outreach DM copy in `marketing/testimonials-collection.md`.
  - ⚠️ **Pending**: send outreach (~25 users), collect 10–15. NPS to be reported via **Zoho**.
- **Technical documentation package**: improved `docs/start/get-started.mdx` (newcomer-friendly funding, self-custody clarity, no-fees note) + **translated all 29 docs pages to ES + PT** (`apps/docs`, was English-only fallback). KPI "documentation published & accessible" → ✅.

### M2 status snapshot (for the next task recount)

KPIs — live from `sippy.lat/stats`, 2026-06-22:

| KPI                    | Target   | Live                                                        | Status                                   |
| ---------------------- | -------- | ----------------------------------------------------------- | ---------------------------------------- |
| Onchain transfers      | 200–400  | **757**                                                     | ✅ past                                  |
| Monthly active wallets | 75–100   | **~197–216**                                                | ✅ past                                  |
| USDC volume            | $50–100K | **$24.8K moved** (+$13.5K onboarded)                        | ⚠️ below floor — biggest gap             |
| Tx success rate        | >98%     | not instrumented (PostHog dashboard is the default web one) | document from backend/indexer, or accept |
| Uptime                 | >99%     | not measured here (no Railway connector)                    | pull from Railway                        |
| NPS                    | >40      | form live                                                   | measure via Zoho once collected          |

Open items to close M2:

1. **Volume gap** — report transacted ($24.8K) vs onboarded ($13.5K) transparently; consider a small push.
2. **Testimonials** — collect 10–15 from the Tally forms; **NPS via Zoho**.
3. **Deploy `/blog`** live so the blog deliverable counts as published.
4. **Tx-success + uptime** — document or note as accepted (PostHog has nothing tx-related — confirmed OK).
5. **Final report** — assemble M2 report in **team Notion** (M1+M2 live there); keep a dated copy in repo.
6. **Legal basics (ToS/Privacy/risk)** — owned by **Lina** (in progress).

Deadline note: official Questbook M2 deadline was **04 Jun 2026** (already passed) vs internal target end-of-June — worth confirming with Chilla.

## 2026-06-07

- `a09e1fd` Carlos — **#2 Open beta**: fix onboarding and shorten the steps (`apps/web/app/setup` + `embedded_wallet_controller`). Removes friction for first-time public users.

## 2026-05-29

- `fefc624` Mateo — **Ongoing / event ops**: replace hardcoded Pizza Day slug with `SIPPY_CURRENT_EVENT_SLUG` env. Generalizes the event bot for the next event without redeploys.

## 2026-05-27

- `fceab47` Mateo — **Ongoing / feature iterations**: phone input on wallet view (uses `SippyPhoneInput`).

## 2026-05-22

- `79b582f` Mateo — **Ongoing / maintenance**: use unverified spend limit in fast setup ($500 → $50 daily limit bug fix surfaced from Pizza Day post-mortem).
- `4ecaf80` Mateo — **#2 Open beta**: skip email and terms during setup. Shorter funnel for new users (terms will return once legal pack is finalized — see #1).
- `501bb2d` Mateo — **Ongoing / feature iterations**: pay-QR amount prompt fix (missing ¿ and tilde in "¿Cuánto").
- `3624a46` Mateo — **Ongoing / feature iterations**: tolerate elongated trailing chars in help triggers (AYUDAAAA → help).
- `f5c22c7` Mateo — **Ongoing / feature iterations**: FAQ section with security questions, linked from footer + ayuda.
- `9c9d9fd` Carlos — **#2 Open beta**: better login attempts handling.

## 2026-05-21 (Pizza Day prep sprint)

- `9a3ee31` Mateo — **Ongoing / event ops**: admin raffle endpoints (pool audit + weighted-distinct winner draw).
- `d515df3` Mateo — **Ongoing / event ops**: poap.xyz allowlist + neutral mi-poap reply + reviewer pin-ups.
- `29fbf94` Mateo — **Ongoing / event ops**: add poap.xyz to outbound sanitizer trusted-domain allowlist.
- `60b3a46` Mateo — **Ongoing / maintenance**: quest source upgrade on re-link + healed user metadata.
- `6768901` Mateo — **Ongoing / event ops**: single-line event_announcement body (WhatsApp rejects newlines in params).
- `d3ab419` Mateo — **Ongoing / maintenance**: heal orphan POAP stamps + verbose template send errors.
- `151dd21` Mateo — **Ongoing / event ops**: reuse assigned POAP URL on repeat sends + poap-status admin endpoint.
- `16062a0` Mateo — **Ongoing / event ops**: always send combined template, drop POAP block when already invited.
- `96c3a35` Mateo — **Ongoing / event ops**: event_announcement template for PT recipients.
- `65722d2` Mateo — **Ongoing / feature iterations**: visible outlined buttons on attendees + qr_sheets pages.
- `b2c1fec` Carlos — **Ongoing / event ops**: POAP implementation in WhatsApp chat.
- `16c18a5` Mateo — **Ongoing / event ops**: combined event_announcement template for operator drops (EN/ES).
- `54cc2e0` Mateo — **Ongoing / maintenance**: superadmin gates on operator wallet drain and send.
- `61cc37e` Carlos — **Ongoing / event ops**: correctly send templates for Pizza Day initial recharge.
- `bde5ae1` Mateo — **Ongoing / maintenance**: greeting/social replies always deterministic (no LLM pseudo-promises).
- `32fd9e6` Carlos — **Ongoing / event ops**: operator sends the POAP on pay.
- `29cb29a` Mateo — **Ongoing / maintenance**: rescue LLM output before Zod (pass rate 72% → 100%).
- `c1ed23d` Mateo — **Ongoing / maintenance**: superadmin gates on operator wallet drain and send.
- `7ee1ffc` Carlos — **Ongoing / event ops**: POAP seeder and table.
- `39e02fb` Mateo — **Ongoing / maintenance**: deterministic pre-SMART gate + seed-after-send invariant.
- `ce24f97` Mateo — **Ongoing / maintenance**: align GAS_MIN_BALANCE_ETH with new 0.00005 ETH drip.

---

## How to use this file

- **Add new entries on top** with date, commit hash, author, M2 checklist tag, one-line description.
- **Tag categories:**
  - `#1` through `#12` = priority items from `M2_CHECKLIST.md`
  - `Ongoing / maintenance` = bug fixes from user reports
  - `Ongoing / feature iterations` = polish from beta feedback
  - `Ongoing / event ops` = Pizza Day / TechX / future events
  - `Ongoing / support` = user support work (Zoho etc.)
- **At end of M2,** filter entries by tag to populate the corresponding section of the final M2 report.

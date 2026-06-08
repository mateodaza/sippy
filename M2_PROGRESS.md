# Sippy M2 Progress Log

Running record of M2 work as it ships. New entries go on top.

Each entry tags which M2 checklist item (see `M2_CHECKLIST.md`) the work advances, or `Ongoing` for continuous categories (maintenance, support, feature iterations, event ops).

---

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

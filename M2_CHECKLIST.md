# Sippy M2 — Remaining Deliverables Checklist

Snapshot: 2026-06-08. Target: close all M2 before end of June 2026.

The full architectural M2 plan lives in `M2_PLAN.md`. This file is the **operational checklist** of what still needs to happen, ordered by priority. The lower an item, the less it blocks others.

---

## KPI status

| KPI                  | Target   | Current                                        | Status                |
| -------------------- | -------- | ---------------------------------------------- | --------------------- |
| Onchain transactions | 200-400  | 753                                            | ✅ past upper bound   |
| MAW                  | 75-100   | ~197                                           | ✅ past upper bound   |
| USDC volume          | $50-100K | $37.7K total ($24.3K moved + $13.4K onboarded) | ⚠️ 75% to lower bound |
| Tx success rate      | >98%     | undocumented                                   | ❓ needs measurement  |
| Uptime               | >99%     | undocumented                                   | ❓ needs measurement  |
| NPS                  | >40      | unmeasured                                     | ❓ needs survey       |

Volume is the only KPI at real risk. Everything else is measurement or execution.

---

## Priority-ordered checklist

### 1. Legal pack (critical path — gates open beta and reduces risk)

- [ ] Brief Lina on scope: Terms of Service, Privacy Policy, regulatory disclosures
- [ ] Lina drafts v1 (ES + EN versions if applicable)
- [ ] Internal review by Mateo + Carlos
- [ ] Publish on sippy.lat (`/terms`, `/privacy`)
- [ ] Link from product UX (setup flow, footer, wallet view)
- [ ] Add legal docs link to M1 report Notion (so Chilla sees it)

### 2. Open beta launch (depends on #1)

- [x] Shorten + fix onboarding flow (Carlos, `a09e1fd`) — fewer setup steps for first-time public users
- [ ] Remove invite-only gating from setup flow
- [ ] Confirm onramp flows handle non-allowlisted users
- [ ] Prepare launch announcement (Twitter thread + Discord + LATAM crypto groups)
- [ ] Schedule launch day with team availability for incident response
- [ ] Update landing CTA from "Join beta" to "Get started"
- [ ] Monitor first 48 hours of open traffic for errors

### 3. GasRefuelV2 deployment

- [ ] Confirm code-complete state with allowlist + safety checks
- [ ] Pick deploy window (lowest traffic period)
- [ ] Deploy to Arbitrum One mainnet
- [ ] Update backend env vars to point at V2 contract
- [ ] Verify gas sponsorship still works end-to-end with a test wallet
- [ ] Monitor for 24h, confirm no regressions

### 4. NPS survey (KPI measurement)

- [ ] Pick tool (Tally / Typeform / WhatsApp template)
- [ ] Draft 2-3 question survey (NPS + 1-2 qualitative)
- [ ] Send to ~50 most-active users (M1 beta cohort + Pizza Day power users)
- [ ] Allow 4-5 days for responses
- [ ] Tally results, document NPS score
- [ ] Add NPS section to Notion Metrics page

### 5. Tx success rate + uptime documentation

- [ ] Pull tx success rate from PostHog + Alchemy indexer (last 30 days)
- [ ] Pull uptime from Railway + health endpoint logs (last 30 days)
- [ ] Document both numbers in Notion Metrics page
- [ ] If either is below target, identify root cause and remediation

### 6. Public /stats: transaction table

- [ ] Design tx table layout (timestamp, amount, country, anonymized sender/recipient)
- [ ] Add backend endpoint that exposes paginated tx list (privacy-respecting)
- [ ] Build frontend table component on sippy.lat/stats
- [ ] Add filters or pagination if list is long
- [ ] Ship + verify privacy (no phone numbers, no PII)

### 7. User testimonials (10-15)

- [ ] DM 25 beta users + Pizza Day attendees with 2-3 quote prompts
- [ ] Follow up after 3 days if no response
- [ ] Collect 10-15 quotes with first name + country (with permission)
- [ ] Build testimonials section on landing page (or add to Notion report)
- [ ] Highlight 3-5 strongest quotes in the M2 report

### 8. Volume push (only if organic open beta isn't closing the gap)

- [ ] Mid-June check: if volume is <$45K, plan a campaign
- [ ] Options to consider:
  - [ ] Partner with Cartagena Onchain on a follow-up event with USDC drops
  - [ ] Referral bonus for inviting friends who onramp
  - [ ] Targeted ad spend in CO/MX through WhatsApp Business
- [ ] Track campaign volume contribution separately

### 9. Blog post #1: UX lessons from the closed beta

- [ ] Outline (key insights from beta feedback + parser/UX iterations)
- [ ] Draft
- [ ] Edit + publish on sippy.lat/blog or Mirror
- [ ] Cross-post on Twitter and LinkedIn

### 10. Blog post #2: Community + Cartagena recap

- [ ] Outline (March 23 Cartagena Onchain event, Pizza Day 2026, TechX ColCaribe)
- [ ] Draft with photos from each event
- [ ] Edit + publish
- [ ] Cross-post

### 11. Next LATAM market evaluation

- [ ] Pick top candidate (Mexico, Brazil, Argentina, Peru)
- [ ] Brief market research: WhatsApp penetration, USDC liquidity, regulatory posture, local onramp options
- [ ] Document findings (1-pager in repo or Notion)
- [ ] Decide whether to flag as M3 work or include lite version in M2

### 12. Final M2 report + submission

- [ ] Finalize all M2 sections in Notion
- [ ] Add KPI summary table with final numbers
- [ ] Add testimonials section
- [ ] Link blog posts and any open beta announcement
- [ ] Send to Chilla with disbursement-process question
- [ ] Save copy of final report state for our records

---

## Ongoing (continuous, not blocked items)

These are IN PROGRESS through the entire milestone — no checkbox, just keep going:

- Maintenance + bug fixes from user reports
- User support via Zoho
- Feature iterations from beta feedback (address book improvements, parser tweaks, etc.)
- Daily monitoring + on-call coverage

---

## Risks

1. **Legal pack timing.** If Lina can't ship drafts within ~10 days, open beta slips, which squeezes the volume KPI. Get her started immediately.
2. **Volume KPI gap.** $13K to close before end of June. Organic open beta should cover most of it, but have a contingency campaign ready.
3. **Measurement gaps.** NPS, tx success, uptime are unmeasured right now. None are technically difficult, but they need to actually get done — easy to deprioritize and find ourselves at end of month without numbers.

---

## Notes

- See `M2_PLAN.md` for the full architectural plan (auth hardening, onramp/off-ramp engineering, multi-instance backend, web product polish). The items above are the **deliverable + reporting** checklist for closing the milestone; the engineering work is tracked there.
- The M1 report Notion workspace is being updated live as items close: `https://sippylat.notion.site/Arbitrum-New-Protocols-and-Ideas-3-0-Grant-Report-332a041f9eff81fa80f2d4478694349e`

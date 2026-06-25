# Follow-on to the stats polish pass — grant-KPI framing

**Run this AFTER the "Season 1 stats + UX polish pass" task lands** (it builds on that — value-out hero, on-ramped as a separate tile, definition split, feed spender filter, tier rename, font bump). Branch off `main` (or continue the polish branch).

## Why

Sippy's Arbitrum / Questbook M2 **Growth KPIs** are, verbatim from the proposal:

> **200–400 onchain transactions · $50K–100K USDC volume · 75–100 monthly active wallets.**

`/stats` is the public proof asset the grant reviewer (and CT) will read. So the three dashboard metrics that map to those KPIs should be the **prominent, front-and-center numbers** — presented as honest **raw figures**, never as "% of target" (that would publicly expose where we're still tracking up).

## What to do

Make these three the lead "proof" set on `/stats`, with the value-out hero first and the other KPI tiles directly underneath:

1. **Transacted Volume / Value-out** (the hero, already set in the polish pass) → maps to "$50K–100K USDC volume" without blending deposits into the headline. On-ramped remains a separate context tile; gross facilitated may be mentioned in private grant copy only as arithmetic context (`value-out + on-ramped`), not as the public hero.
2. **Onchain transactions** → maps to "200–400 onchain transactions." This is the KPI Sippy is **strongest** on, so make it a prominent tile (currently ~759, well over the ceiling). Count **real Sippy transactions** consistently with the feed/volume definitions — exclude pure spender/operator relay legs so it's one count per logical transaction (it still comfortably exceeds 400).
3. **Monthly active wallets (MAW)** → maps to "75–100 MAW." Use the **loosened value-out definition** from the polish pass (verified senders with ≥1 value-out in the trailing 30d), so it's non-zero and honest.

## Rules

- **Raw numbers only on the public page** — do NOT render grant targets, "X / 400," or "% complete." The vs-KPI framing lives in the private Questbook M2 update, not here.
- **Lead with strength but stay honest** — transactions is the win, so give it prominence; show MAW and volume truthfully alongside, don't hide or inflate.
- **Compute everything live** — no hardcoded figures (prod moves daily; the count and MAW shift).
- Keep **everything** from the polish pass intact (value-out hero, on-ramped context tile, definition split with the score engine untouched, feed filter, tier rename, font bump).

## Verification

- `/stats` shows the three KPI-mapped metrics prominently (value-out/transacted volume, onchain transactions, MAW), all computed live, all non-zero, no grant-target framing on the page.
- typecheck + lint + web build clean; season suite green.
- Branch as before; **do not commit final / deploy / flip the flag.**

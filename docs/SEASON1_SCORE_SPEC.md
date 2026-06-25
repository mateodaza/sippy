# Sippy Season 1 — Usage Score Spec

**Status:** Draft operating spec · **Date:** 2026-06-23 · Pairs with `marketing/growth-strategy-v2.md`.
**One-line contract:** _Sippy rewards real usage, not parked capital._

This is the keystone the launch, CT messaging, dashboard instrumentation, grant-volume engine, and anti-farm rules all inherit. Numbers below are **proposed defaults** (see §8 to tune); the _shape_ is the decision.

---

## 0. What the score is — and is NOT

The **Sippy Score** is a **non-transferable reputation number** reflecting _recent, real, retained usage_. It exists to (a) make "real usage" legible to users and the public dashboard, (b) drive the grant's transacted-volume + active-wallet KPIs with the _right_ fuel, and (c) be hostile to farmers.

- **NOT** a token, and **NOT** a token promise. No "score → airdrop" language anywhere (the March 2026 SEC airdrop interpretation excludes anything where users give consideration — see strategy §6; clear with Lina before any reward-redemption copy).
- **NOT** transferable, sellable, or a balance.
- **NOT** earned by depositing/parking USDC. On-ramp emits only a **pending** score that realizes **nothing** unless the money is _sent or off-ramped within 14 days_.
- **NOT** a "top depositors" leaderboard. Public surfaces show usage + retention, never parked capital.

---

## 1. Score model — verbs, weights, diminishing volume

`Score = Σ over actions [ base(verb) + volumeBonus(verb, usd) ] × recencyWeight(age) − penalties`, subject to the caps in §1.3.

### 1.1 Verbs & base points

| Verb                           | Trigger (must be a _completed, on-chain/real_ event)     | Base pts                         | Volume bonus? | Notes                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------- | -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **First send** (activation)    | First completed send to a distinct verified counterparty | **50** (once)                    | no            | The one-time "you're real" event                                                                                                                                |
| **Send**                       | Completed USDC send to a distinct, verified recipient    | **10**                           | yes           | Core verb; per-counterparty decay (§1.3)                                                                                                                        |
| **Receive**                    | Completed receive from a distinct verified sender        | **3**                            | no            | Light — receiving is passive and wash-prone                                                                                                                     |
| **On-ramp** (`fund.sippy.lat`) | Funds land in the wallet                                 | **0 realized**                   | pending       | Emits `pending_score` (10 + volume bonus). Realizes **only** when the funds are sent or off-ramped within 14d; else forfeited. **No score for parked capital.** |
| **Off-ramp** (COP cash-out)    | Completed USDC→COP                                       | **20**                           | yes           | High weight: hard to sybil (KYC), proves the full loop                                                                                                          |
| **Active week**                | ≥1 qualifying value-out action in the week               | **15**                           | no            | × streak multiplier 1.0→1.5 (consecutive weeks, capped)                                                                                                         |
| **New distinct counterparty**  | Send to a recipient never paid before                    | **8**                            | no            | Rewards breadth, not ping-pong; capped at 10/season                                                                                                             |
| **Referral unlocked**          | Referee becomes _active_ (see §3)                        | **40** referrer / **25** referee | no            | Two-sided, paid **on unlock**, never on signup                                                                                                                  |
| **Referral retained**          | Referee still active 30d after activation                | **30** referrer                  | no            | "Referrals that become _active users_"                                                                                                                          |

### 1.2 Volume bonus (sub-linear — this is what makes it a _usage_ score, not a TVL game)

```
volumeBonus(usd) = round( min( V_CAP, K * sqrt(usd) ) )      K = 2, V_CAP = 20
```

Examples: $1 → 2 · $25 → 10 · $100 → 20 (capped) · $10,000 → 20 (still capped).
→ A whale moving $10k earns the same volume bonus as someone moving $100, and splitting into many tiny sends hits the per-day cap. Volume _helps_ but never _dominates_. (The grant's raw transacted-volume KPI is a **separate raw sum** of real sends — §6 — so we still want volume; we just don't let it warp the reputation score.)

### 1.3 Caps & penalties (anti-farm)

- **Per-tx:** volume bonus capped at `V_CAP = 20`.
- **Per-day:** total earned points capped at **150** (kills burst farming).
- **Per-pair decay:** points from a given `(sender → recipient)` pair fall to base-only after 3 sends, then to **0** after 8 (kills two-account ping-pong).
- **Sub-$1 value-out / first-send → 0 points, no activation:** a `send`/off-ramp/first-send below the `$1` active floor (§2) earns no base or volume points, and a sub-$1 first send does **not** activate the wallet — activation is the first send that actually clears `$1` (a sub-$1 test send still counts toward distinct-counterparty breadth, just not score or status). Ties earning + activation to the same real-usage floor as "active", so sub-$1 dust can't pump the score or fake activation.
- **Referral cap:** **500 pts/season** from referrals; per-referral points decay after the 10th unlocked referral.
- **Circular/self-dealing → 0:** any flow detected as A→B→A loops, immediate round-trips, or one funder seeding many wallets earns nothing (graph rules, §4).
- **On-ramp is pending, not realized:** on-ramp emits `pending_score`; the full amount realizes only when the funds are _sent or off-ramped within 14 days_, else it's forfeited entirely (0). Parked deposits earn nothing.

### 1.4 Decay (recency — the score reflects _current_ usage)

Computed over a **rolling 90-day window**:

```
recencyWeight(age) = 1.0  if age ≤ 30d
                     0.5  if 31d ≤ age ≤ 90d
                     0.0  if age > 90d
```

Plus: no qualifying activity in **21 days → dormant** (score frozen, excluded from "active", flagged). Re-activating restores it. The score cannot be farmed once and held — it bleeds without continued real use.

### 1.5 Tiers (progression, no token)

Tiers require **time + breadth**, not just a score number — so nobody hits a tier in a single day:

- **Newcomer** — 0
- **Activated** — first real send
- **Active** — ≥150 score **+ ≥1 active week**
- **Regular** — ≥600 **+ ≥4 active weeks + ≥3 distinct counterparties**
- **Power** — ≥1500 **+ ≥8 active weeks + KYC/personhood**

Tiers gate cosmetic/community perks and higher caps — never a token.

---

## 2. Active-user definition (the metric the dashboard + grant inherit)

**Verified counterparty** (load-bearing — the whole score depends on it) = a recipient/sender that is **phone-verified and wallet-linked**, is **not** on the same phone / device / IP / funding cluster as the user, and is **not** a known internal / vendor / operator account. Sends or receives that fail this (self, cluster, vendor) earn no score, confer no active status, and don't count as a distinct counterparty.

- **Activated wallet:** completed ≥1 real send (≥ $1 to a distinct verified counterparty — the same floor as "active").
- **Active wallet (period P):** completed **≥1 value-out action — a send OR an off-ramp — of ≥ $1 to a distinct verified counterparty** within P. _Receiving alone, or depositing alone, does NOT count as active._
- **MAW (the grant KPI):** distinct **active wallets in the trailing 30 days**.
- **Retained:** active in **two consecutive** 30-day periods.

This is deliberately stricter than "logged in" or "holds a balance" — it's the believable number, and it's exactly what the grant measures.

---

## 3. Referral unlock rules (the most farm-prone surface)

Referral via `sippy.lat/r/<code>`. Points are **staged** and **event-triggered**, never paid at signup (the single biggest fraud control):

| Stage            | Condition                                                                                                           | Reward                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **0 — Pending**  | Referee signs up via code                                                                                           | 0                                 |
| **1 — Unlock**   | Referee **activates**: first real send **≥ $5 within 14 days**, from funds they on-ramped or received-and-then-used | referrer **+40**, referee **+25** |
| **2 — Retained** | Referee still **active** 30 days after activation                                                                   | referrer **+30**                  |

Gates: referrer ≠ referee (distinct verified phone + WhatsApp + device); cluster/circular referrals (A→B→A, or a single funder behind many referees) → void; per-season cap (§1.3); diminishing after the 10th unlock. Models: Cash App ($5/14d), Gemini ($100/30d), Grass (100h), Crypto.com (30-day), IBKR ($10k/1yr).

---

## 4. Sybil / fraud gates

Sippy starts with an advantage pure-crypto apps lack: **a unique phone number + WhatsApp + a real first send** is already strong personhood + consideration.

1. **Identity floor:** one active score per verified phone number; first-send required to earn anything beyond signup.
2. **Velocity / device limits:** per-device and per-IP account-creation and earning caps; rapid multi-account creation flagged and held.
3. **Graph analysis (we already have the on-chain transfer graph + phone registry + indexer):** zero out circular flows, immediate round-trips, star/funnel patterns (one funder → many wallets), and tight reciprocal clusters.
4. **Event-triggered, delayed realization:** on-ramp points realize only when funds are _sent_; referral points only when the referee is _active_/_retained_. Nothing pays on intent.
5. **KYC tiering (existing):** higher tiers/caps require higher KYC — raises the cost of a sybil farm.
6. **Personhood at Power tier only:** Human Passport / Coinbase verification is required **only** to reach Power tier and its higher caps — **never** a base requirement. Base usage stays WhatsApp-native and friction-free for normal LATAM users.
7. **Off-chain review queue:** flagged clusters held for manual review before any redeemable perk; appeals path.

---

## 5. Public dashboard fields (`sippy.lat/stats` extension — the proof asset)

Show usage + retention; **never** parked capital. Per the volume-transparency rule, transacted and on-ramped are shown **separately**.

**Headline (trailing 30d + all-time):**

- Real users onboarded via WhatsApp (total · new this week)
- **Active wallets (MAW)** — per §2 definition
- **Repeat / retained users** + retention rate
- **Transacted volume** (sum of real sends) — the grant volume
- **On-ramped** (shown separately, labeled — never merged into "volume")
- **Off-ramp completions** (full-loop proof)
- Distinct counterparties / network reach · Countries

**Season-1 panel:**

- Activated users (% past first send) · Active-this-week
- Median score · score distribution (not a deposit board)
- **Most-active senders** community leaderboard — usage-ranked, sybil-filtered, opt-in handles
- Active referrals (referees who _became active_) — never raw signups

**Internal (ops, maybe public later):**

- **Subsidy efficiency:** gas + reward cost per $ of legitimate transacted volume → the direct target the gas migration (`docs/GAS_MIGRATION_PRIVY_AA.md`) optimizes.

---

## 6. How this serves the grant — and points the gas plan

The reward verbs **are** the grant KPI drivers: sends + off-ramp → transacted volume; active referrals + activation → MAW; the active-user definition → exactly what we report. We pump the number with retained real usage, not mercenary deposits.

The score also gives the gas work a precise objective: **maximize legitimate send/off-ramp volume at the lowest subsidy cost.** Every legitimate `send` the score incentivizes is a UserOp the paymaster sponsors — so "cost per legitimate $ moved" becomes the shared metric for both programs.

---

## 7. CT one-liner this enables (for the founder thread, next)

> _"Sippy Score rewards what you do with dollars — sending, cashing out, bringing a friend who actually uses it — and decays if you stop. It pays nothing for parked capital. No token promised; just a public, sybil-filtered usage record."_

---

## 8. Tunable parameters (defaults to ship, then tune on data)

| Param                             | Default                                       | Why / lever                                     |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `K` (volume slope)                | 2                                             | Higher → volume matters more (risk: whale-tilt) |
| `V_CAP` (per-tx volume bonus)     | 20                                            | Caps whale advantage                            |
| Daily points cap                  | 150                                           | Anti-burst                                      |
| Per-pair decay                    | base-only after 3, 0 after 8                  | Anti ping-pong                                  |
| On-ramp realization               | pending → realizes on use within 14d (else 0) | No score for parked capital                     |
| Referral unlock min send / window | $5 / 14d                                      | Lower = easier growth, higher = stronger gate   |
| Referral retained window          | 30d                                           | Defines "active referral"                       |
| Recency tiers                     | 1.0 ≤30d, 0.5 ≤90d, 0 >90d                    | Decay steepness                                 |
| Dormant threshold                 | 21d                                           | When score freezes                              |
| Referral season cap               | 500                                           | Anti referral-farm                              |

---

## 9. Instrumentation (what the backend must emit)

We already have `onchain.transfer` (source of truth), the phone→wallet registry, the indexer, and `gas_refuel_status`. Add a typed **score-event** stream so the score is _derived and recomputable_ (same discipline as `onchain_writer.service.ts`):

`send_completed · receive_completed · onramp_completed · onramp_funds_used · offramp_completed · referral_signup · referral_activated · referral_retained · counterparty_first_seen · active_week`

Each event carries `{ wallet, counterparty?, usd, txHash, timestamp }`. Score = pure function over the event log + the param table → fully replayable, auditable, and explainable to a user ("here's why your score is X"). Flagged/void events are recorded, not deleted (mirrors the idempotent-aggregate pattern already in the codebase).

---

### Open decisions before build

1. Final weights/caps (§8) — ship defaults, tune weekly on the first cohort.
2. Does Season 1 carry any _redeemable_ perk, or is it pure reputation + leaderboard for now? (Legal gate with Lina — keep it reputation-only until the airdrop-interpretation language is cleared.)
3. ~~Where personhood sits~~ — **resolved: Power tier only**, never a base requirement.
4. Leaderboard handle/opt-in + privacy (no phone numbers, ever).

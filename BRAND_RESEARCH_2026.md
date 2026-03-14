# Sippy Brand Research -- March 2026

> Purpose: Sharp, opinionated research to inform Sippy's brand identity, visual direction, and market positioning before public launch.
> Status: DRAFT -- Mateo extending with deeper research and logo prompt development.

---

## 1. Market Landscape

### 1.1 Direct Competitors: Stablecoins for LATAM

**Tier 1 -- Well-Funded, Established:**

| Company | Market | Users | Model | Weakness for Sippy's thesis |
|---------|--------|-------|-------|---------------------------|
| **DolarApp** | Mexico | Growing fast, a]16z-backed (~$50M) | App-based dollar accounts + Mastercard | App download required. Mexico-only. Never say "crypto" (smart). Sippy differentiator: zero-download, WhatsApp-native |
| **Bitso** | Mexico | ~8M | Exchange + B2B remittance rails | Consumer side is an exchange app, requires crypto literacy. B2B is where the real volume lives |
| **Lemon Cash** | Argentina | ~2M | Crypto exchange + Visa card | Crypto vocabulary. Argentina-focused. Ongoing regulatory pressure |
| **Nubank** | Brazil | 100M+ | Banking super-app, crypto is a feature | Crypto is a checkbox. Can't compete with Pix for domestic P2P. They'll never optimize for stablecoin P2P because it cannibalizes their rails |
| **Mercado Pago** | LATAM-wide | Massive | Commerce app with crypto purchases | Stablecoins buried in a commerce app. Won't optimize because it cannibalizes existing payment rails |

**Tier 2 -- Smaller / Struggling:**

| Company | Market | Status | Lesson |
|---------|--------|--------|--------|
| **Airtm** | Venezuela/LATAM | Active | Dollar accounts + peer exchange. Clunky UX, tool of last resort. Proves demand exists |
| **Belo** | Argentina | Active | Crypto wallet + card. Similar to Lemon but smaller. Regulatory pressure constant |
| **Buenbit** | Argentina | Nearly collapsed 2022-2023 | Liquidity issues. Cautionary tale about trust in this market |
| **Reserve (RSV/RSR)** | Venezuela | Shifted focus | Had real Venezuelan traction. Proved demand for "stable dollars" in unstable economies |
| **Celo/Valora** | LATAM/Africa | Spun out, shifted strategy | Mobile-first blockchain, WhatsApp integration pilots. Failed distribution despite good tech. Lesson: phone-number-based approach + good tech wasn't enough without distribution wedge |

### 1.2 Why Most Crypto-for-Remittances Plays Fail

1. **Remittance users need pesos, not dollars.** A migrant sending money to their mother in Colombia needs COP to land in a bank account or cash pickup. Stablecoins are invisible infrastructure at best.

2. **The "last mile" problem is physical, not digital.** Without dense off-ramp networks (agents, banks, cash-out points), the stablecoin is trapped. This is existential for Sippy.

3. **Trust takes years, not features.** Colombian users have been burned by pyramid schemes (DMG scandal, Ponzi schemes that wiped out savings in small towns). Any product that smells like "put your money in this new thing" triggers deep skepticism.

4. **Regulatory whiplash.** Argentina, Colombia, Brazil all have shifting rules. Products that get traction often get regulatory attention that kills growth.

### 1.3 What Actually Cracked LATAM Distribution

| Product | Country | Users | How They Grew | Key Insight |
|---------|---------|-------|---------------|-------------|
| **Nequi** | Colombia | ~19M | Free P2P transfers, "Nequiame" virality, social pressure | Became the verb. When your friend group uses Nequi, you have to use Nequi. Grew through social pressure, not marketing |
| **Daviplata** | Colombia | ~16M | Government subsidy disbursements during COVID | Institutional distribution: government choosing your platform creates adoption overnight |
| **Pix** | Brazil | 150M+ | Central bank mandate, free, instant, universal | Killed the P2P market in Brazil. You can't compete with Pix for domestic transfers |
| **Rappi** | Colombia/LATAM | Massive | Solved daily need (food delivery), expanded to finance | Finance alone wasn't the hook. Solved immediate pain first |

### 1.4 WhatsApp as a Financial Channel

| Project | Region | What Happened | Lesson |
|---------|--------|---------------|--------|
| **WhatsApp Pay** | Brazil, India | Tied to Pix/UPI. Modest adoption | Works where underlying rail is already universal. Failed to create new behavior |
| **Celo/Valora WhatsApp** | Kenya, Philippines | Users received a link, had to download Valora to claim | WhatsApp was just a notification layer, not native. Never scaled |
| **India banking bots** | India | HDFC, ICICI offer balance/bill-pay via WhatsApp | Works because a trusted institution is behind it. 500M+ WhatsApp users in India |
| **Africa (various)** | Nigeria, Kenya, SA | Most were notification layers on existing mobile money | Worked only when tied to M-Pesa or similar existing system |

### 1.5 The M-Pesa Model

M-Pesa is the most relevant precedent. The lessons are specific:

1. **Agent network was everything.** Launched with 300 agents (shops, kiosks) for cash-in/cash-out. By year 2: 10,000+. The agents were the product, not the technology.

2. **Safaricom's distribution was unfair.** 80% mobile market share. Every SIM card = potential M-Pesa account. Sippy's equivalent: WhatsApp's 90%+ penetration in Colombia. But Sippy doesn't control WhatsApp.

3. **Salary disbursement was the wedge.** Companies paid salaries via M-Pesa. Once your salary arrives there, you keep money there.

4. **Simplicity was non-negotiable.** Feature phones, USSD menus. No smartphone required.

5. **Trust was built through the telco brand.** Safaricom was already trusted. Sippy doesn't have an institutional trust anchor yet.

**LATAM application:** M-Pesa's model doesn't directly transfer because (a) banking penetration is higher (Nequi/Daviplata already work), (b) no equivalent telco monopoly to leverage, (c) the value proposition isn't "mobile payments" (which exist) but "dollar stability" (which is genuinely different).

---

## 2. Brand Positioning

### 2.1 The Core Insight

**Sippy is a savings product disguised as a payment product.**

The sends are the distribution mechanic. The holding is the value.

The Colombian peso has depreciated ~40% against the dollar over the past 5 years (from ~3,400 COP/USD to ~4,300+). A family that saved 10 million pesos in 2020 lost purchasing power equivalent to roughly $900. That's a month of rent that evaporated.

Sippy's value prop isn't "send money faster" (Nequi does that). It's "keep your money in dollars so it doesn't lose value." No domestic payment system solves currency devaluation.

### 2.2 Positioning Statement

**"Tus pesos en dolares. Desde WhatsApp."**
(Your pesos in dollars. From WhatsApp.)

Not "blockchain." Not "USDC." Not "stablecoin." Not even "crypto." Just: your money, in dollars, from the app you already use.

### 2.3 What Sippy Is NOT

- Not a crypto wallet (users don't know what that means)
- Not a remittance service (Felix Pago owns that)
- Not a bank (no interest, no credit, no debit card)
- Not an exchange (no trading)

### 2.4 Reference Brands: Complex Tech, Simple Surface

| Brand | What They Did | Tone | Sippy Takeaway |
|-------|--------------|------|----------------|
| **Wise** (TransferWise) | Said "the real exchange rate" instead of explaining FX infrastructure | Matter-of-fact, no hype, trust through transparency on fees | Sippy should show the real COP/USD rate always. Transparency = trust |
| **Nubank** | Made banking feel approachable by removing bank-speak | Warm, human, slightly playful but never frivolous | The right balance: warmth + competence = trust in LATAM. Not one or the other |
| **Cash App** | Made sending money feel like texting. $cashtag = social identity | Social, viral, identity-driven | Make the act of sending money feel social, not transactional |
| **M-Pesa** | Never marketed as "technology." It was "send money home" | Invisible tech, utility-focused | The tech is invisible. Market the outcome, not the mechanism |

### 2.5 Tone in LATAM Fintech

| Brand | Tone | Works For | Sippy Fit? |
|-------|------|-----------|-----------|
| **Nequi** | Playful, young, Colombian slang ("Nequiame") | 18-35 millennials/Gen Z | Too casual for money-holding. Good for P2P but not savings |
| **Nubank** | Warm but competent. "We're on your side against the big banks" | All ages, slight rebellion | YES -- the right model. Warm + trustworthy |
| **DolarApp** | Clean, modern, slightly aspirational. "Tu cuenta en dolares" | Professionals wanting sophistication | Good reference for the "dollar" framing |
| **Rappi** | Energetic, fast, youth-oriented | Commerce | Too energetic for money matters |

**Sippy's tone should land between Nubank and DolarApp.** Warm and conversational (because it's WhatsApp-native), but grounded and trustworthy (because you're holding people's money). Never corporate. Never crypto-bro. Never overly playful with money matters.

The "like texting a friend who handles your money" personality is exactly right, but the friend needs to feel competent. Think of the friend who's good with money: they're casual but precise. They'll joke around but they'll never be vague about numbers.

### 2.6 Building Trust After Crypto Scams in Colombia

Colombia has a specific trust problem: DMG (2008 Ponzi, 400K+ victims), various forex/crypto pyramid schemes, and the "get rich quick" crypto marketing of 2021.

**Trust signals that matter:**

1. **Show the peso equivalent. Always.** "25 USDC (~108,000 COP)" says "we know you think in pesos."
2. **Let users withdraw to pesos at any time.** The moment users feel trapped, trust collapses. Off-ramp = trust feature.
3. **Colombian team, Colombian faces.** "We're Colombian, we built this because our families need it" is the most powerful trust signal available.
4. **Small amounts first.** Don't encourage large deposits. "Enviale 5 dolares a tu hermana." Small amounts build comfort.
5. **Blockchain receipts = receipts.** "Every transaction has a public receipt you can verify" is powerful for skeptical users.
6. **No "invest" language. Ever.** "Keep your savings in dollars" != "invest in USDC." The difference is the difference between sounding like a service and sounding like a scam.

---

## 3. Visual Identity Direction

### 3.1 Current State

The PayPal+Coinbase merger logo was built for the hackathon. It signals "we're built on other people's infrastructure" rather than "we are the product." Time to shed it.

### 3.2 What the Brand Should Signal (Priority Order)

1. **Stability / Security** -- "Your money is safe here"
2. **Simplicity** -- "This is as easy as sending a message"
3. **Familiarity** -- "This feels like something I already use"
4. **Warmth** -- "This was made by people who care"

It should NOT communicate:
- "Crypto" or "blockchain" or "DeFi"
- "Innovation" or "disruption"
- "Finance" in the corporate, institutional sense

### 3.3 Color Analysis of LATAM Fintech

| Brand | Primary Color | Hex (approx) | Signal | Taken? |
|-------|--------------|--------------|--------|--------|
| Nequi | Purple | #6B2D8B | Youth, modernity, rebellion | YES -- owning purple in Colombia |
| Nubank | Purple | #820AD1 | Same signals, warmer | YES -- owning purple in Brazil |
| DolarApp | Green | #00C48C | Money, stability, growth | YES -- "dollar green" space |
| Lemon Cash | Yellow | #FFD700 | Energy, optimism, youth | YES -- Argentine market |
| Wise | Green/Blue | #9FE870 / #163300 | Trust, honesty | YES -- global space |
| Cash App | Green | #00D632 | Money, simplicity | YES -- US market |
| Daviplata | Red/Orange | | Energy, accessibility | YES -- Colombian market |

### 3.4 Color Direction: Teal / Cyan

**Recommendation: Teal-cyan range, leaning toward Tiffany blue (#0ABAB5 neighborhood)**

Why:
- **Unclaimed territory** in LATAM fintech. Purple is Nequi/Nubank. Green is dollar apps. Yellow is Lemon. Red is Daviplata. Teal is open.
- **Signals:** Calm, stable, trustworthy, modern. The color of water that's both fresh and deep.
- **Tiffany association:** Luxury-meets-accessibility. "Something valuable, presented simply." The Tiffany blue box is one of the most recognized brand colors in the world -- it signals "something precious inside" without being ostentatious. For Sippy, it says "your dollars are precious, and we treat them that way."
- **Cultural:** In Latin American visual culture, blues and teals are associated with water, sky, clarity. They contrast warmly against the warm tones of everyday Colombian environments.
- **WhatsApp adjacency:** Teal sits close to WhatsApp's green without copying it. It creates a subliminal "this belongs in my WhatsApp world" association.

**Color exploration directions:**
- Tiffany blue (#0ABAB5) -- classic, premium
- Robin egg blue (#00CCCC) -- lighter, more playful
- Deep teal (#008080) -- more serious, institutional
- Sippy teal (custom) -- somewhere between Tiffany and robin egg, optimized for mobile screens

### 3.5 Typography & Shape Language

- **Rounded, not sharp** -- trust, approachability (rounded corners, soft shapes)
- **Clean, not busy** -- simplicity, confidence
- **Lowercase "sippy"** -- reinforces casual, friendly personality
- **Sans-serif, slightly rounded** -- modern but warm. Think of the gap between Inter (too neutral) and Quicksand (too playful). Something like Nunito, Poppins, or a custom cut.

### 3.6 Logo Constraints

The logo must work at:
- **40x40 pixels** -- WhatsApp profile picture / avatar
- **Favicon (16x16)** -- browser tab
- **Full wordmark** -- website header, business card
- **Single color** -- for stamps, watermarks, low-fidelity

A rounded "S" monogram or a simple wordmark of "sippy" in a custom typeface. No complex symbols, no gradients that collapse at small sizes, no dollar signs.

### 3.7 Logo Prompt Foundations

> These are starting points for Mateo to refine into actual AI logo generation prompts. The prompts below need to be adapted to the specific tool (Midjourney, DALL-E, etc.) and iterated.

**Direction A: Monogram (S mark)**
- Rounded, flowing "S" shape in teal
- Could suggest a water drop, a chat bubble, or a dollar sign -- without being literally any of them
- Works at 40px for WhatsApp avatar
- Clean enough for single-color applications

**Direction B: Wordmark**
- "sippy" in lowercase, custom rounded sans-serif
- The dot of the "i" could be a small circle (chat bubble nod? coin nod?) in a slightly different shade
- Teal on white, white on teal reversals

**Direction C: Combination**
- Rounded S mark + "sippy" wordmark
- S mark used alone for avatars/favicons
- Full combination for headers/marketing

**Key prompt considerations for AI logo tools:**
- Specify: "fintech logo, NOT crypto, NOT blockchain aesthetic"
- Specify: "friendly, approachable, NOT corporate, NOT institutional"
- Specify: "must work at 40x40 pixels as WhatsApp avatar"
- Specify color: "teal, cyan, Tiffany blue range"
- Avoid: gradients, 3D effects, complex symbols, dollar signs, coins, chains
- Reference mood: "Nubank meets Wise meets WhatsApp"

---

## 4. Naming Check

### 4.1 "Sippy" in Spanish
- The word doesn't exist in Spanish. No negative connotations.
- Phonetically natural: "SI-pi" (two syllables, clean sounds). Spanish speakers pronounce it correctly without thinking.
- No conflict with Colombian slang, profanity, or negative associations.
- The "s" sound at the start is clean and approachable.

### 4.2 "Sippy" in Portuguese
- No negative connotations in Brazilian Portuguese.
- Pronounced similarly: "SI-pi."

### 4.3 The Grandmother Test
Can a Colombian abuela say "Sippy"? **Yes.** The sounds are native to Spanish (S, I, P, I). No "th," no "sh," no unusual consonant clusters. Easier to say than "Nequi" (which some older Colombians still mispronounce).

The "-i" ending has a natural diminutive quality in Colombian Spanish. It feels affectionate and small, like a nickname for something bigger. Matches brand personality.

### 4.4 English Connotations
"Sippy cup" -- a child's drinking cup with a spill-proof lid. This is actually a **strength** for the brand thesis: "the first safe taste of something new." The grant proposal already uses this. It communicates: beginner-friendly, safe, non-threatening. The association only exists for English speakers, and the primary market speaks Spanish.

### 4.5 Competitive Namespace
- **Sippy (sippy.io)**: SaaS for podcast guest bookings. No fintech conflict.
- **Sippy Software**: Older VoIP/telecom company. B2B, different space.
- No "Sippy" exists in fintech, payments, crypto, or banking.

The name is clean for financial services.

### 4.6 Domain Situation
- **sippy.lat** -- Owned. Good for LATAM positioning. The .lat TLD communicates regional focus.
- **sippy.co** -- Worth checking. Colombian TLD, global credibility.
- **sippy.money** -- On-the-nose but memorable.
- **sippy.app** -- Clean if available.

The .lat TLD is smart for current stage. Says "we're LATAM-focused" without pretending to be global.

---

## 5. Strategic Insights

### 5.1 Sippy's Three Unfair Advantages

1. **Colombia-specific, not LATAM-generic.** Nobody well-funded is building a dollar-access product specifically for Colombia's WhatsApp-native population. Colombia is $350B economy, 52M people, 90%+ WhatsApp penetration, consistent peso devaluation -- but not "crisis enough" for Argentina/Venezuela plays and not "big enough" for Brazil plays. Sippy occupies this gap.

2. **Zero-download, zero-concept onboarding.** Every competitor requires an app download. Conversion from "hear about product" to "download app, create account, verify identity, understand interface" is 5-10%. Conversion from "receive WhatsApp message with money" to "you're a user" is nearly 100%. This viral loop doesn't exist for app-based competitors.

3. **The team IS the target user.** Colombian founders with personal networks in the target cities. First 50 users are friends and family. This is how Nequi started (Bancolombia employees with friends) and how M-Pesa started (Safaricom employees in Nairobi). You can't buy this with VC money.

### 5.2 Distribution Strategy: The Recipient Notification

**The recipient notification IS the marketing.** Every send to a non-user is a signup event.

"Tu amigo te envio $10 dolares. Responde 'hola' para recibirlos."

This is exactly how M-Pesa grew (employees sent money to friends who had to register to receive) and how PayPal grew ("someone sent you $20, click here to claim").

**The single most important product metric:** "Sends to non-users as % of total sends." If high, network grows virally. If low, you're serving a closed group.

**Strategy:**
1. Seed 50 power users with USDC (beta testers, grant can fund this)
2. Those users send money to their contacts
3. Every send to a non-user is a signup event
4. Each new user sends to their own contacts
5. Network grows through transactions, not marketing

### 5.3 Biggest Risk: The Off-Ramp

The biggest risk isn't competition, regulation, or technology.

**It's the off-ramp.** If a user receives 50 USDC and can't convert it to Colombian pesos to buy groceries, the product is useless. The entire value proposition collapses.

The onramp (COP to USDC) is necessary but secondary because first users won't need it (they'll receive USDC from someone who already has it). But the off-ramp (USDC to COP) is existential because every user, eventually, needs to spend in pesos.

**Second risk:** WhatsApp platform dependency. Meta can change WhatsApp Business API policies, raise prices, or restrict financial transactions at any time. The web wallet fallback helps, but if WhatsApp cuts access, the core product disappears.

### 5.4 Timing Opportunity

Colombia's central bank has been exploring a CBDC (digital peso) and fintech regulation is evolving. If Colombia follows Brazil's Pix model and creates a real-time payment system, domestic peso-to-peso transfers become free and instant.

That would kill any "send pesos" value proposition. But it would NOT kill "keep dollars." Because Sippy's core value prop isn't "send money faster" (Nequi does that). It's "keep your money in dollars so it doesn't lose value."

**Sippy should lean hard into "dollar stability" and away from "P2P payments."** The P2P payment is the mechanism, not the value proposition. The value is: your money holds its value.

---

## 6. Brand Decision Brief

> These are locked decisions for next week. Research is in sections 1-5. This is the answer sheet.

### 6.1 Positioning Line (Locked)

**Primary (Spanish):** "Tus pesos en dolares. Desde WhatsApp."
**Primary (English):** "Your pesos in dollars. From WhatsApp."
**Secondary (tagline):** "Siempre vale lo mismo." / "Always worth the same."

### 6.2 Homepage Hero Copy

**Hero:** "Guarda dolares desde WhatsApp"
**Subhead:** "Envia 'hola' y empieza. Sin app, sin banco, sin complicaciones."
**CTA button:** "Abrir en WhatsApp" (deep link to wa.me/[number])

**English variant:**
**Hero:** "Save in dollars from WhatsApp"
**Subhead:** "Send 'hi' and start. No app, no bank, no complications."
**CTA:** "Open in WhatsApp"

### 6.3 Message Hierarchy (3 Pillars)

| Priority | Message | Proof Point |
|----------|---------|-------------|
| 1 | **Your money keeps its value.** The peso loses ~15%/year. Dollars don't. | "10M COP saved in 2020 lost ~$900 in purchasing power by 2025" |
| 2 | **It works from WhatsApp.** No download, no new app, no learning curve. | "Envia 'hola' al +[number] y ya tienes cuenta" |
| 3 | **It's yours.** Non-custodial. You hold your own keys. Every transaction has a public receipt. | "Your money never touches our servers" |

### 6.4 Palette Tokens (Locked Direction, Final Hex TBD)

| Token | Role | Range | Notes |
|-------|------|-------|-------|
| `--sippy-primary` | Brand color, CTAs, logo | Tiffany neighborhood (#0ABAB5 +/- 10) | Test against WhatsApp dark mode and light mode. Must not clash with WhatsApp green (#25D366) |
| `--sippy-primary-dark` | Hover states, emphasis | Deeper teal (#008B8B range) | Needs WCAG AA contrast on white |
| `--sippy-surface` | Card backgrounds | White or very light teal (#F0FDFA) | Must feel clean, not clinical |
| `--sippy-text` | Body text | Near-black (#1A1A2E or #0F172A) | Warm black, not pure #000 |
| `--sippy-success` | Transaction confirmations | Green (#10B981 range) | Distinct from primary teal |
| `--sippy-error` | Errors, warnings | Red (#EF4444) | Standard |
| `--sippy-muted` | Secondary text, borders | Gray (#94A3B8) | |

**Open:** Test final hex values on actual mobile screens (Samsung Galaxy A-series, iPhone SE -- the devices beta testers actually use). OLED vs LCD rendering differs.

### 6.5 Logo Constraints (Locked)

| Constraint | Requirement |
|-----------|-------------|
| **Sizes** | Must work at 40x40 (WhatsApp avatar), 16x16 (favicon), and full-width wordmark |
| **Colors** | Must work in: full color on white, full color on dark, single color (white on teal, teal on white), grayscale |
| **Shape** | Rounded, not angular. No sharp edges. |
| **Content** | No coins, chains, dollar signs, locks, shields, globes, or crypto imagery |
| **Type** | Lowercase "sippy". Rounded sans-serif. |
| **Format** | Deliver as: SVG (scalable), PNG at 40px/80px/160px/320px, favicon ICO |
| **System** | Monogram (S or abstract mark) for small uses + wordmark for headers. Both must feel like the same brand. |

### 6.6 Tone Rules (Locked)

**Voice:** Like texting a friend who's good with money. Casual but precise. Warm but never vague about numbers.

| Do | Don't |
|----|-------|
| "Enviaste $10 a mama" | "Your transaction of 10.00 USDC has been processed" |
| "Te quedan $40 este mes" | "Remaining monthly allowance: $40.00 USD" |
| Show COP equivalent always | Show only USD |
| "Tus dolares, siempre seguros" | "Leveraging blockchain technology for security" |
| Speak like a Colombian friend | Speak like a bank |
| Use "tu" (informal) | Use "usted" (formal) |

### 6.7 Words We Use / Never Use

| USE | NEVER USE |
|-----|-----------|
| dolares | USDC, stablecoin, token |
| enviar, recibir | transferir (too formal), transaccionar |
| guardar | invertir, stakear, depositar |
| tu cuenta | tu wallet, tu billetera crypto |
| recibo (receipt) | hash, transaccion on-chain |
| Sippy | "la plataforma", "el servicio" |
| WhatsApp | bot, chatbot, agente |
| siempre vale lo mismo | estable, pegged, backed |

**Exception:** In legal/compliance contexts (ToS, SFC filings), use proper financial terminology. The "never use" list applies to user-facing copy only.

---

## 7. Off-Ramp Strategy

> The off-ramp is existential. If users can't convert USDC to COP, the product is useless. This section specifies the concrete plan, not just the risk.

### 7.1 Beta Off-Ramp (March 26 -- 50 Testers)

**Path:** Users can off-ramp USDC to COP through the current onramp partner's reverse flow.

**Fallback if partner off-ramp is slow or unavailable:**
1. **P2P within the beta group.** If User A wants COP and User B wants USD, they trade directly via Sippy (A sends USDC to B, B sends COP via Nequi). Sippy doesn't intermediate this -- the beta testers coordinate it themselves. This is how Reserve's Venezuelan community worked initially.
2. **Manual ops support.** For the first 50 users, Mateo/Carlos can manually facilitate off-ramp via Bitso or direct exchange if the partner flow breaks. This doesn't scale but buys time.
3. **Web wallet sweep to EOA.** Users can sweep USDC to their own EOA (already built in settings page) and off-ramp through any exchange that supports Arbitrum USDC (Bitso, Binance, Coinbase).

**What must be true before beta:**
- [ ] Onramp partner reverse flow (USDC -> COP) is tested end-to-end with a real transaction
- [ ] Sweep-to-EOA flow is tested and documented for beta users as a fallback
- [ ] At least one Bitso/Binance off-ramp path is documented as a last resort

### 7.2 Public Launch Off-Ramp (June 5)

**Primary path:** Integrated off-ramp through onramp partner or a dedicated partner.

**Criteria for partner evaluation:**
- Supports COP disbursement to Nequi, Daviplata, or bank transfer
- API-driven (not manual)
- < $2 fee for $50 off-ramp (users will compare to Nequi's free P2P)
- Settlement time < 24 hours
- Compliant with Colombian SFC guidelines

**Partners to evaluate:**
| Partner | Model | Pros | Cons |
|---------|-------|------|------|
| Current onramp partner | Bidirectional | Already integrated, knows the team | Off-ramp flow needs testing |
| Bitso | Exchange API | Largest LATAM crypto exchange, COP support | API integration effort, exchange fees |
| Airtm | Peer exchange | Supports COP, existing USDC on/off-ramp | Clunky UX, variable fees |
| Local P2P network | Manual coordination | Zero integration effort | Doesn't scale, trust issues |
| Circle CCTP + local partner | Cross-chain + local exchange | Direct USDC -> fiat | Complex integration |

**Decision timeline:** Evaluate by April 15. Select primary off-ramp partner by May 1. Integrate by May 20. Test with beta users last 2 weeks of May.

### 7.3 Long-Term Off-Ramp Vision (Q3-Q4 2026)

**Goal:** "Gasta tus dolares en pesos" -- spend your dollars in pesos without thinking about the conversion.

Paths:
1. **Virtual card (Visa/Mastercard):** Users spend USDC via a card that auto-converts to COP at POS. This is the DolarApp/Lemon Cash model. Requires a card issuing partner. Expensive to set up but the ultimate UX.
2. **Nequi/Daviplata integration:** Direct USDC -> COP disbursement to the user's existing Nequi or Daviplata account. Instant, familiar, trusted by users. Requires partnership with Bancolombia (Nequi) or Davivienda (Daviplata). Hard to get but transformative.
3. **Agent network (M-Pesa model):** Local shops where users can cash out USDC for COP. Requires physical operations. Only makes sense at 10K+ users.

**For now:** Focus on paths 1-3 in 7.2. The long-term vision informs partnership conversations but is not blocking beta or public launch.

---

## 8. Open Research (For Mateo to Extend)

- [ ] Deep dive on Tiffany blue / teal range -- test on Samsung Galaxy A-series, iPhone SE, WhatsApp dark mode
- [ ] Check domain availability: sippy.co, sippy.money, sippy.app
- [ ] Study Nequi's first 6 months of growth -- how did they seed the first 10K users?
- [ ] WhatsApp Business API pricing trajectory -- what happens if Meta raises prices?
- [ ] Regulatory landscape for stablecoin wallets in Colombia (SFC Circular 029, fintech sandbox rules)
- [ ] Develop full NanoBanana Pro 2 / Midjourney prompt sequences from the constraints in 6.5
- [ ] Test onramp partner off-ramp flow end-to-end with real COP disbursement
- [ ] Interview 5 potential beta testers: "If someone sent you $10 on WhatsApp, would you trust it? What would make you trust it?"

### Logo Generation Prompts (Starting Points)

> Adapt to NanoBanana Pro 2 or tool of choice. These are constraint-driven starting points, not final prompts.

**Direction A: Monogram (S mark)**
```
Minimal fintech logo, single letter "S" monogram,
rounded flowing shape, teal/cyan color (#0ABAB5 range), clean modern design,
works at 40x40 pixels, NOT crypto aesthetic, NOT blockchain, friendly and
approachable, white background, vector style, flat design.
The S should suggest flow/movement (like water or a conversation),
not rigidity or technology.
```

**Direction B: Wordmark**
```
Fintech wordmark logo "sippy" in lowercase,
custom rounded sans-serif typeface, teal/cyan color, clean minimal design,
friendly approachable NOT corporate, NOT crypto, modern fintech brand,
white background, vector style.
The typeface should feel like Nunito or Poppins but custom --
rounded terminals, even stroke weight, generous letter spacing.
The dot of the "i" could be slightly oversized or a different shade.
```

**Direction C: Combination**
```
Fintech logo combining a rounded "S" monogram mark with
the wordmark "sippy" in lowercase. The mark should work
independently at 40x40 pixels (WhatsApp avatar size).
Teal/cyan color (#0ABAB5), white background, flat vector,
NOT crypto, NOT blockchain, friendly and modern.
```

**Anti-patterns (add to all prompts):**
- No coins, chains, blocks, or crypto symbols
- No gradients that fail at small sizes
- No 3D effects or shadows
- No dollar signs or currency symbols in the logo itself
- No globe/world imagery
- No shield/lock imagery

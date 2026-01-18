# Sippy - Questbook Resubmission V6

**Response to Admin Feedback (Chilla - January 9, 2026)**

---

## Summary of Changes

We appreciate the detailed feedback and the opportunity to revise our proposal. Based on your guidance, we've made the following key changes:

1. **Reduced budget:** $41,000 → **$14,000**
2. **Added Felix Pago differentiation:** Clear comparison showing we're different products
3. **Improved KPI/budget ratio:** $15K volume for $14K grant (1.07x - exceeds grant amount)
4. **Addressed COP reality:** Pivoted to stablecoin-holding segment, not pure remittances
5. **Acknowledged PYUSD→USDC scope:** Clarified what else the grant covers

---

## 1. Felix Pago Differentiation

**We appreciate you raising Felix Pago - they're an impressive company. However, Sippy and Felix are fundamentally different products serving different use cases.**

### Side-by-Side Comparison

| Aspect | Felix Pago | Sippy |
|--------|-----------|-------|
| **What it is** | Fiat-to-fiat remittance pipe | Crypto-native stablecoin wallet |
| **User owns wallet?** | No - users never touch crypto | Yes - MPC wallet with export option |
| **Blockchain** | Stellar (invisible infrastructure) | Arbitrum (user-facing) |
| **Direction** | One-way (US → LATAM only) | Bidirectional P2P (local + international) |
| **Use case** | Cross-border remittances | P2P payments + savings + DeFi on-ramp |
| **End result** | Pesos in bank account | USDC in user's own wallet |
| **Self-custody option** | None | Yes - export private keys anytime |
| **Local payments** | No (cross-border only) | Yes - Colombians paying Colombians |
| **Fees** | $2.50-$27.99 + FX markup | Free P2P transfers |
| **Funding** | $105M raised | $14K requested |

### The Core Difference

**Felix Pago** = Users send USD, recipients get pesos. Blockchain is invisible plumbing. Neither sender nor receiver ever knows crypto is involved. Users don't own wallets - they own nothing on-chain.

**Sippy** = Users own USDC in their own Arbitrum wallet. They can hold it, send it locally, receive it, export their keys, and eventually access the broader Arbitrum ecosystem. The blockchain is the product, not hidden infrastructure.

### Different Markets, Different Users

**Felix serves:** US-based immigrants sending money home (one-way corridor)
- Sender in US pays USD via debit card
- Recipient in Colombia gets pesos in their bank
- Neither party interacts with crypto

**Sippy serves:** Colombians who want to hold and transact in stablecoins
- Freelancers receiving international payments in USDC
- Users seeking inflation hedge / dollar savings
- Local P2P payments between Colombians
- Informal commerce and small businesses (vendors, service providers)
- Regular WhatsApp users wanting simpler payments
- Future DeFi users starting with simple payments

**Felix is competing with Western Union. Sippy is building Arbitrum's consumer wallet layer.**

### Why This Matters for Arbitrum

Felix uses Stellar blockchain - their success creates zero value for Arbitrum.

Every Sippy user = new Arbitrum wallet with on-chain USDC. This directly advances Arbitrum's ecosystem goals.

---

## 2. Addressing the COP Conversion Reality

**You're right that ~90% of remittance flow converts to COP. We acknowledge this and have refined our target market accordingly.**

### Our Refined Target Segment

Remittances are one use case we address - but at a different layer than Felix. Felix handles fiat-to-fiat conversion. Sippy gives users a wallet to receive USDC, hold it, and spend it locally. These products can coexist; a user might receive dollars via Felix AND use Sippy for local payments.

Our core focus is the **stablecoin-holding segment** - Colombians who have reasons to keep dollars:

**1. Freelancers Receiving International Payments**
- Colombian developers, designers, writers paid by US/EU clients
- They receive USDC and may hold it for days/weeks before converting
- Currently use Binance P2P, exchanges - Sippy is simpler

**2. Inflation Hedge / Dollar Savings**
- Colombian peso has depreciated ~40% vs USD over 5 years
- MoneyGram just launched in Colombia specifically for "stablecoin savings"
- Growing demand for dollar-denominated savings without bank account

**3. Local P2P in Stablecoins**
- Tech-savvy Colombians already transacting in USDC
- Currently using Binance P2P, El Dorado - fragmented experience
- Sippy provides WhatsApp-native convenience

**4. Cross-Border Within LATAM**
- Colombians sending to Venezuela, Ecuador, etc.
- Stablecoin-to-stablecoin transfers (no COP needed)

### Market Validation

- Stablecoins = 66% of all crypto transactions in Colombia (June 2024)
- Bancolombia launched COPW peso stablecoin + Wenia exchange (May 2024)
- MoneyGram launching Colombia app specifically for stablecoin savings
- Kraken just added COP deposits - crypto demand is real

### Honest Sizing

The $11.85B remittance market includes users who need immediate COP - that's Felix's strength. Our addressable market is the segment that wants to hold and use digital dollars:

- ~500K Colombian freelancers receiving international payments
- Growing stablecoin-savvy population
- Early adopters seeking dollar savings

**Our revised target of 500 users + $15K volume reflects this realistic scope.**

---

## 3. PYUSD→USDC Scope Clarification

**You're correct that the token swap itself is trivial (1-2 days). Here's what else the grant covers:**

### What the Grant Actually Funds

| Item | Effort | Why It Matters |
|------|--------|----------------|
| USDC integration | 1-2 days | Trivial - you're right |
| Security hardening | 2 weeks | PIN confirmation, 2FA, rate limits, session management |
| Wallet export functionality | 1 week | Self-custody path - differentiator from Felix |
| Account recovery flow | 1 week | Email backup, verification process |
| Privacy controls | 3-4 days | Phone visibility settings |
| User settings | 1 week | Thresholds, limits, preferences |
| Monitoring infrastructure | 1 week | Error tracking, uptime, alerts |
| Legal basics | 2 weeks | ToS, Privacy Policy, UIAF compliance prep |
| User acquisition (500 users) | 8 weeks | Community events, onboarding, support |
| Documentation | 1 week | Technical docs, blog posts |
| Final report | 3-4 days | Learnings for Arbitrum ecosystem |

**Total: ~20 weeks of focused work (~5 months)**

The PYUSD→USDC swap is table stakes. The grant funds everything needed to go from hackathon demo to production service with real users and real commerce.

---

## 4. Revised Budget: $14,000

**We accept the guidance to reduce scope to $10-15K range. Here's our revised proposal:**

### Budget Breakdown

| Milestone | Amount | Timeline | Key Deliverables |
|-----------|--------|----------|------------------|
| **M1: Production Ready** | $8,000 | 8 weeks | USDC integration, security hardening, PIN/2FA, export functionality, dual currency display, monitoring, closed beta (30 testers) |
| **M2: Beta Launch** | $6,000 | 12 weeks | 500 users, $15K volume, legal basics, documentation, final report |
| **Total** | **$14,000** | **20 weeks (~5 months)** | |

### M1: Production Ready ($8,000 - 8 weeks)

**Deliverables:**
- USDC integration (replacing PYUSD)
- Security hardening:
  - PIN confirmation before all transfers
  - 2FA via email for transfers >$50
  - Rate limiting and session management
  - Transaction sanity checks
- Wallet export functionality (self-custody path)
- Account recovery flow (email backup)
- Dual currency display (USD + COP equivalent in all UI)
- Privacy controls (phone visibility)
- User settings (thresholds, limits)
- Monitoring infrastructure (error tracking, uptime)
- WhatsApp production number active (already approved)
- **Closed beta: 30 testers validating all features**

**KPIs:**
- All security features implemented and tested
- Export functionality working
- Monitoring dashboard live
- **30 closed beta testers with successful transactions**
- Ready for public beta launch

**Budget Detail:**
| Category | Amount |
|----------|--------|
| Personnel (Mateo: 80hrs × $50, Carlos: 70hrs × $45) | $7,150 |
| Infrastructure (hosting, monitoring) | $500 |
| Contingency | $350 |
| **Total M1** | **$8,000** |

*Note: M1 requires significant dev hours because we're taking MVP-level code to production-ready. This means hardening security, adding user protections, building recovery flows, and implementing monitoring - work that doesn't exist in the hackathon demo.*

---

### M2: Public Beta ($6,000 - 12 weeks after M1)

**Deliverables:**
- 500 beta users in Colombia with active wallets
- $15,000+ cumulative USDC volume (total transfers between Sippy wallets, tracked via on-chain analytics dashboard)
- **Commerce Experiment (Bonus Track):**
  - Exploring local business adoption in Colombia
  - Goal: test if Sippy can enable USDC→COP conversion ecosystem
  - Not a dependency for core KPIs - an additional growth experiment
  - **Documented deliverable:** Written report covering: businesses approached, conversion rates, user feedback on COP liquidity needs, barriers encountered, and recommendations for scaling
  - If successful, provides model for scaling; if not, still valuable market insights
- Legal basics:
  - Terms of Service
  - Privacy Policy
  - UIAF reporting workflow documented
- Technical documentation package
- 1-2 blog posts (WhatsApp integration patterns, lessons learned)
- User testimonials (10-15)
- Final report to Arbitrum DAO

**KPIs:**
- 500 unique wallets created
- $15K+ cumulative volume
- NPS > 40
- Documentation published
- Report delivered
- Commerce experiment documented (learnings regardless of outcome)

**Budget Detail:**
| Category | Amount |
|----------|--------|
| Personnel (Mateo: 40hrs × $50, Carlos: 35hrs × $45, Noah: 30hrs × $35) | $4,625 |
| Infrastructure | $200 |
| Marketing/Community events | $500 |
| Legal (ToS template, basic review) | $300 |
| Gas operations | $375 |
| **Total M2** | **$6,000** |

---

### KPI Comparison: Old vs New

| Metric | Previous ($41K) | Revised ($14K) | Improvement |
|--------|-----------------|----------------|-------------|
| Users | 500 | 500 | Same target, 66% less budget |
| Volume | $35,000 | $15,000 | Realistic for P2P beta |
| Volume/Grant | 0.85x | **1.07x** | Better than 1:1 ratio |
| Timeline | 28 weeks | 20 weeks | 29% faster |
| Avg $/user | $82 | $28 | 3x more efficient per user |

**The revised proposal delivers >1x volume-to-grant ratio with 66% less budget.**

---

## 5. Why This Still Matters for Arbitrum

At $14K with 500 users and real commerce validation, Sippy delivers exceptional value:

### Direct Ecosystem Impact
- **500 new Arbitrum wallets** - real users, not bots
- **$15K+ USDC volume** - genuine on-chain activity (>1x grant amount)
- **Proof of concept** - WhatsApp → Arbitrum bridge works at scale
- **Replicable model** - documentation for others to learn from
- **Commerce experiment** - testing USDC→COP pathway

### Strategic Value
- **First WhatsApp stablecoin wallet on Arbitrum** - category creation
- **"Arbitrum Everywhere"** - Sippy brings Arbitrum to people who never heard of blockchain
- **First digital dollar experience** - Users discover blockchain through simple payments, not jargon
- **Consumer app leadership** - Arbitrum serving mainstream users
- **LATAM beachhead** - Colombia as proof point for 500M+ WhatsApp users
- **Different from Felix** - Arbitrum-native, user-owned wallets

### What Success Unlocks
If we hit 500 users + $15K volume:
- Proof of product-market fit
- Foundation for follow-on funding (seed, grants)
- Model for regional expansion (Ecuador, Peru, Venezuela)
- Case study for Arbitrum consumer apps

If commerce experiment succeeds:
- USDC→COP conversion pathway validated
- Model for local business adoption

---

## 6. Retained Strengths from Previous Submission

### Technical Foundation (Unchanged)
- GasRefuel.sol deployed on Arbitrum One mainnet
- WhatsApp Business API approved (2,000 bot-initiated/day)
- Coinbase CDP wallet infrastructure functional
- LLM parsing operational (Groq - Llama 3.3 70B)
- ETHOnline 2025 Finalist validation

### Team Experience (Unchanged)
- **Mateo Daza:** Lead Frontend at Asymmetry Finance, 8+ years Web3
- **Carlos Quintero:** Lead Backend at Giveth, 8+ years production
- **Noah Biel:** Grants Analyst, Master's in Social Innovation
- Combined 18+ years relevant experience

### Custody Model (Unchanged)
- MPC-based via Coinbase CDP Server Wallets
- Each user owns their wallet and USDC balance
- Export functionality for full self-custody
- User-owned, not pooled funds

### Regulatory Approach (Unchanged)
- Crypto legal but unregulated in Colombia
- SARLAFT/UIAF compliance for transactions >$150
- Tiered KYC structure ready
- Legal basics (ToS, Privacy Policy) in M2

---

## 7. Technical & Operational Details

### Account Recovery (M1 Deliverable)

**Prevention - Email Backup:**
- During onboarding, users optionally register a recovery email
- Strongly encouraged for accounts with balances >$50

**Recovery Process:**
1. User contacts support via email or webapp
2. Verification requirements based on account value:
   - **<$100 balance:** Original email + last 4 digits of previous phone + recent transaction details
   - **>$100 balance:** Above + ID document verification
   - **>$500 balance:** Enhanced verification with identity confirmation
3. New phone number linked to existing wallet
4. Old phone number deauthorized

**Edge Cases:**
- User can always export private key before losing access (proactive)
- If user has exported key, they retain full access regardless of phone status

### LLM Transaction Safeguards

**1. Structured Parsing:**
LLM extracts intent into structured format (action, amount, recipient) - never executed directly from raw text. If parsing confidence is low, system asks for clarification rather than guessing.

**2. Explicit Confirmation:**
Before any transfer, user sees:
> "Send $25 USDC to +57 300 XXX XXXX (Maria)? Reply with your PIN to confirm."

**3. Amount Sanity Checks:**
- Transactions >$50: Requires 2FA (email verification code)
- Transactions >$100: Requires explicit re-confirmation
- Transactions > user's daily limit: Blocked with explanation

**4. Recipient Validation:**
- System confirms recipient exists before execution
- New recipients flagged: "This is a new contact. Please verify the number."
- Phone number format validation for Colombia (+57)

**5. Cancellation Window:**
30-second cancel window after PIN confirmation - transaction queued with cancel option before blockchain submission.

**6. User-Controlled Settings (M1):**
Users can customize via settings:
- Confirmation threshold (default $50, adjustable)
- 2FA requirement (default on for >$50)
- Daily transfer limits
- New recipient warnings (on/off)

**7. Fallback to Human-Readable:**
If LLM is uncertain: "I didn't understand that. Did you mean to send money? Please try: 'send $25 to +57 300 XXX XXXX'"

### Dispute Resolution

**Pre-Transaction Protection:**
- Transaction preview with amount, recipient phone, recipient name (if registered)
- PIN confirmation required for all transfers
- 2FA for transfers >$50
- 30-second cancel window after confirmation

**Transaction History & Visibility:**
- Full history accessible via "history" command
- Each transaction shows: amount, recipient, timestamp, Arbiscan link
- Users can verify any transaction on-chain

**Support & Disputes:**
- Dedicated support: WhatsApp support number + email for issues
- For incorrect transactions, we facilitate communication between sender/recipient
- On-chain transactions are irreversible, but if both parties agree, we can facilitate a return transfer
- Terms of Service clearly outline user responsibilities and dispute procedures

### Regulatory Framework

**Current Colombian Status:**
Crypto assets are legal but unregulated in Colombia. The Superintendencia Financiera (SFC) does not regulate, supervise, or endorse crypto operations. Bill 510/2025 ("Ley Cripto") is progressing through Congress and would establish VASP licensing if passed.

**AML/KYC Compliance (SARLAFT):**
- Transactions >$150 USD-equivalent: Reported to UIAF per Resolution 314
- Enhanced verification for transactions >$500/month
- PEP screening and high-risk jurisdiction checks

**Tiered KYC Approach:**
- **Tier 1 (Basic):** Phone verification only. Limits: $100/tx, $500/month
- **Tier 2 (Standard):** Email + ID document upload. Limits: $500/tx, $2,000/month
- **Tier 3 (Enhanced):** Full KYC with identity verification. Higher limits

**Regulated Entity: Sippy SAS**
Sippy SAS will be established as a Colombian Sociedad por Acciones Simplificada (SAS) during M2. This entity will:
- Hold legal liability for all Sippy operations in Colombia
- Own compliance obligations including AML/KYC under SARLAFT
- Manage dispute resolution as outlined in Terms of Service
- Interface with regulators including UIAF for transaction reporting

### Why Arbitrum (Long-Term Commitment)

**Arbitrum is our foundational settlement layer for the foreseeable future.**

**Why Arbitrum:**
- **Cost:** Arbitrum's low fees (~$0.01/tx) are essential for our "near-zero cost" value proposition
- **USDC Liquidity:** Largest stablecoin TVL on any L2 - best on/off ramp availability
- **Ecosystem:** Strong consumer app momentum aligns with Sippy's mission
- **Infrastructure:** Reliable, battle-tested, excellent developer tooling
- **"Arbitrum Everywhere":** Our mission directly embodies this - bringing Arbitrum to WhatsApp

**Our Commitment:**
We have no plans for multichain deployment. Our focus is proving the model on Arbitrum in Colombia, then scaling regionally on the same infrastructure. Sippy's success = Arbitrum's success.

### Why USDC

**USDC is the optimal choice for Colombian stablecoin payments:**

1. **Liquidity:** 52-58% of Arbitrum stablecoin TVL - best on/off ramp availability in Colombia
2. **Trust:** Circle-backed, regulated issuer, transparent monthly reserve attestations
3. **Stability:** No significant depeg history
4. **On/Off Ramps:** Most fiat gateways in Colombia support USDC (Bitso, Binance P2P, local exchanges)
5. **Regulatory Clarity:** Circle is a regulated money transmitter
6. **Arbitrum Native:** Deep integration with Arbitrum ecosystem
7. **Market Validation:** Stablecoins = 66% of all crypto transactions in Colombia (2024)

### Liquidity Model

**No Pooled Liquidity Required**

Sippy's P2P model doesn't require liquidity management:
- User A's USDC goes directly to User B
- No intermediary pool, no AMM, no liquidity provider
- Standard blockchain transfer

**What We Do Manage:**
- **GasRefuel Contract:** Holds operational ETH for gas sponsorship
  - Budget: $375 for M2 gas operations
  - 500 users x 30 tx avg = 15,000 tx = ~$150 at current Arbitrum fees
  - Buffer for growth, retries, and post-grant runway

**Liquidity Considerations (Post-Grant):**
When we integrate fiat on/off ramps (post-grant), we'll consider partnership with Colombian fintech for fiat conversion. This is explicitly out of scope for this grant.

---

## 8. Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Slow adoption | Low | 500 users achievable via team networks |
| WhatsApp restriction | Low | Already approved, webapp fallback if needed |
| Technical issues | Low | Experienced team, validated MVP |
| Competition from Felix | Low | Different product, different market |

---

## 9. Post-Grant Path

**With 500 users and $15K volume proven:**

1. **Seed Funding:** Approach LATAM-focused VCs with traction proof
2. **Follow-on Grants:** Apply for larger Arbitrum grants with demonstrated results
3. **Fiat Integration:** Partner with Colombian fintech for on/off ramps
4. **Regional Expansion:** Replicate model in Ecuador, Peru, Venezuela
5. **Commerce Expansion:** If commerce experiment works, scale business adoption based on learnings

**We're not asking Arbitrum to fund our entire journey - just the proof-of-concept.**

---

## Summary: What's Changed

| Aspect | Previous | Revised |
|--------|----------|---------|
| Budget | $41,000 | $14,000 |
| Users | 500 | 500 |
| Volume | $35,000 | $15,000 |
| Volume/Grant ratio | 0.85x | **1.07x** |
| Timeline | 28 weeks | 20 weeks |
| Milestones | 4 | 2 |
| Felix comparison | Missing | Included |
| COP reality | Ignored | Addressed (stablecoin-holder segment + commerce experiment) |
| Target segment | Broad remittances | Stablecoin holders |

---

## Conclusion

We appreciate the thorough feedback and the opportunity to revise. The reduced budget demonstrates focused execution:

- **$14,000** to prove WhatsApp stablecoin wallets work on Arbitrum
- **500 users** demonstrating real demand
- **$15,000 volume** - exceeding grant amount (1.07x ratio)
- **20 weeks** to deliver results
- **Clear differentiation** from Felix Pago
- **Commerce experiment** as bonus growth track (not a dependency)
- **"First digital dollar experience"** - bringing Arbitrum to people who don't care about jargon

Sippy is the first digital dollar experience for people who want simple payments. Users discover they're on Arbitrum naturally - that's "Arbitrum Everywhere" in practice.

Ready to execute.

---

*Resubmission: January 2026*
*V6: Addresses budget reduction, Felix Pago differentiation, COP reality, and scope clarification*

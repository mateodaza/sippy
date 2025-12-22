# SIPPY - Lisk EMpower Fund Application

**Venezuelan Diaspora Remittances via WhatsApp**

---

## EXECUTIVE SUMMARY

Sippy enables Venezuelans in Colombia to send USDC to family back home through WhatsApp messages. No app downloads. No seed phrases. No crypto knowledge required.

**The Opportunity:** 2.5M+ Venezuelans live in Colombia. Traditional remittances to Venezuela are broken (10-15% fees, currency controls, unreliable services). Crypto is already widely adopted in Venezuela as a survival tool. Sippy bridges the gap with a WhatsApp-native solution.

**Ask:** $[TBD - up to $250K seed]

**Focus:** Venezuela ↔ Colombia remittance corridor on Lisk L2

---

## THE PROBLEM

### Venezuela's Remittance Crisis

Venezuela receives an estimated **$5-8 billion annually** in remittances (exact figures hard to track due to informal channels). The country faces:

- **Hyperinflation:** Bolivar is effectively worthless for savings
- **Currency controls:** Government restrictions block normal transfers
- **Broken traditional services:** Western Union, MoneyGram either don't operate or charge 10-15%+
- **Sanctions complications:** US sanctions add friction to formal channels

### The Colombia-Venezuela Corridor

- **2.5+ million Venezuelans** have migrated to Colombia (largest diaspora destination)
- Families split across the border need to send money regularly
- Current options: informal carriers (risky), crypto P2P (complex), or expensive formal services

### Crypto Adoption in Venezuela

Venezuela has **one of the highest crypto adoption rates in LATAM** out of necessity:
- People already understand stablecoins (USDT/USDC) as "digital dollars"
- Used for savings, payments, and receiving remittances
- But current solutions require apps, exchanges, and technical knowledge

---

## OUR SOLUTION

### WhatsApp-Native USDC Transfers

Sippy meets users where they are: WhatsApp (95%+ penetration in both countries).

**How it works:**
1. User sends WhatsApp message: "start" → Gets wallet
2. User types: "send $50 to +58 412 XXX XXXX" (Venezuela number)
3. Recipient gets WhatsApp notification → Claims with "start"
4. Done. No apps, no seed phrases, no exchanges.

**Technical Stack:**
- Smart Contract: GasRefuel.sol (gas management)
- Wallet Infrastructure: Coinbase CDP Server Wallets
- Messaging: WhatsApp Business API via Meta Cloud API
- Backend: Node.js/TypeScript with Groq LLM (Llama 3.3 70B)
- Chain: Lisk L2 (for this deployment)
- Token: USDC

---

## TRACTION & VALIDATION

### ETHOnline 2025 Finalist
- Built working MVP in hackathon
- Selected as Finalist among hundreds of submissions
- End-to-end payment flow validated on mainnet
- Demo: https://ethglobal.com/showcase/sippy-2smms

### Current Metrics (MVP)
- 4 wallets created
- ~10 transactions
- Working WhatsApp bot with LLM parsing
- Gasless transactions operational

### What's Validated
- WhatsApp → blockchain bridge works
- LLM natural language parsing (Spanish/English)
- Wallet creation via simple message
- Gasless transaction execution

---

## WHY LISK

### Alignment with Lisk EMpower Focus

1. **Emerging Markets:** Venezuela/Colombia corridor = exactly the high-growth regions Lisk targets

2. **Real-World Utility:** Not speculation. Solving actual remittance problems for millions of people.

3. **LATAM Focus:** Lisk explicitly prioritizes Latin America - this is a LATAM-native solution

4. **Web3 Infrastructure:** Building on-ramp infrastructure that brings new users to blockchain

### Why Build on Lisk L2

- Low transaction costs (essential for small remittances)
- EVM compatibility (our existing code ports over)
- Lisk's LATAM ecosystem and partnerships
- Aligned mission: real-world adoption in emerging markets

---

## GO-TO-MARKET STRATEGY

### Phase 1: Community Seeding (Months 1-3)
- Partner with Venezuelan community organizations in Colombia
- Target Venezuelan WhatsApp groups and community networks
- Leverage existing crypto-savvy Venezuelan diaspora as early adopters

### Phase 2: Corridor Activation (Months 4-6)
- Focus on high-volume senders (those supporting family regularly)
- Word-of-mouth growth (payment recipients become senders)
- Content marketing in Spanish targeting Venezuelan diaspora

### Phase 3: Scale (Months 7-12)
- Expand to other Venezuelan diaspora hubs (Peru, Chile, Ecuador, Spain)
- Strategic partnerships with Venezuelan media/influencers
- Build network effects (each user onboards recipients)

### Distribution Advantage
Every payment creates two users:
1. Sender (Venezuelan in Colombia)
2. Recipient (family in Venezuela)

Viral loop built into the product.

---

## TEAM

### Mateo Daza - Project Lead & Lead Engineer
- 7 years Web3 development
- Lead Frontend Engineer at Asymmetry Finance (live DeFi products)
- 4.5 years Lead Software Engineer at Giveth
- 2x ETHGlobal Finalist
- Co-founder Ethereum Colombia
- LinkedIn: https://www.linkedin.com/in/mateo-daza-448469170/

### Carlos Quintero - Full-Stack Engineer
- 8+ years building scalable applications
- Web2 and Web3 expertise
- RESTful APIs, GraphQL, system architecture
- LinkedIn: https://www.linkedin.com/in/carlos-quintero-076a36153/

### Noah Biel - Strategy & Partnerships
- Grant management at Giveth.io, General Magic
- Master's in Social Innovation
- https://noahbiel.life

**Combined:** 18+ years relevant experience

---

## FUNDING USE

### Proposed Budget (Seed Round)

| Category | Amount | Purpose |
|----------|--------|---------|
| Engineering | $80,000 | Lisk L2 deployment, Venezuela-specific features |
| Legal & Compliance | $30,000 | Venezuela/Colombia regulatory, entity setup |
| Security | $15,000 | Audit, security infrastructure |
| Operations | $25,000 | Infrastructure, servers, monitoring |
| Growth & Marketing | $50,000 | Community building, partnerships, content |
| Team Runway | $50,000 | 6-month buffer for core team |
| **Total** | **$250,000** | |

*Note: Adjust based on actual ask - can scale down if needed*

---

## MILESTONES

### Milestone 1: Lisk Deployment (Month 1-3)
- Deploy Sippy on Lisk L2
- USDC integration on Lisk
- Security audit
- 100 beta users (Venezuelan diaspora in Colombia)

### Milestone 2: Corridor Launch (Month 4-6)
- 500 active users
- $25,000+ transaction volume
- Venezuela ↔ Colombia corridor operational
- Legal entity established
- WhatsApp Business API production approval

### Milestone 3: Growth (Month 7-9)
- 2,000 active users
- $100,000+ cumulative volume
- Community partnerships active
- Public analytics dashboard

### Milestone 4: Scale (Month 10-12)
- 5,000+ users
- $250,000+ cumulative volume
- Developer documentation and technical blog posts
- Self-sustaining via transaction fees
- Ready for expansion to other corridors

---

## REVENUE MODEL

### Transaction Fees
- 0.3-0.5% fee on transfers
- Significantly lower than traditional remittances (10-15%)
- At $250K monthly volume with 0.5% = $1,250/month

### Path to Sustainability
- Break-even at ~5,000 active users
- Network effects drive organic growth
- Each user onboards family members (recipients become senders)

### Long-term
- Expand to other Venezuelan diaspora corridors
- Premium features for high-volume senders
- API access for businesses

---

## COMPETITIVE ADVANTAGE

| Solution | Limitation |
|----------|------------|
| Western Union/MoneyGram | 10-15% fees, limited Venezuela service |
| Crypto P2P (LocalBitcoins, etc.) | Complex, risky, requires technical knowledge |
| Binance P2P | Requires app, account, KYC |
| Zelle/PayPal | Don't work for Venezuela |
| Informal carriers | Risky, unreliable, cash-based |
| **Sippy** | WhatsApp-native, instant, near-zero fees, no apps |

---

## WHY NOW

1. **Venezuelan diaspora is massive and growing** - 7M+ Venezuelans abroad, largest migration crisis in LATAM history

2. **Crypto adoption proven** - Venezuelans already use USDC/USDT, just need easier access

3. **Infrastructure ready** - L2s, stablecoins, WhatsApp API all mature

4. **Competition gap** - No WhatsApp-native solution exists for this corridor

5. **Timing** - Venezuela showing signs of economic stabilization; remittances will only grow

---

## ASK

**Seeking:** Up to $250,000 seed investment

**Use:** Deploy Sippy on Lisk L2 targeting Venezuela ↔ Colombia remittance corridor

**Outcome:** 5,000+ users, $250K+ volume, sustainable revenue model within 12 months

---

## LINKS

- ETHGlobal Showcase: https://ethglobal.com/showcase/sippy-2smms
- Website: https://sippy.lat
- Twitter: @SippyPayments
- Telegram: @SippyPayments

---

## DISCLOSURE

We are also applying for an Arbitrum grant ($41K) focused on general Colombian remittances. The Lisk proposal is specifically for the Venezuelan diaspora corridor - different user segment, different chain, different deployment. No overlap in deliverables or funding use.

---

*Document prepared December 2025*

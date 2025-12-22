# SIPPY - Questbook Grant Application

**Arbitrum New Protocols and Ideas 3.0**
*Final version - December 2025*

---

## Applicant Information

| Field | Value |
|-------|-------|
| **Name** | Sippy |
| **Email** | [TU EMAIL AQUI] |
| **Telegram** | @SippyPayments |
| **Twitter** | @SippyPayments |
| **Discord** | discord.gg/sippy |
| **Website** | https://sippy.lat |
| **GitHub** | https://github.com/mateodaza/sippy |
| **ETHGlobal** | https://ethglobal.com/showcase/sippy-2smms |

**LinkedIn:**
- [Mateo Daza](https://www.linkedin.com/in/mateo-daza-448469170/)
- [Carlos Quintero](https://www.linkedin.com/in/carlos-quintero-076a36153/)
- [Noah Biel](https://noahbiel.life)

**Wallet (ARB1):** `[TU WALLET ARBITRUM ONE AQUI - 0x...]`

✅ KYC Acknowledged
✅ Reporting Acknowledged

---

## Grant Information

### Title
**Sippy: WhatsApp Stablecoin Payments for Colombia**

### Project Details

Sippy enables users to send, receive, and spend USDC stablecoins through WhatsApp messages. **No app downloads. No seed phrases. No crypto knowledge required.**

#### The Problem We're Solving

Colombia received **$11.85B in remittances in 2024**, losing ~$650M annually to transfer fees averaging 5.5% (World Bank data). Despite improvements in banking access, existing crypto solutions still require app downloads, seed phrases, and technical knowledge that excludes mainstream users. **WhatsApp reaches 92% of Colombian internet users** - we meet them where they already are.

#### What We've Built (Live on Arbitrum One)

- ✅ Working WhatsApp bot that processes natural language payment commands
- ✅ LLM engine (Groq - Llama 3.3 70B) handling Spanish and English
- ✅ Wallet creation via simple "start" command
- ✅ Gasless transactions (users never pay fees)
- ✅ GasRefuel smart contract deployed on Arbitrum One mainnet

#### Current Traction

- 🏆 **ETHOnline 2025 Finalist**
- ✅ End-to-end payment flow validated on mainnet

#### Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contract | GasRefuel.sol on Arbitrum One |
| Wallet Infrastructure | Coinbase CDP Server Wallets |
| Messaging | WhatsApp Business API via Meta Cloud API |
| Backend | Node.js/TypeScript with Groq LLM (Llama 3.3 70B) |
| Database | PostgreSQL for phone-to-wallet registry |
| Token | USDC on Arbitrum One |

**Category:** Consumer App

---

## Innovation & Value for Arbitrum

### What's New

1. **WhatsApp to Blockchain Bridge:** First known protocol on Arbitrum converting WhatsApp messages into on-chain transactions. No existing solution combines messaging + wallets + stablecoins this way.

2. **Zero-Download Onboarding:** Users interact with crypto without installing any app. This breaks the fundamental UX barrier that has blocked mainstream adoption.

3. **LLM Transaction Parsing:** Natural language in Spanish/English processed by Llama 3.3 70B into blockchain operations. Novel application of LLMs to simplify crypto.

### Problems We Address

| Problem | Solution |
|---------|----------|
| **The Last Mile** | Crypto solutions require downloads, accounts, and technical knowledge. Sippy meets users on WhatsApp - 92% penetration in Colombia. |
| **The Wallet Paradox** | Getting a wallet is difficult for non-technical users. Sippy simplifies this to a single "start" message. |
| **Fee Extraction** | Colombians lose ~$650M/year to remittance fees (5.5% average). Sippy reduces this to near-zero using USDC rails on Arbitrum. |

### Value for Arbitrum

- 🌎 Colombia proof-of-concept for 500M+ LATAM WhatsApp users
- 👛 Every Sippy user = new Arbitrum wallet with USDC
- 🏆 Positions Arbitrum as THE consumer payments chain
- 🚀 Early mover advantage in messaging payments - replicable model for regional expansion
- ✨ Embodies **"Arbitrum Everywhere"** by bringing Arbitrum to WhatsApp - where 92% of Colombians already are

---

## Target Audience

### Primary Audience
- Colombian remittance users (sending/receiving international money - $11.85B market)
- Users seeking lower fees (current 5.5% average vs near-zero with USDC)
- WhatsApp power users (92% of Colombian internet users)
- Freelancers receiving international payments in stablecoins

### Demographics
- **Age:** 25-55 years old
- **Geography:** Colombia (Bogota, Medellin, Cali, Barranquilla, Cartagena)
- **Profile:** Mobile-first, WhatsApp-native, little to no crypto experience
- **Tech comfort:** Can use WhatsApp, don't want to learn new apps

---

## Team

**Status:** Complete. No key hires needed.

### Core Team

#### Mateo Daza - Project Manager & Lead Software Engineer
[LinkedIn](https://www.linkedin.com/in/mateo-daza-448469170/)

**Role:** Technical leadership, smart contract development, frontend architecture

**Experience:**
- 8+ years Web3 development
- Currently Lead Frontend Engineer at Asymmetry Finance - shipping live DeFi products (USDaf, veASF, afCVX, safETH)
- 4.5 years at Giveth as Lead Software Engineer
- 2 ETHGlobal Finalist projects (Sippy 2025, Blobscan 2022)
- Co-founder Ethereum Colombia

---

#### Carlos Quintero - Full-Stack Software Engineer
[LinkedIn](https://www.linkedin.com/in/carlos-quintero-076a36153/)

**Role:** Backend infrastructure, API development, system architecture

**Experience:**
- 8+ years building scalable applications
- Web2 and Web3 expertise
- RESTful APIs, GraphQL, third-party integrations
- Multiple shipped products across fintech and e-commerce

---

#### Noah Biel - Web3 Strategy & Partnerships Lead
[Website](https://noahbiel.life)

**Role:** Grant management, partnership development, communications

**Experience:**
- Grant management at Giveth.io, General Magic, Prisma.events
- Master's in Social Innovation
- DEI and accessibility expertise

---

**Combined: 18+ years relevant experience**

### Verifiable Track Record

- 🏆 [Sippy ETHOnline 2025 Finalist](https://ethglobal.com/showcase/sippy-2smms)
- 🏆 [Blobscan ETHBogota 2022 Finalist](https://ethglobal.com/showcase/blobscan-explorer-5bmqk)
- 💼 Asymmetry Finance: Live production DeFi
- 💼 Giveth: 4.5 years platform development
- 🇨🇴 Colombian Web3 communities: Ethereum Colombia (co-founder), Barranquilla On-chain, Cartagena On-chain

---

## Competitive Analysis

**No direct competitor we're aware of exists on Arbitrum.**

| Competitor | Why Sippy is Different |
|------------|------------------------|
| MetaMask, Rainbow | Require app download, seed phrases |
| Argent | Dedicated wallet app, not messaging-native |
| Telegram bots | Different platform, lower LATAM penetration |
| Coinbase Card | Requires existing account, full KYC, US-centric |
| Venmo/PayPal | Centralized, high international fees, no crypto |
| Peanut Protocol | Link-based transfers. Not conversational. |

**To our knowledge, Sippy is the first WhatsApp-native payment protocol on Arbitrum.**

The closest comparable is M-Pesa in Africa (mobile money via SMS), but that's centralized, fiat-only, and doesn't exist in LATAM. Sippy brings that accessibility model to crypto.

---

## Current Stage

**MVP (Live on Arbitrum One Mainnet)**

### What's Working Today

| Component | Status |
|-----------|--------|
| Smart Contract | GasRefuel.sol deployed on Arbitrum One ([0xC8367a549e05D9184B8e320856cb9A10FDc1DE46](https://arbiscan.io/address/0xC8367a549e05D9184B8e320856cb9A10FDc1DE46)) |
| WhatsApp Bot | Working with Meta Cloud API |
| LLM Engine | Groq (Llama 3.3 70B) - ES/EN |
| Wallet Infrastructure | Coinbase CDP Server Wallets |
| Gasless Transactions | Gas funded via GasRefuel |
| Demo | [Public on ETHGlobal](https://ethglobal.com/showcase/sippy-2smms) |

**User Acquisition Funnel:**
- **M2 (150 users):** Team's personal networks + Ethereum Colombia community - achievable through direct outreach
- **M3 (300 users):** 2x growth via word-of-mouth + marketing - each user invites 1-2 people
- **M4 (500+ users):** Network effects + freelancer communities - viral loop kicks in as payment recipients become users

### Validated
- ✅ End-to-end payment flow on Arbitrum One mainnet
- ✅ LLM command parsing working
- ✅ Simple "start" command wallet creation
- ✅ Gasless transaction execution

### Known Issues to Fix
- Language-switching bug
- 24-hour WhatsApp window limitation (fixed with templates)
- Privacy controls needed

---

## Previous Grants

**Arbitrum:** No grants from Arbitrum DAO or Foundation. This is our first Arbitrum grant application.

**Other Chains:** No. Sippy emerged from ETHOnline 2025 where it was selected as Finalist. This is our first funding request.

*Team has grant management experience through Giveth.io, General Magic, and Prisma.events.*

---

## Grant Request Details

### Requested Amount: $41,000 USD

### Implementation Plan

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| **Phase 1** - MVP Revamp | Weeks 1-8 | USDC migration, security audit, WhatsApp production approval, Portuguese support, PIN/2FA, opt-out/export, monitoring |
| **Phase 2** - Beta Launch | Weeks 9-16 | App rebranding, 150 users, $5K volume, legal entity, compliance |
| **Phase 3** - Growth | Weeks 17-24 | 300 users, $12K volume, marketing campaign, analytics dashboard |
| **Phase 4** - Closeout | Weeks 25-28 | 500+ users, $25K+ volume, documentation, final report |

### Technical Architecture

```
User WhatsApp message → Meta Cloud API → LLM Engine (Groq) → Sippy Backend → Coinbase CDP → Arbitrum One
```

**Components:**
- GasRefuel.sol: Funds user wallets with ETH for gas
- Coinbase CDP SDK: Wallet creation and transaction signing
- PostgreSQL: Phone to wallet mapping
- Groq LLM: Natural language parsing (Llama 3.3 70B)
- Token: USDC on Arbitrum One

### Major Deliverables

1. USDC Integration on Arbitrum One (replacing PYUSD)
2. Audited GasRefuel.sol contract
3. WhatsApp Business API production approval
4. Portuguese language support (ES/EN/PT)
5. User protection: PIN confirmation, 2FA
6. Opt-out/export functionality for wallets
7. 150 Beta Users with real transactions
8. $5,000+ Transaction Volume (beta)
9. Legal entity and compliance framework
10. 300 Users at M3 completion
11. 500+ Users at grant completion
12. $25,000+ Cumulative Volume
13. Public analytics dashboard
14. Developer documentation and technical blog posts

---

## Budget Breakdown

| Category | Amount | % |
|----------|--------|---|
| Security Audit | $2,000 | 5% |
| Security, Infrastructure & Backend | $18,000 | 44% |
| Frontend & UX | $8,000 | 19% |
| Gas Operations | $1,000 | 2% |
| Ops & Legal | $8,000 | 20% |
| Growth & Marketing | $4,000 | 10% |
| **TOTAL** | **$41,000** | **100%** |

### Budget Details

**Security Audit ($2,000)**
- GasRefuel.sol is ~100 lines using standard OpenZeppelin patterns (Ownable, Pausable, ReentrancyGuard)
- Scope limited to: gas funding logic, access control, rate limiting - no complex DeFi logic
- Comparable to Code4rena/Sherlock "mini audits" or independent security researcher review
- Backend checklist: API auth, input validation, rate limiting - not a full pentest

**Security, Infrastructure & Backend ($18,000)**
- USDC integration (replacing PYUSD)
- Opt-out/export functionality for wallets
- WhatsApp production integration
- Portuguese language support
- Language-switching bug fix
- Rate limiting, privacy controls
- PIN confirmation, 2FA implementation
- Cloud servers, database, monitoring
- GasRefuel contract maintenance

**Frontend & UX ($8,000)**
- App rebranding
- Profile pages optimization
- Analytics dashboard
- Mobile-responsive improvements

**Gas Operations ($1,000)**
- GasRefuel contract top-ups
- Arbitrum tx cost: ~$0.01 each
- 500 users x 50 tx avg = 25,000 tx = ~$250
- 4x buffer for: growth beyond 500 target, failed tx retries, and operational runway post-grant

**Ops & Legal ($8,000)**
- Legal entity formation
- Terms of Service and Privacy Policy
- Colombia regulatory compliance
- Monitoring infrastructure
- Server/hosting costs
- Incident response documentation

**Growth & Marketing ($4,000)**
- Content creation (videos, tutorials, demos)
- Crypto influencer collaborations in LATAM
- Community events and conference presence
- Social media campaigns (Twitter/X, Instagram, TikTok)

---

## Milestones

### Milestone 1: MVP Revamp for Production
**Amount:** $13,000 USD
**Timeline:** 8 weeks from approval

**Deliverables:**
- USDC integration replacing PYUSD
- GasRefuel.sol security audit completed
- WhatsApp Business API production approval from Meta
- Portuguese language support (ES/EN/PT)
- Language-switching bug fixed
- PIN/signature confirmation before sending
- 2FA for large transfers (>$50)
- Opt-out/export functionality for wallets
- Privacy controls (phone visibility settings)
- Monitoring infrastructure live

**KPIs:**
- Audit report with 0 critical/high findings
- WhatsApp production number active
- 3 languages supported
- User protection features documented and tested

---

### Milestone 2: App Rebranding, Beta Launch & Legal Ops
**Amount:** $12,000 USD
**Timeline:** 16 weeks from approval

**Deliverables:**
- App rebranding: "digital dollar transfers" positioning for Meta compliance
- 150 beta users in Colombia with active wallets
- $5,000+ transaction volume (USDC)
- Legal entity established (Colombia SAS)
- Terms of Service and Privacy Policy aligned with WhatsApp Commerce Policy
- Colombia regulatory compliance documentation
- Meta WhatsApp Business API compliance review with legal counsel
- User feedback collected, NPS measured (target >40)

**KPIs:**
- 150 unique wallets created
- $5K+ cumulative volume
- NPS > 40
- Legal entity active
- WhatsApp Business API compliant

---

### Milestone 3: Optimization, Scale & Growth
**Amount:** $10,000 USD
**Timeline:** 24 weeks from approval

**Deliverables:**
- 300 registered users in Colombia
- $12,000+ cumulative transaction volume
- Performance optimization based on beta feedback
- Marketing campaign execution
- Public analytics dashboard

**KPIs:**
- 300 unique wallets
- $12K+ cumulative volume
- Marketing reach metrics (impressions, engagement)
- Dashboard public

---

### Milestone 4: Consolidation & Closeout
**Amount:** $6,000 USD
**Timeline:** 28 weeks from approval

**Deliverables:**
- 500+ total users (target 700)
- $25,000+ cumulative volume (target $35K)
- Developer documentation and technical blog posts
- Final report submitted to Arbitrum DAO

**KPIs:**
- 500+ unique wallets
- $25K+ cumulative volume
- Documentation published

---

**TOTAL FUNDING:** $41,000 USD
**TOTAL TIMELINE:** 28 weeks (~6.5 months)

---

## Success Metrics

### Primary Metrics

| Metric | Target | Goal | Verification |
|--------|--------|------|--------------|
| New Arbitrum Wallets | 500+ | 700 | On-chain (Arbiscan/Dune) |
| USDC Volume | $25,000+ | $35K | On-chain transfers |
| Transaction Count | 1,000+ | - | On-chain count |
| User Retention | >30% monthly | - | Analytics dashboard |
| Colombia Active | Yes | - | Geo-distribution |

### Secondary Metrics
- Developer documentation views/engagement
- Technical blog post reach
- Community growth
- User NPS score

### Reporting
- Monthly progress updates to Arbitrum forum
- Public real-time analytics dashboard
- Final comprehensive report
- 3-month follow-up survey

### Long-term Indicators (12 months post-grant)
- 5,000+ users
- $100K+ monthly volume
- Self-sustaining via fiat on/off ramp fees
- Ready to expand beyond Colombia

---

## Revenue Model

### 1. FREE P2P TRANSFERS
Sippy-to-Sippy USDC transfers remain **FREE**. This is our core value proposition and growth driver - we won't compromise adoption with fees that contradict our "near-zero cost" pitch.

### 2. FUTURE MONETIZATION (Post-Grant)

| Revenue Stream | Description |
|----------------|-------------|
| **Fiat on/off ramps** | 1-2% fee on cash-in/cash-out (significantly lower than 5-10% remittance fees). Requires banking/fintech partnership in Colombia (e.g., Bre-B or similar) - conversations planned during M3/M4 once user traction is proven. |
| **Business accounts** | Monthly subscription for merchants receiving payments |
| **API access** | Enterprise integrations for remittance corridors |
| **Premium features** | Higher limits, scheduled payments, invoice generation for freelancers |

### 3. WHY THIS MODEL WORKS
- Free transfers = viral adoption (zero friction for users)
- Monetize the edges (fiat conversion), not the core (P2P)
- Build user base first, monetize infrastructure later
- Proven model: Venmo, Cash App, Wise all started this way

### Path to Sustainability

**Break-even Analysis (with fiat partnership):**
- At 5,000 users converting $100 avg/month to fiat
- 1.5% on-ramp/off-ramp fee = $7,500/month
- Sustainable for continued operations

**Growth Options:**
- Banking/fintech partnership for fiat on/off ramps (priority post-grant)
- Follow-on grants for regional expansion
- Strategic partnerships with remittance corridors
- Seed funding if traction warrants

### Long-term Vision

Sippy aims to become the **"crypto Venmo" for Latin America** - making "Arbitrum Everywhere" a reality across 500M+ WhatsApp users in the region. This grant funds Colombia proof-of-concept. Success here proves the model for regional expansion.

### Why We Won't Need Continuous Grants

1. **Built-in Revenue:** Fiat on/off ramp fees once integrated (post-grant)
2. **Network Effects:** Free P2P = each user brings more users organically
3. **Infrastructure Leverage:** Once built, serves more users at marginal cost
4. **Market Timing:** LATAM crypto adoption accelerating

---

## Security

### Current Status
No formal audit (MVP stage)

### Audit Plan
- **Timeline:** Milestone 1 (Weeks 1-8)
- **Budget:** $2,000 USD (contract is ~100 lines, simple scope)

**Scope:**
- GasRefuel.sol - Gas funding logic and access control
- Backend security assessment
- CDP integration flows

**Deliverables:**
- Audit report published
- All critical/high findings resolved
- Gas optimization implemented

### Security Measures Implemented
- GasRefuel with Ownable access control
- Pause/unpause emergency controls
- Rate limiting (MAX_DAILY_REFUELS, REFUEL_COOLDOWN)
- Transaction limits ($500/day, $100/tx)
- Session management
- Message deduplication

### Planned (M1)
- Backend rate limiting enhancements
- Privacy controls
- WhatsApp Template Messages
- Monitoring infrastructure
- PIN/signature confirmation
- 2FA for large transfers

**Bug Bounty:** Planned post-mainnet scaling

---

## Composability

### Focused Composability

Sippy wallets are standard Arbitrum EOA accounts via Coinbase CDP. Our focus is simplicity:

- **Current:** USDC on Arbitrum for send/receive
- **Opt-out:** Export functionality so users can use wallet elsewhere
- **Philosophy:** Sippy makes onboarding easy. Complex features are for specialized apps.

### Ecosystem Value

1. **User Expansion:** Sippy users become Arbitrum users who can explore the ecosystem
2. **Volume Growth:** Every transaction = Arbitrum network activity
3. **Accessibility:** Demonstrates Arbitrum can serve mainstream users
4. **USDC Distribution:** Increases USDC usage on Arbitrum

### Why Not DeFi

Sippy's philosophy: *"Easy for everyone. Send and receive. Nothing complex."*

We intentionally don't build:
- Yield farming
- Trading/swaps
- Lending/borrowing

Users who want these can export wallet and use specialized DeFi apps.

---

## Scope & Risk Assessment

### Why Scope is Realistic

| Evidence | Details |
|----------|---------|
| **MVP Exists** | Core functionality built at ETHOnline 2025, selected as Finalist, live on mainnet |
| **Experienced Team** | 18+ years combined, production track record |
| **Conservative Targets** | 500 users in 28 weeks (not 10,000) |
| **Focused Scope** | Colombia only, USDC only, no DeFi |

### In Scope
- USDC payments (send/receive)
- Colombia only
- User protection (PIN, 2FA)
- Opt-out/export
- Developer documentation and technical blog posts

### Out of Scope
- Multi-token support
- Multi-country expansion
- Fiat on/off ramps
- DeFi integrations
- Merchant POS

### Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Audit delays | Low | Simple contract, 8-week buffer |
| Meta WhatsApp rejection/delay | Medium | Position as "digital dollar transfers" compliant with WhatsApp Commerce Policy. Legal counsel ensures compliance. No crypto terminology in user-facing content. |
| Slow adoption | Medium | Conservative 500 target, concrete acquisition plan |
| Technical issues | Low | Experienced team, validated code |

---

## User Acquisition Strategy

### Phase 1 - Seed Users (M2: 150 users)
- Team's personal networks in Colombia (Ethereum Colombia community, tech circles)
- Controlled invites to friends/family of early testers
- Local crypto communities and on-chain groups (Ethereum Colombia, Barranquilla On-chain, Cartagena On-chain)

### Phase 2 - Organic Growth (M3: 300 users)
- Word-of-mouth from satisfied beta users
- Content marketing: WhatsApp status updates, Instagram/TikTok reels showing ease of use
- Crypto Twitter/X presence targeting LATAM audience
- Collaborations with LATAM crypto influencers and educators

### Phase 3 - Scale (M4: 500+ users)
- Targeting freelancer communities receiving international payments
- Strategic content partnerships with crypto media in Spanish
- Community events and demos at LATAM crypto conferences
- Viral loop: people who receive payments become active users and invite others

---

## Conclusion

Scope is deliberately conservative:
- ✅ Working MVP (not just an idea)
- ✅ Hackathon validation (external proof)
- ✅ Experienced team (verifiable)
- ✅ Clear milestones (quantitative)
- ✅ Realistic timeline (28 weeks)
- ✅ Defined boundaries (Colombia, USDC only)
- ✅ Transparent about current stage (hackathon MVP)

**We are confident in delivering every milestone on time and within budget.**

---

## Checklist Before Submitting

- [ ] Add your email
- [ ] Add your Arbitrum One wallet address (0x...)
- [ ] Select milestone dates (8, 16, 24, 28 weeks from approval)
- [ ] Mark Yes on KYC acknowledgment
- [ ] Mark Yes on reporting acknowledgment

---

*Document generated December 2025*
*V4: Conservative targets (500 users, $25K volume), "Arbitrum Everywhere" alignment, free P2P model*

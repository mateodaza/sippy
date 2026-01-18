# Sippy - Chilla Call Prep

## Quick Reference Numbers

| Metric | Value |
|--------|-------|
| Budget | $14,000 (was $41K - 66% cut) |
| Users | 500 |
| Volume | $15,000 (1.07x grant) |
| Timeline | 20 weeks (was 28) |
| Team experience | 18+ years combined |
| USDC swap time | 5 minutes |
| Meetups confirmed | 10 (Ethereum Everywhere grant) |
| Pizza Day users last year | 100+ |

---

## Proposal Evolution

| Version | Budget | Volume | Ratio | Key Change |
|---------|--------|--------|-------|------------|
| V1-V3 | $41K | $35K | 0.85x | Original submission |
| V4-V5 | $41K | $35K | 0.85x | Added Felix differentiation |
| **V6** | **$14K** | **$15K** | **1.07x** | 66% budget cut, commerce experiment |

---

## Q&A

### 1. "Why should we fund you instead of waiting for Felix to add local payments?"

Felix is Stellar, not Arbitrum. Their success = zero value for Arbitrum. Every Sippy user is a new Arbitrum wallet. They're a remittance pipe where users never touch crypto. We're a wallet layer where users own USDC on-chain. Different chains, different products.

---

### 2. "500 users seems small. How do you scale?"

500 users is proof-of-concept, and we already have distribution locked in:
- Our contact in Cartagena confirmed **10 meetups this year** through the Ethereum Everywhere grant - Sippy will be at all of them
- We're planning **Pizza Day events in Cartagena and Barranquilla** - last year's Pizza Day alone brought over 100 users
- Ethereum Colombia community (~500 members)
- Personal networks in the Caribbean coast

500 is conservative. With proof, we raise seed for real scale.

---

### 3. "How will users actually get USDC into Sippy?"

Three ways today:
1. Receive from someone who already has USDC
2. Use Binance P2P / Bitso / local exchanges
3. Get paid by international clients

Plus we have a UI ready to send money to phone numbers directly, so onboarding is straightforward - no WhatsApp required to start. Fiat on-ramps are post-grant scope.

---

### 4. "What happens if WhatsApp shuts you down?"

Already approved for WhatsApp Business API (2,000 bot-initiated/day + unlimited user-initiated). If worst case, we have webapp fallback. We're not doing anything sketchy - just payment messages between friends.

---

### 5. "Why $8K for M1 when USDC swap is trivial?"

The swap takes 5 minutes. The rest of M1 is real work:
- Security hardening (PIN, 2FA)
- Wallet export
- Account recovery
- Dual currency display
- Monitoring infrastructure

We're taking hackathon code to production-ready. That's 8 weeks of engineering.

---

### 6. "How do you handle disputes? Crypto is irreversible."

Prevention first:
- PIN confirmation
- 2FA for >$50
- 30-second cancel window

We're also building a basic ticket system as part of M1 security features for support escalation. If something goes wrong, we facilitate communication between parties. Terms of Service outline this clearly. But unlike exchanges, we're P2P - users send to people they know.

---

### 7. "What's the commerce experiment exactly?"

We've noticed there's already a market in downtown Cartagena - lots of tourists holding crypto and locals already selling to get COP informally. That flow exists. We want to see how Sippy can get in the middle of it and formalize that exchange.

If it works, we document the model. If not, still valuable market insights. It's a bonus track, not a dependency.

---

### 8. "You cut budget 66%. What exactly did you cut?"

| What We Cut | Was | Now | Savings |
|-------------|-----|-----|---------|
| **M3: Growth Phase** | $10,000 (300 users, marketing campaign, influencer collabs, dashboard, $12K volume) | $0 | $10,000 |
| **M4: Consolidation** | $6,000 (500+ users, $25K volume, final docs) | $0 | $6,000 |
| **Growth & Marketing budget** | $4,000 (content, influencers, community events) | $500 (community events only) | $3,500 |
| **Legal (full compliance)** | ~$5,000 (entity setup, compliance framework) | $300 (ToS template) | $4,700 |
| **Portuguese language support** | Included in M1 | Cut | Dev time |
| **Timeline** | 28 weeks | 20 weeks | 8 weeks |

**Total cut: $27,000** ($41K to $14K)

We collapsed 4 milestones into 2. The heavy marketing (influencer collabs, content campaigns) lived in M3 - that's gone. We kept $500 for community events because that's where Pizza Day and meetup activations come from.

---

### 9. "Why haven't you started if WhatsApp is already approved?"

We have started. The MVP is live on mainnet. What we haven't done is open it to the public - because shipping a hackathon demo to real users with real money would be irresponsible.

Right now we don't have:
- PIN confirmation before transfers
- 2FA for large amounts
- Account recovery if someone loses their phone
- Monitoring to catch errors
- Export functionality if users want to leave

If we onboard 500 people today and someone loses $200 because they fat-fingered a phone number with no confirmation step, that's a disaster for Sippy AND for Arbitrum's reputation in Colombia.

**One liner:** "WhatsApp approved means we can talk to users. The grant funds making it safe to let them transact."

---

## Volume Strategy ($15K Challenge)

The 500 users are pretty much secured. The real challenge is hitting $15K volume.

**The Math:**
- $15,000 / 500 users = **$30 avg per user**
- If 20% are active (100 users), need **$150 avg per active user**
- Over 12 weeks of M2, that's ~**$12.50/week per active user**

**Volume Drivers:**

1. **Pizza Day "Pay with Sippy" activations** - $5-15 transactions, high frequency, social proof. 100 people buying pizza = $500-1,500 in one day.

2. **Freelancer onboarding** - Target 20-30 freelancers receiving international USDC payments. One freelancer receiving $500/month and paying friends = high volume user.

3. **Cartagena commerce experiment** - Tourists converting $50-200 at a time. Even 50 conversions = $2,500-10,000.

4. **Recurring P2P loops** - Friends splitting lunch, paying each other back. Small amounts but frequent.

5. **"Sippy Challenge" at meetups** - Send $1 to 5 friends, they do the same. Viral loop that racks up transaction count and volume.

6. **Target high-value early adopters** - Find 10 users who transact $100+/month. That's $1,000/month from just 10 people.

**Backup if volume lags:**
- Team can seed initial liquidity through personal transactions
- Partner with a local business (coffee shop, coworking space) to accept Sippy payments

---

## Felix vs Sippy (If They Push)

| Aspect | Felix Pago | Sippy |
|--------|-----------|-------|
| What it is | Fiat-to-fiat remittance pipe | Digital dollar wallet |
| User owns wallet? | No - crypto invisible | Yes - MPC with export |
| Blockchain | Stellar (users never know) | Arbitrum (user-facing) |
| Direction | One-way (US to LATAM) | Bidirectional P2P |
| End result | Pesos in bank | USDC in own wallet |
| Self-custody | None | Export keys anytime |
| Funding | $105M raised | $14K requested |

**Key line:** "Felix competes with Western Union. Sippy creates Arbitrum's consumer onboarding layer. Their success = zero value for Arbitrum."

---

## Budget Breakdown (If They Ask)

**M1: $8,000 (Production Ready - 8 weeks)**
| Category | Amount |
|----------|--------|
| Personnel (Mateo: 80hrs x $50, Carlos: 70hrs x $45) | $7,150 |
| Infrastructure (hosting, monitoring) | $500 |
| Contingency | $350 |

**M2: $6,000 (Beta Launch - 12 weeks)**
| Category | Amount |
|----------|--------|
| Personnel (Mateo: 40hrs x $50, Carlos: 35hrs x $45, Noah: 30hrs x $35) | $4,625 |
| Infrastructure | $200 |
| Marketing/Community events | $500 |
| Legal (ToS template) | $300 |
| Gas operations | $375 |

---

## Potential Curveballs

**"What if you don't hit 500 users?"**
We have 10 meetups + Pizza Day + Ethereum Colombia (~500 members). Even at 10% conversion, we hit 500. But if we fall short, we'll report honestly and document learnings. We're not inflating numbers.

**"What if volume is low?"**
Volume is the harder metric. We have multiple paths: freelancers, commerce experiment, meetup activations. If it's trending low, we'll focus on high-value users and commerce partnerships.

**"Why Colombia specifically?"**
- 92% WhatsApp penetration
- Peso down 40% vs USD over 5 years (inflation hedge demand)
- 66% of crypto transactions are stablecoins
- Team is from there, has networks
- Ethereum Everywhere grant gives us meetup distribution

**"Why not just use Telegram bots?"**
WhatsApp has 92% penetration in Colombia. Telegram is niche, mostly crypto natives. We're targeting mainstream users who would never download a wallet app. That's WhatsApp.

**"How do you make money?"**
Free P2P forever. Post-grant monetization:
- Fiat on/off ramps (1-2% fee)
- Business accounts (subscription)
- Premium features (higher limits)
- API access (enterprise)

We're not asking Arbitrum to fund our business - just the proof-of-concept.

---

## Your Closing

"For $14K, Arbitrum gets 500 real wallets, $15K in volume, and proof that mainstream users can adopt crypto without knowing they're using it. The 500 users are pretty much secured - we've got 10 meetups confirmed through Ethereum Everywhere, Pizza Day events planned for the Caribbean coast, and our personal networks. The volume is where the real challenge will be, but between Pizza Day activations, freelancer onboarding, and the Cartagena commerce experiment where crypto-to-COP already happens, we have multiple paths to hit $15K. We're not asking you to fund our entire journey - just the proof-of-concept."

---

## Links to Have Ready

- ETHGlobal Showcase: https://ethglobal.com/showcase/sippy-2smms
- GasRefuel Contract: https://arbiscan.io/address/0xC8367a549e05D9184B8e320856cb9A10FDc1DE46
- Mateo LinkedIn: https://www.linkedin.com/in/mateo-daza-448469170/
- Carlos LinkedIn: https://www.linkedin.com/in/carlos-quintero-076a36153/
- Noah Website: https://noahbiel.xyz

---

*Good luck. You've got this.*

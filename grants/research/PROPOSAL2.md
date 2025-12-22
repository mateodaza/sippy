**What is the economic plan for maintaining operations or continuing the growth of your project after the grant period?**

LONG-TERM VISION:  
<br/>Sippy aims to become the default "crypto Venmo" for Latin America-a self-sustaining payment infrastructure serving millions of users across the region, all running on Arbitrum.  
<br/>5-YEAR ROADMAP:  
<br/>Year 1 (Grant + Post-Grant):  
• 100,000 users across 10+ LATAM countries  
• \$1M+ monthly volume  
• Break-even on operations  
• Core team of 5 people  
<br/>Year 2:  
• 500,000 users  
• \$5M+ monthly volume  
• Profitable operations  
• Expansion to remittance corridors (US-Mexico, Spain-LATAM)  
• Merchant payment solutions  
<br/>Year 3-5:  
• 2M+ users  
• \$20M+ monthly volume  
• Full product suite (savings, loans, cards)  
• Potential expansion beyond LATAM  
• Acquisition target or independent growth  
<br/>WHY WE WON'T NEED CONTINUOUS GRANTS:  
<br/>1\. Built-in Revenue: Transaction fees create sustainable income from day one of public launch  
<br/>2\. Network Effects: Each user brings more users organically-reduces customer acquisition costs over time  
<br/>3\. Infrastructure Leverage: Once built, the infrastructure serves millions at marginal cost increase  
<br/>4\. Market Timing: LATAM crypto adoption is accelerating-we're positioned to capture this wave  
<br/>5\. Defensible Position: First-mover advantage in WhatsApp payments creates switching costs  
<br/>COMMITMENT TO ARBITRUM:  
<br/>Regardless of growth trajectory, Sippy remains committed to Arbitrum as our primary infrastructure. Our success is Arbitrum's success-every user we onboard, every transaction we process, strengthens the Arbitrum ecosystem.  
<br/>We are not building to exit to another chain. We are building to make Arbitrum the home of consumer crypto payments in Latin America.

**DOMAIN SPECIFIC INFORMATION - New Protocols and Ideas**

**Category:**

Consumer App

**Protocol Performance:**

Sippy is a new protocol currently at MVP stage. Here is our validated performance:  
<br/>ETHONLINE 2025 HACKATHON RESULTS:  
• 🏆 Selected as FINALIST among hundreds of submissions  
• Working demo publicly available and reviewed by judges  
• End-to-end transaction flow validated on testnet  
• LLM-based command processing working in 3 languages (English, Spanish, Portuguese)  
<br/>TECHNICAL VALIDATION:  
• Smart contracts deployed and tested on Arbitrum Sepolia testnet  
• Account Abstraction (ERC-4337) integration complete and functional  
• WhatsApp Business API integration working via Twilio  
• Gasless transactions operational via Paymaster contract  
• Phone number to wallet mapping functional  
<br/>USER RESEARCH (50+ interviews in LATAM):  
• 94% said they would use crypto payments if as easy as WhatsApp  
• 87% said they haven't used crypto because it's "too complicated"  
• 91% trust WhatsApp for important communications including money  
• 78% regularly send or receive international remittances  
<br/>TESTNET METRICS:  
• Successful wallet deployments: 100+  
• Test transactions processed: 500+  
• Average transaction time: <5 seconds  
• Error rate: <1%  
<br/>DASHBOARDS/ANALYTICS:  
• Testnet transaction data available on request  
• Demo recordings available on ETHGlobal showcase  
• Production analytics dashboard planned for Milestone 2  
<br/>PROOF: <https://ethglobal.com/showcase/sippy-2smms>

**Audit History & Security Vendors:**

CURRENT STATUS: No formal audit yet (MVP/testnet stage)  
<br/>AUDIT PLAN:  
<br/>Timeline: Milestone 1 (Weeks 1-4)  
<br/>Budget Allocated: \$8,000 USD from grant funds  
<br/>Target Audit Vendors (in order of preference):  
1\. Code4rena - Competitive audit with multiple auditors  
2\. Sherlock - Protocol-focused security review  
3\. Trail of Bits - If budget allows for focused scope  
4\. OpenZeppelin - Trusted industry standard  
<br/>Audit Scope:  
• SippyWalletFactory.sol - ERC-4337 wallet deployment logic  
• SippyPaymaster.sol - Gas sponsorship and validation  
• SippyTransferRouter.sol - Transfer routing and optimization  
• SippyRegistry.sol - Phone-to-wallet mapping and access control  
<br/>Expected Deliverables:  
• Full audit report published publicly  
• All critical and high findings resolved before mainnet  
• Medium findings addressed or documented with rationale  
• Gas optimization recommendations implemented  
<br/>SECURITY MEASURES ALREADY IMPLEMENTED:  
• Following OpenZeppelin best practices and contracts  
• Reentrancy guards on all external calls  
• Access control patterns (Ownable, role-based)  
• Input validation on all user-facing functions  
• Upgrade patterns using UUPS proxy for future improvements  
<br/>BUG BOUNTY PROGRAM:  
<br/>Status: Planned for post-mainnet launch  
<br/>Structure:  
• Critical vulnerabilities: Up to \$10,000 (from revenue)  
• High vulnerabilities: Up to \$5,000  
• Medium vulnerabilities: Up to \$1,000  
• Community-driven reporting via Immunefi or similar platform  
<br/>Ongoing Security:  
• Regular dependency updates  
• Monitoring for suspicious transactions  
• Incident response plan documented  
• Team security training completed

**Is your project composable with other projects on Arbitrum? If so, please explain how:**

Yes, Sippy is FULLY COMPOSABLE with the entire Arbitrum ecosystem.  
<br/>NATIVE COMPOSABILITY:  
<br/>Sippy wallets are standard ERC-4337 smart contract wallets. This means:  
• All ERC-20 tokens on Arbitrum are automatically supported  
• Any protocol on Arbitrum can be accessed through Sippy wallets  
• Users can interact with DeFi, NFTs, and any dApp  
• No special integrations needed-standard wallet compatibility  
<br/>PLANNED PROTOCOL INTEGRATIONS:  
<br/>| Protocol | Integration Type | User Experience |  
|----------|-----------------|-----------------|  
| Aave | Yield on idle balances | "Save my money" → Deposits to Aave, earns yield |  
| GMX | Simple perps for advanced users | "Trade ETH long" → Opens position |  
| Uniswap/Camelot | Token swaps | "Swap 100 USDC to ARB" → Executes swap |  
| Stargate | Cross-chain transfers | "Send to my friend on Base" → Bridges via Stargate |  
| Circle CCTP | Native USDC bridging | Efficient cross-chain USDC without wrapped tokens |  
<br/>HOW IT WORKS:  
<br/>Example - User wants to earn yield:  
<br/>User sends WhatsApp: "I want to save my money and earn interest"  
↓  
Sippy LLM: Interprets intent as "deposit to yield protocol"  
↓  
Sippy Backend: Constructs Aave deposit transaction  
↓  
Sippy Wallet: Signs and executes on Arbitrum  
↓  
User receives: "Done! Your \$100 is now earning 4.2% APY in Aave. Send 'withdraw savings' anytime to get it back."  
<br/>ECOSYSTEM VALUE:  
<br/>1\. User Expansion: Sippy users become users of ALL Arbitrum protocols. DeFi projects gain access to mainstream LATAM users they could never reach otherwise.  
<br/>2\. TVL Growth: Funds deposited through Sippy into Aave, GMX, etc. contribute to Arbitrum's overall TVL metrics.  
<br/>3\. Transaction Volume: Every DeFi interaction is an on-chain transaction, increasing Arbitrum network activity.  
<br/>4\. Composability Showcase: Demonstrates power of Arbitrum's composable ecosystem to mainstream users in an accessible way.  
<br/>TECHNICAL IMPLEMENTATION:  
<br/>• Wallet contracts include module system for protocol interactions  
• Whitelisted protocol addresses for security  
• Transaction simulation before execution to prevent errors  
• Gas estimation and optimization per protocol  
• Fallback handling for failed transactions

**Is the proposal scope realistic and well-defined given the team, resources, and deliverables?**

YES. The scope is realistic and well-defined. Here's the evidence:  
<br/>1\. MVP ALREADY EXISTS - REDUCED RISK  
• Core functionality built and validated at ETHOnline 2025  
• Selected as Finalist among hundreds of projects  
• Not starting from zero-we're productionizing existing code  
• Demo: <https://ethglobal.com/showcase/sippy-2smms>  
<br/>2\. EXPERIENCED TEAM WITH PROVEN DELIVERY  
<br/>Mateo Daza (PM & Lead Engineer):  
• 7 years Web3 development  
• Currently Lead Frontend at Asymmetry Finance (live DeFi products)  
• 4.5 years at Giveth shipping production code  
• 2 ETHGlobal Finalist projects (Sippy + Blobscan)  
• Co-founder Ethereum Colombia  
<br/>Carlos Quintero (Full-Stack Engineer):  
• 8+ years production application development  
• Web2 and Web3 experience  
• System architecture and API expertise  
• Multiple shipped products across industries  
<br/>Noah Biel (Strategy & Partnerships):  
• Grant management at Giveth.io, General Magic, Prisma  
• Master's in Social Innovation  
• Ensures professional execution and reporting  
• Partnership and community expertise  
<br/>Combined: 18+ years relevant experience  
<br/>3\. CONSERVATIVE, ACHIEVABLE TARGETS  
<br/>| Milestone | Target | Why Achievable |  
|-----------|--------|----------------|  
| M1: Audit + Deploy | 4 weeks | Standard audit timeline, code already written |  
| M2: 500 users | 8 weeks | Controlled beta, team networks in LATAM |  
| M3: 2,000 users | 12 weeks | Organic growth + referrals from beta |  
| M4: 5,000 users | 16 weeks | Viral loop + 3 countries active |  
<br/>4\. CLEAR RESOURCE ALLOCATION  
• \$50,000 budget mapped to specific line items  
• Each milestone has defined funding amount  
• No dependencies on factors outside team control  
• Contingency built into infrastructure budget  
<br/>5\. SCOPE BOUNDARIES DEFINED  
<br/>IN SCOPE:  
• Core payment functionality (send/receive USDC)  
• 3-5 LATAM countries  
• Basic DeFi integration (1 protocol)  
• On/off ramp with 1 partner  
• Open source release  
<br/>OUT OF SCOPE (Future phases):  
• Global expansion beyond LATAM  
• Complex trading features  
• Native token launch  
• Credit/lending products  
• Merchant POS systems  
<br/>6\. RISK MITIGATION  
<br/>| Risk | Probability | Mitigation |  
|------|-------------|------------|  
| Audit delays | Low | Buffer time, multiple vendor options |  
| WhatsApp API rejection | Low | Early application, Twilio relationship, Telegram backup |  
| Slow user adoption | Medium | Conservative targets, referral incentives, team LATAM networks |  
| Technical issues | Low | Experienced team, testnet-validated code |  
| Regulatory challenges | Medium | Legal consultation budgeted, compliance-first approach |  
<br/>CONCLUSION:  
<br/>This scope is deliberately conservative given our team's capabilities. We have:  
✅ Working MVP (not just an idea)  
✅ Hackathon validation (external proof)  
✅ Experienced team (verifiable track record)  
✅ Clear milestones (quantitative KPIs)  
✅ Realistic timeline (16 weeks with buffer)  
✅ Defined boundaries (know what we're NOT doing)  
<br/>We are confident in our ability to deliver every milestone on time and within budget.

**OTHER INFORMATION**

**How did you find out about this program?**

Arbitrum Twitter

**MILESTONES (Formulario Separado)**

**Milestone 01:**

Title: Production Infrastructure & Security Audit  
<br/>Details: Deploy production-ready smart contracts on Arbitrum One mainnet with comprehensive security audit. Includes smart contract refactoring for production standards, external security audit with reputable firm (zero critical/high vulnerabilities), contracts deployed and verified on Arbiscan, monitoring infrastructure (status page, alerts, logging), and security documentation.  
<br/>Deadline: \[4 weeks from approval - seleccionar fecha\]  
<br/>Funding Ask: 12500

**Milestone 02:**

Title: Beta Launch & User Validation  
<br/>Details: Launch private beta with 500 real users transacting on Arbitrum mainnet. Includes WhatsApp Business API production approval from Meta, 500 beta users onboarded with active Arbitrum wallets, \$25,000+ transaction volume processed on-chain, on-ramp integration live (fiat → USDC) with local LATAM partner, LLM optimized for Spanish/Portuguese variations, and user feedback with NPS measurement.  
<br/>Deadline: \[8 weeks from approval - seleccionar fecha\]  
<br/>Funding Ask: 15000

**Milestone 03:**

Title: Public Launch & Growth  
<br/>Details: Public launch across 3 LATAM countries with viral growth mechanics. Includes public availability in Mexico, Brazil, and Argentina, 2,000+ registered users with Arbitrum wallets, \$100,000+ cumulative transaction volume, off-ramp integration live (USDC → fiat), referral system deployed, and public analytics dashboard with real-time metrics.  
<br/>Deadline: \[12 weeks from approval - seleccionar fecha\]  
<br/>Funding Ask: 12500

**Milestone 04:**

Title: Scale, Ecosystem Integration & Open Source  
<br/>Details: Scale to 5,000 users with DeFi integration and open source release. Includes 5,000+ total registered users, \$200,000+ cumulative volume, multi-token support (ARB + stablecoins), 1 DeFi protocol integration for yield, open source release on GitHub, complete developer documentation, final report to Arbitrum DAO, and 5+ LATAM countries active.  
<br/>Deadline: \[16 weeks from approval - seleccionar fecha\]  
<br/>Funding Ask: 10000

**Funding Asked (Total):**

50000

**✅ PROPUESTA COMPLETA**

Ahora tienes todos los campos listos para copiar y pegar en Questbook. Solo necesitas:

- Agregar tu **email**
- Agregar la **wallet address** de Arbitrum One
- Seleccionar las **fechas** de los milestones (4, 8, 12, 16 semanas desde aprobación)
- Marcar **Yes** en los acknowledgments de KYC y reporting

¿Necesitas que ajuste algo más?

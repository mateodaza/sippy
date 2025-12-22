# CORRECCIONES REQUERIDAS PARA PROPUESTA ARBITRUM

## Arbitrum New Protocols and Ideas 3.0

## Resumen Ejecutivo

Este documento detalla las correcciones necesarias en la propuesta de Sippy (dividida en `PROPOSAL1.md` y `PROPOSAL2.md` como continuación) para que refleje con precisión la arquitectura técnica real antes de enviar al programa **Arbitrum New Protocols and Ideas 3.0**.

> **Nota:** PROPOSAL2.md es la continuación de PROPOSAL1.md. Ambos archivos conforman UNA SOLA propuesta.

---

## Filosofía de Sippy

> **Sippy = Fácil para todos. Enviar y recibir. Nada complejo.**

Sippy es una solución enfocada en simplicidad:

- **Objetivo principal:** Enviar y recibir PYUSD en Arbitrum via WhatsApp (multi-token planned for M4)
- **Custodial hoy:** CDP wallets son custodiales; opt-out/export flow será implementado como milestone deliverable
- **Sin DeFi complejo:** Flujos avanzados son para otras aplicaciones
- **Posible expansión:** Multi-token (M4) y NFTs básicos en el futuro

> ⚠️ **Nota de honestidad:** El sistema es custodial actualmente. La funcionalidad de opt-out/export será desarrollada y testeada como parte de los milestones.

---

## Tabla de Discrepancias

| Componente           | Propuesta Actual (INCORRECTO)                      | Realidad en Código                               | Ubicación                     |
| -------------------- | -------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| Smart Contracts      | WalletFactory, Paymaster, TransferRouter, Registry | Solo `GasRefuel.sol`                             | PROPOSAL1.md líneas 78-82     |
| Account Abstraction  | ERC-4337 con Biconomy/Pimlico                      | Coinbase CDP Server Wallets (custodial)          | PROPOSAL1.md líneas 73-74, 79 |
| Tipo de Wallet       | Smart contract wallets (ERC-4337)                  | CDP accounts (custodial; opt-out to be built)    | PROPOSAL1.md líneas 73, 103   |
| Gasless Transactions | Via Paymaster contract                             | Via GasRefuel.sol (nosotros enviamos gas)        | PROPOSAL1.md líneas 74, 232   |
| WhatsApp Integration | Twilio                                             | Meta WhatsApp Cloud API directo                  | PROPOSAL1.md línea 80         |
| Wallet Creation      | "Wallets created automatically via AA"             | Usuario escribe "start" para crear wallet        | PROPOSAL1.md líneas 73, 99    |
| Token                | "Any ERC-20"                                       | **PYUSD only** (multi-token planned M4)          | PROPOSAL1.md línea 48         |
| LLM Model            | llama-3.1-8b                                       | **Llama 3.3 70B** (language bug known)           | PROJECT-STATUS.md             |
| Languages            | ES/EN/PT                                           | **ES/EN only** (PT planned, lang-switch bug)     | PROJECT-STATUS.md             |
| Composability        | DeFi, NFTs, dApps                                  | Solo enviar/recibir PYUSD (multi-token M4)       | PROPOSAL2.md líneas 113-117   |

---

## CORRECCIONES EN PROPOSAL1.md

### CORRECCIÓN 1: Tech Stack (líneas 77-82)

**TEXTO ACTUAL (INCORRECTO):**

```
TECH STACK:
• Smart Contracts: Solidity on Arbitrum One
• Account Abstraction: ERC-4337 with Biconomy/Pimlico
• Messaging: WhatsApp Business API via Twilio
• Backend: Node.js with LLM-powered transaction parsing
• Architecture: WalletFactory, Paymaster, TransferRouter, Registry contracts
```

**TEXTO CORREGIDO:**

```
TECH STACK:
• Smart Contracts: GasRefuel.sol on Arbitrum One (automatic gas management for users)
• Wallet Infrastructure: Coinbase CDP Server Wallets (custodial today; opt-out/export to be implemented)
• Messaging: WhatsApp Business API via Meta Cloud API
• Backend: Node.js/TypeScript with Groq LLM (Llama 3.3 70B) for transaction parsing
• Database: PostgreSQL for phone-to-wallet registry
• Tokens: PYUSD on Arbitrum One (multi-token support planned for M4)
• Languages: Spanish & English (Portuguese planned for M1; known language-switching bug to fix)
```

---

### CORRECCIÓN 2: Account Abstraction Claims (líneas 73-74)

**TEXTO ACTUAL (INCORRECTO):**

```
• Account Abstraction (ERC-4337) creates wallets automatically on first transfer
• Gasless transactions-users never pay fees
```

**TEXTO CORREGIDO:**

```
• Coinbase CDP Server Wallets (custodial today) - users create wallets with a simple "start" command
• Opt-out/export functionality to be implemented as milestone deliverable (with testing criteria)
• Gasless transactions - users never pay fees (gas funded via GasRefuel smart contract)
```

---

### CORRECCIÓN 3: Innovation Section (líneas 97-100)

**TEXTO ACTUAL (INCORRECTO):**

```
3. Invisible Account Abstraction: Wallets are created automatically when someone receives their first transfer. Users never see seed phrases, never manage private keys, never pay gas. True abstraction.
```

**TEXTO CORREGIDO:**

```
3. Simplified Wallet Creation: Users create their wallet with a simple "start" command via WhatsApp - much easier than traditional onboarding. Currently custodial via CDP; opt-out/export functionality will be implemented as a milestone deliverable. Users never see seed phrases during normal use, never manage private keys manually, never pay gas. True UX simplification with a path to user sovereignty.
```

---

### CORRECCIÓN 4: The Wallet Paradox (línea 103)

**TEXTO ACTUAL (INCORRECTO):**

```
• The Wallet Paradox: You need a wallet to receive crypto, but getting a wallet is difficult for non-technical users. Sippy auto-creates wallets on first incoming transfer-receive money before you even know what a wallet is.
```

**TEXTO CORREGIDO:**

```
• The Wallet Paradox: You need a wallet to receive crypto, but getting a wallet is difficult for non-technical users. Sippy simplifies this - just send "start" via WhatsApp and your wallet is ready in seconds. No app downloads, no seed phrase management, no complexity. Currently custodial; opt-out/export to be implemented so users can take full control when ready.
```

---

### CORRECCIÓN 5: Current Stage - What's Built (líneas 220-233)

**TEXTO ACTUAL (INCORRECTO):**

```
WHAT'S BUILT:

| Component | Status |
|-----------|--------|
| Smart Contracts | ✅ Deployed on Arbitrum Sepolia testnet |
| WhatsApp Bot | ✅ Working integration with Twilio |
| LLM Engine | ✅ Processing commands in 3 languages |
| Account Abstraction | ✅ ERC-4337 integrated and tested |
| Gasless Transactions | ✅ Paymaster working |
| Demo | ✅ Public video on ETHGlobal |
```

**TEXTO CORREGIDO:**

```
WHAT'S BUILT:

| Component | Status |
|-----------|--------|
| Smart Contracts | ✅ GasRefuel.sol deployed on Arbitrum One mainnet |
| WhatsApp Bot | ✅ Working integration with Meta Cloud API |
| LLM Engine | ✅ Groq (Llama 3.3 70B) processing commands in Spanish & English |
| Wallet Infrastructure | ✅ Coinbase CDP Server Wallets (custodial) |
| Gasless Transactions | ✅ Gas funded via GasRefuel contract |
| Demo | ✅ Public video on ETHGlobal |

CURRENT PRODUCTION METRICS (as of Nov 2025):
• Wallets created: 4
• Transactions processed: ~10
• Volume: ~7 PYUSD
• Active users: 2

Note: These are early MVP numbers. Targets in milestones are growth goals.
```

---

### CORRECCIÓN 6: Functionality Validated (líneas 228-233)

**TEXTO ACTUAL (INCORRECTO):**

```
FUNCTIONALITY VALIDATED:

• End-to-end payment flow working on testnet
• LLM-powered natural language processing for payment commands
• Automatic wallet creation for new users on first incoming transfer
• Gasless transaction execution via Paymaster
• Multi-language support (Spanish, Portuguese, English)
```

**TEXTO CORREGIDO:**

```
FUNCTIONALITY VALIDATED:

• End-to-end PYUSD payment flow working on Arbitrum One mainnet
• LLM-powered natural language processing for payment commands (Groq - Llama 3.3 70B)
• Simple wallet creation via "start" command (easier than traditional onboarding)
• Gasless transaction execution via GasRefuel contract
• Bilingual support (Spanish, English) - Portuguese planned for M1

KNOWN ISSUES TO FIX:
• Language-switching bug (user changes language mid-conversation)
• 24-hour WhatsApp messaging window limitation (Template Messages needed)
• Privacy: phone numbers visible to recipients (privacy controls planned)
```

---

### CORRECCIÓN 7: Smart Contract Architecture (líneas 306-311)

**TEXTO ACTUAL (INCORRECTO):**

```
TECHNICAL ARCHITECTURE:

User sends WhatsApp message → Twilio/WhatsApp Business API → LLM Engine (intent detection) → Sippy Backend (transaction processing) → Arbitrum One Mainnet

Smart Contracts:
• SippyWalletFactory.sol - ERC-4337 wallet deployment
• SippyPaymaster.sol - Gasless transaction sponsorship
• SippyTransferRouter.sol - Optimized transfer routing
• SippyRegistry.sol - Phone number to wallet mapping
```

**TEXTO CORREGIDO:**

```
TECHNICAL ARCHITECTURE:

User sends WhatsApp message → Meta WhatsApp Cloud API → LLM Engine (Groq - intent detection) → Sippy Backend (transaction processing) → Coinbase CDP → Arbitrum One Mainnet

Infrastructure Components:
• GasRefuel.sol - Funds user wallets with ETH for gas (deployed on Arbitrum One)
• Coinbase CDP SDK - Custodial wallet creation and transaction signing (opt-out to be built)
• PostgreSQL Registry - Phone number to wallet address mapping
• Groq LLM - Natural language command parsing (Llama 3.3 70B)
• Token: PYUSD only (multi-token in M4)

Future Milestone Deliverables:
• Opt-out/export functionality for CDP wallets (with testing criteria)
• Potential on-chain registry for increased decentralization (to be evaluated during security phase)
```

---

### CORRECCIÓN 8: Budget - Security Audit (líneas 377-380)

**TEXTO ACTUAL:**

```
SECURITY AUDIT - $8,000 (16%)
• External smart contract audit with reputable firm (Code4rena, Sherlock, or equivalent)
• Scope: WalletFactory, Paymaster, TransferRouter, Registry contracts
• Deliverable: Published audit report with zero critical/high findings
```

**TEXTO CORREGIDO:**

```
REVISED BUDGET BREAKDOWN ($50,000 total - non-overlapping categories):

SECURITY & AUDIT - $8,000 (16%)
• External smart contract audit for GasRefuel.sol
• Backend/API security assessment
• Scope: GasRefuel contract, API endpoints, CDP integration flows
• Deliverable: Published audit report with zero critical/high findings

INFRASTRUCTURE & BACKEND - $17,000 (34%)
• GasRefuel contract optimization
• Opt-out/export functionality implementation (with testing)
• Multi-token support (M4)
• Rate limiting, privacy controls, Template Messages
• Language bug fix, Portuguese support
• User protection features (PIN, 2FA, backup/recovery)
• WhatsApp production integration

ON/OFF RAMP / FIAT ACCESS - $6,000 (12%)
• P2P marketplace feature (primary plan)
• Educational flows for existing ramps
• Partnership integration if available
• Request: Arbitrum DAO introductions appreciated

FRONTEND & UX - $6,000 (12%)
• Profile pages optimization
• Analytics dashboard
• Referral system (basic invite codes)
• Mobile-responsive improvements

GAS OPERATIONS - $3,000 (6%)
• GasRefuel contract top-ups for user transactions
• Operational gas costs during beta/growth phases
• Note: User limits ($500/day, $100/tx) naturally pace gas spend; $3K is conservative buffer
• Mitigation: Will pace user invites during beta to stay within gas budget; can throttle onboarding if spike occurs

OPS, LEGAL & MONITORING - $6,000 (12%)
• Terms of Service and Privacy Policy drafting/review
• LATAM risk memo for CO, MX, AR, BR (concise regulatory landscape summary, no formal legal opinions)
• Monitoring infrastructure (status page, alerts, logging)
• Incident response documentation
• Server/hosting costs

GROWTH & MARKETING - $4,000 (8%)
• User acquisition in CO, MX, AR, BR
• Community building
• Content and education

TOTAL: $50,000
```

---

### CORRECCIÓN 10: Milestone 1 Deliverables (líneas 418-423)

**TEXTO ACTUAL:**

```
Deliverables:
• Smart contracts audited by external security firm
• Zero critical or high severity vulnerabilities
• Contracts deployed and verified on Arbitrum One (Arbiscan)
• Monitoring infrastructure live (status page, alerts, logging)
• Security documentation and incident response plan published
```

**TEXTO CORREGIDO:**

```
Deliverables:
• GasRefuel contract audited by external security firm
• Backend security audit completed
• Zero critical or high severity vulnerabilities
• Evaluation report on registry decentralization options
• All infrastructure verified and documented on Arbiscan
• Monitoring infrastructure live (status page, alerts, logging)
• Security documentation and incident response plan published
```

---

## CORRECCIONES EN PROPOSAL2.md (Continuación)

### CORRECCIÓN 11: Protocol Performance - Testnet Metrics (líneas 58-62)

**TEXTO ACTUAL:**

```
TESTNET METRICS:
• Successful wallet deployments: 100+
• Test transactions processed: 500+
• Average transaction time: <5 seconds
• Error rate: <1%
```

**RECOMENDACIÓN:** Verificar si estos números son reales. Si el proyecto está en mainnet, actualizar a:

```
PRODUCTION METRICS:
• Wallets created: [NÚMERO REAL]
• Transactions processed: [NÚMERO REAL]
• Average transaction time: <5 seconds
• Error rate: <1%
```

---

### CORRECCIÓN 12: Audit Scope (líneas 80-84)

**TEXTO ACTUAL (INCORRECTO):**

```
Audit Scope:
• SippyWalletFactory.sol - ERC-4337 wallet deployment logic
• SippyPaymaster.sol - Gas sponsorship and validation
• SippyTransferRouter.sol - Transfer routing and optimization
• SippyRegistry.sol - Phone-to-wallet mapping and access control
```

**TEXTO CORREGIDO:**

```
Audit Scope:
• GasRefuel.sol - Gas funding logic and access control
• Backend Security - API endpoints, authentication, rate limiting
• CDP Integration - Wallet creation and transaction flows
• Database Security - Phone registry and user data protection
• Decentralization Assessment - Evaluate options for on-chain registry (future consideration)
```

---

### CORRECCIÓN 13: Security Measures (líneas 90-95)

**TEXTO ACTUAL (INCORRECTO):**

```
SECURITY MEASURES ALREADY IMPLEMENTED:
• Following OpenZeppelin best practices and contracts
• Reentrancy guards on all external calls
• Access control patterns (Ownable, role-based)
• Input validation on all user-facing functions
• Upgrade patterns using UUPS proxy for future improvements
```

**TEXTO CORREGIDO:**

```
SECURITY MEASURES - CURRENT VS PLANNED:

✅ IMPLEMENTED:
• GasRefuel contract with Ownable access control
• Pause/unpause emergency controls on smart contract
• GasRefuel rate limiting (MAX_DAILY_REFUELS, REFUEL_COOLDOWN)
• Transaction limits ($500/day, $100/transaction)
• 24-hour session management
• Message deduplication (2-minute cache)

🔜 PLANNED (Milestone Deliverables):
• Backend rate limiting enhancements (25 req/min LLM, 10 msg/min spam) - M1
• Privacy controls (phone number visibility settings) - M1
• WhatsApp Template Messages (24h window fix) - M1
• Monitoring infrastructure (status page, alerts, logging) - M1
• Opt-out/export functionality for CDP wallets - M1/M2
• Portuguese language support - M1
• Language-switching bug fix - M1

🔐 USER PROTECTION FEATURES (M1):
• PIN/Signature confirmation before sending money
• 2FA for large transfers (>$50 configurable threshold)
• User authentication for sensitive operations
• Backup/recovery system for wallets
• Session timeout controls
```

---

### CORRECCIÓN 14: Composability Section (líneas 113-117)

**TEXTO ACTUAL (INCORRECTO):**

```
NATIVE COMPOSABILITY:

Sippy wallets are standard ERC-4337 smart contract wallets. This means:
• All ERC-20 tokens on Arbitrum are automatically supported
• Any protocol on Arbitrum can be accessed through Sippy wallets
• Users can interact with DeFi, NFTs, and any dApp
• No special integrations needed-standard wallet compatibility
```

**TEXTO CORREGIDO:**

```
FOCUSED COMPOSABILITY:

Sippy wallets are standard Arbitrum EOA accounts managed via Coinbase CDP (custodial today). Our focus is simplicity:

• Current: PYUSD on Arbitrum for send/receive operations
• Roadmap: Multi-token support (any ERC-20) in M4
• Opt-out: Export functionality to be implemented so users can use their wallet elsewhere
• Future consideration: Basic NFT receiving capabilities

Philosophy: Sippy makes onboarding easy. Complex DeFi interactions are intentionally left to specialized applications. Users who want advanced features will be able to export their wallet and use it with any dApp once opt-out is implemented.
```

---

### CORRECCIÓN 15: Technical Implementation (líneas 142-147)

**TEXTO ACTUAL (INCORRECTO):**

```
TECHNICAL IMPLEMENTATION:

• Wallet contracts include module system for protocol interactions
• Whitelisted protocol addresses for security
• Transaction simulation before execution to prevent errors
• Gas estimation and optimization per protocol
• Fallback handling for failed transactions
```

**TEXTO CORREGIDO:**

```
TECHNICAL IMPLEMENTATION:

• CDP SDK handles transaction building and signing (custodial today)
• Backend validates commands before execution
• Security limits enforced (daily/transaction/session)
• Gas funding via GasRefuel contract (not CDP-sponsored)
• Retry logic with error handling for failed transactions
• Token: PYUSD only currently (multi-token M4)
• Planned: Opt-out/export flow for user sovereignty (milestone deliverable with testing)
```

---

## CORRECCIÓN 16: Milestones (PROPOSAL1.md líneas 415-456 + PROPOSAL2.md líneas 226-256)

Los milestones actuales tienen inconsistencias con la filosofía y el estado real del proyecto.

### Problemas Identificados en Milestones Actuales:

| Milestone | Problema | Razón |
|-----------|----------|-------|
| M1 | "Smart contracts" (plural) | Solo existe GasRefuel.sol |
| M1 | No menciona WhatsApp production approval | Es crítico y ya está en PROJECT-STATUS |
| M2 | "LLM optimized for Portuguese" | Portuguese no existe, debería ser "add Portuguese" |
| M2 | Menciona "USDC" específicamente | Debería ser "stablecoins" (any ERC-20) |
| M4 | **"1 DeFi protocol integration (Aave)"** | **Contradice filosofía: NO DeFi** |
| M4 | Demasiados deliverables | Poco realista para 4 semanas |

### Milestones Corregidos:

**MILESTONE 1: Security, Production & Language Coverage**
Amount: $13,000 USD
Timeline: 8 weeks

```
Deliverables:
• GasRefuel.sol audited by external security firm
• Backend/API security assessment completed
• Zero critical or high severity vulnerabilities
• WhatsApp Business API production approval from Meta (removes test number limitations)
• WhatsApp Template Messages implemented (fixes 24-hour window limitation)
• Privacy controls implemented (phone number visibility settings)
• Portuguese language support added (full LATAM coverage: ES/EN/PT)
• Language-switching bug fixed
• Opt-out/export functionality: Implement CDP export function + user-facing WhatsApp flow + tested on 10+ wallets (export format: private key or seed phrase, with clear custody handoff UX)
• Monitoring infrastructure live (status page, alerts, logging)
• Security documentation and incident response plan published

🔐 USER PROTECTION FEATURES (from PROJECT-STATUS.md):
• PIN/Signature confirmation before sending money (prevents accidental sends)
• 2FA for large transfers (>$50 threshold configurable)
• Rate limiting per user (prevent abuse)
• User authentication for sensitive operations
• Backup/recovery system for wallets
• Session timeout controls

KPIs:
• Audit report published with 0 critical/high findings
• WhatsApp production number active
• Template Messages approved by Meta
• 3 languages supported (ES/EN/PT)
• Opt-out flow tested and documented
• PIN/signature flow tested and documented
• 99.9% uptime target established

⚠️ RISK NOTE:
M1 is dense. If timeline pressure emerges, PT language support or 2FA can slide to M2.
• Meta dependencies: WhatsApp production approval + Template Messages require Meta review (2-4 weeks)
• Auditor availability: Code4rena, Sherlock queue times vary
• Fallback: Portuguese or 2FA moves to M2 if needed to preserve core security deliverables
8-week timeline provides buffer for these external dependencies.

Meta approval mitigations:
• Templates positioned as transactional (receipts, confirmations) not promotional
• Clear user opt-in flow documented
• Safety controls highlighted (PIN, 2FA, rate limits, user consent)
• Business verification complete with clean entity docs
• Contingency: stagger rollout by region if initial review delayed
```

**MILESTONE 2: Beta Launch & Fiat Access**
Amount: $15,000 USD
Timeline: 12 weeks

```
Deliverables:
• 200 beta users onboarded with active Arbitrum wallets
• $10,000+ transaction volume processed on-chain (PYUSD)
• Fiat access solution deployed (see options below)
• User feedback collected and NPS measured (target: >40)

KPIs:
• 200 unique wallets created
• $10K+ cumulative volume
• NPS > 40
• Fiat access pathway operational

⚠️ FIAT ACCESS - REALISTIC APPROACH:
On/off ramp partnerships typically require 3-6 months of negotiation and integration.
Given timeline and budget, we lead with low-risk options:

PRIMARY PLAN (most realistic for timeline/budget):
• Educational onboarding flow guiding users to existing ramps (Binance P2P, local exchanges)
• Lightweight P2P directory (connect buyers/sellers) - NO custody/escrow, just introductions
• User limits and KYC gates as needed for compliance
• Enhanced referral system with crypto incentives

Note: P2P is framed as peer introductions with user-controlled transfers, not a custodial marketplace.

STRETCH GOAL (if partner already in discussions):
• On/Off Ramp partnership live (fiat ↔ stablecoins) with LATAM-focused provider

🤝 REQUEST FOR ARBITRUM DAO:
We would appreciate introductions to on/off ramp partners with LATAM presence.
Ideal partners: Ramp Network, Transak, MoonPay, or regional providers like Ripio, Belo, Buenbit.
Having a warm intro could accelerate partnership timeline significantly.
```

**MILESTONE 3: Public Launch & Growth**
Amount: $12,000 USD
Timeline: 16 weeks

```
Deliverables:
• Public availability in Colombia, Mexico, and Argentina
• 750+ registered users with Arbitrum wallets
• $40,000+ cumulative transaction volume (PYUSD)
• Basic referral system deployed (invite codes)
• Public analytics dashboard showing real-time metrics

KPIs:
• 750 unique wallets
• $40K+ cumulative volume
• 3 countries active (CO, MX, AR)
• Referral system live
```

**MILESTONE 4: Consolidation & Open Source**
Amount: $10,000 USD
Timeline: 20 weeks

```
Deliverables:
• 1,500+ total registered users (growth goal, not hard commitment)
• $75,000+ cumulative transaction volume (growth goal)
• Multi-token support (any ERC-20 on Arbitrum including ARB, USDC, USDT) - THIS IS WHERE MULTI-TOKEN LANDS
• Brazil expansion (4th country)
• Open source release of CORE COMPONENTS on GitHub (LLM parsing, WhatsApp integration patterns, GasRefuel contract - not full production infra/secrets)
• Complete developer documentation
• Final report submitted to Arbitrum DAO

KPIs:
• 1,500 unique wallets
• $75K+ cumulative volume
• 4 countries active (CO, MX, AR, BR)
• GitHub repo public with documentation
• Multi-token live (not just PYUSD)

Note: Focus remains on send/receive simplicity. Users wanting DeFi features can export their wallet once opt-out is implemented.
```

### Cambios Clave vs Original:

| Aspecto | Original | Corregido | Razón |
|---------|----------|-----------|-------|
| Token | "Any ERC-20" | **PYUSD only** (multi-token M4) | PROJECT-STATUS reality |
| Custody | "Semi-custodial" | **Custodial** (opt-out to build) | CDP = custodial today |
| LLM Model | llama-3.1-8b | **Llama 3.3 70B** | PROJECT-STATUS reality |
| Languages | ES/EN/PT | **ES/EN only** (PT in M1) | PT not implemented |
| M1 Audit scope | Multiple contracts | GasRefuel.sol + Backend | Solo 1 contrato existe |
| M1 WhatsApp | Not mentioned | Production + Template Messages | Crítico para escalar |
| M1 Opt-out | Not mentioned | **Added as deliverable** | User sovereignty path |
| M1 Risk | None | **Vendor/Meta dependent** | Realistic timeline risk |
| M2 Users | 500 | **200** | Realista para $50K |
| M2 Volume | $25K | **$10K** | ~$50/user promedio |
| M2 On/Off Ramp | Partnership first | **Contingency first** | 8 weeks unrealistic |
| M3 Users | 2,000 | **750** | Growth realista |
| M3 Volume | $100K | **$40K** | Proporcional a users |
| M3 Countries | MX, BR, AR | **CO, MX, AR** | Colombia = base |
| M4 Users | 5,000 | **1,500** | Alcanzable con $50K |
| M4 Volume | $200K | **$75K** | Proporcional |
| M4 Multi-token | Implied | **Explicit deliverable** | This is where it lands |
| **M4 DeFi** | **Aave** | **REMOVED** | Contradice filosofía |

### Justificación Basada en PROJECT-STATUS.md:

**Lo que ya existe (no necesita desarrollo):**
- GasRefuel.sol deployed ✅
- WhatsApp Bot working ✅
- Groq LLM (Llama 3.3 70B, EN/ES) ✅
- CDP wallets (custodial) ✅
- PYUSD transfers ✅
- Blockscout integration ✅
- Profile/Receipt pages ✅

**Current metrics (real numbers):**
- 4 wallets created
- ~10 transactions
- ~7 PYUSD volume
- 2 active users

**Lo que necesita desarrollo (M1 - highest priority):**
- Opt-out/export functionality (custodial → path to self-custody)
- WhatsApp production approval
- Template Messages for 24h window
- Privacy controls
- Portuguese support
- Language-switching bug fix
- Rate limiting enhancements
- Monitoring infrastructure

**Lo que necesita desarrollo (M2-M4):**
- Fiat access (P2P primary, partnership stretch) - M2
- Basic referral system - invite codes - M3
- Multi-token support - M4
- Open source release - M4

**Targets ajustados para $50K:**
- M2: 200 users, $10K volume (was 500/$25K)
- M3: 750 users, $40K volume (was 2,000/$100K)
- M4: 1,500 users, $75K volume (was 5,000/$200K)
- Countries: CO → MX → AR → BR (4 total, not 5+)

**Lo que NO debería estar:**
- DeFi integrations (contradice filosofía)
- Multiple contract audits (solo hay 1)
- "Any ERC-20" claims (PYUSD only until M4)
- "Semi-custodial" claims (custodial until opt-out built)

---

## RESUMEN DE UBICACIONES

### PROPOSAL1.md

| Corrección | Sección                    | Líneas  |
| ---------- | -------------------------- | ------- |
| 1          | Tech Stack                 | 77-82   |
| 2          | Account Abstraction claims | 73-74   |
| 3          | Innovation section         | 97-100  |
| 4          | Wallet Paradox             | 103     |
| 5          | What's Built table         | 220-233 |
| 6          | Functionality Validated    | 228-233 |
| 7          | Technical Architecture     | 306-311 |
| 8          | Budget - Security Audit    | 377-380 |
| 9          | Budget - Development       | 381-384 |
| 10         | Milestone 1 Deliverables   | 418-423 |
| **16**     | **Todos los Milestones**   | 415-456 |

### PROPOSAL2.md (Continuación)

| Corrección | Sección                      | Líneas  |
| ---------- | ---------------------------- | ------- |
| 11         | Protocol Performance Metrics | 58-62   |
| 12         | Audit Scope                  | 80-84   |
| 13         | Security Measures            | 90-95   |
| 14         | Composability                | 113-117 |
| 15         | Technical Implementation     | 142-147 |
| **16**     | **Milestones (formulario)**  | 226-256 |

---

## VERIFICACIÓN DE CAMPOS DEL FORMULARIO

Basado en la estructura de Questbook para **New Protocols and Ideas 3.0**:

### APPLICANT INFORMATION

| Campo                 | ¿Cubierto? | Estado                        | Ubicación              |
| --------------------- | ---------- | ----------------------------- | ---------------------- |
| Name                  | ✅         | "Sippy"                       | PROPOSAL1 línea 7      |
| Email                 | ⚠️         | **FALTA** - `[TU EMAIL AQUÍ]` | PROPOSAL1 línea 11     |
| Telegram              | ✅         | @SippyPayments                | PROPOSAL1 línea 15     |
| Twitter               | ✅         | @SippyPayments                | PROPOSAL1 línea 19     |
| Discord               | ✅         | discord.gg/sippy              | PROPOSAL1 línea 23     |
| Website               | ✅         | sippy.lat                     | PROPOSAL1 línea 27     |
| LinkedIn              | ✅         | 2 perfiles                    | PROPOSAL1 líneas 31-32 |
| Instagram             | ✅         | N/A                           | PROPOSAL1 línea 36     |
| Others (GitHub, etc.) | ✅         | Completo                      | PROPOSAL1 líneas 40-42 |
| KYC Acknowledgment    | ✅         | Yes                           | PROPOSAL1 línea 46     |
| Report Acknowledgment | ✅         | Yes                           | PROPOSAL1 línea 50     |
| Wallet Address (ARB1) | ⚠️         | **FALTA** - `[0x...]`         | PROPOSAL1 línea 54     |

### GRANT INFORMATION

| Campo                    | ¿Cubierto? | Estado                                 |
| ------------------------ | ---------- | -------------------------------------- |
| Title                    | ✅         | Completo                               |
| Project Details          | ✅         | Completo (REQUIERE CORRECCIÓN técnica) |
| Category                 | ✅         | "Consumer App"                         |
| Innovation/Value         | ✅         | Completo (REQUIERE CORRECCIÓN técnica) |
| Target Audience          | ✅         | Detallado                              |
| Team Experience          | ✅         | Muy completo con LinkedIn              |
| Comparable Projects      | ✅         | Tabla comparativa incluida             |
| Current Stage            | ✅         | MVP (REQUIERE CORRECCIÓN técnica)      |
| Previous Arbitrum Grants | ✅         | "No" declarado                         |
| Previous Other Grants    | ✅         | "No" declarado                         |

### GRANT REQUEST DETAILS

| Campo                        | ¿Cubierto? | Estado                                        |
| ---------------------------- | ---------- | --------------------------------------------- |
| Idea/Project Description     | ✅         | Completo (REQUIERE CORRECCIÓN técnica)        |
| Major Deliverables           | ✅         | 12 deliverables listados                      |
| Arbitrum Ecosystem Alignment | ✅         | Detallado                                     |
| Requested Grant Amount       | ✅         | $50,000 USD                                   |
| Budget Breakdown             | ✅         | Detallado por categoría (REQUIERE CORRECCIÓN) |
| Milestones                   | ✅         | 4 milestones con KPIs                         |
| KPIs per Milestone           | ✅         | Cuantitativos y medibles                      |
| Max Completion Time          | ✅         | 20 semanas                                    |
| Success Metrics              | ✅         | Tabla con métricas                            |
| Economic Plan                | ✅         | Revenue model + projections                   |

### DOMAIN SPECIFIC (New Protocols and Ideas)

| Campo                | ¿Cubierto? | Estado                                              |
| -------------------- | ---------- | --------------------------------------------------- |
| Protocol Performance | ✅         | ETHOnline + metrics (REQUIERE CORRECCIÓN)           |
| Audit History        | ✅         | "No audit yet" + plan (REQUIERE CORRECCIÓN scope)   |
| Composability        | ✅         | Detallado (REQUIERE CORRECCIÓN - simplificar scope) |
| Scope Realism        | ✅         | Análisis completo                                   |

### MILESTONES (Formulario Separado)

| Milestone    | ¿Cubierto? | Amount  | Timeline                |
| ------------ | ---------- | ------- | ----------------------- |
| Milestone 01 | ✅         | $13,000 | 8 weeks (FALTA fecha)   |
| Milestone 02 | ✅         | $15,000 | 12 weeks (FALTA fecha)  |
| Milestone 03 | ✅         | $12,000 | 16 weeks (FALTA fecha)  |
| Milestone 04 | ✅         | $10,000 | 20 weeks (FALTA fecha)  |
| Total        | ✅         | $50,000 | ~5 months               |

### OTHER

| Campo                        | ¿Cubierto? | Estado             |
| ---------------------------- | ---------- | ------------------ |
| How did you find the program | ✅         | "Arbitrum Twitter" |

---

## RESUMEN DE COBERTURA

| Sección         | Campos Totales | Completos | Faltantes | Requieren Corrección |
| --------------- | -------------- | --------- | --------- | -------------------- |
| Applicant Info  | 12             | 10        | **2**     | 0                    |
| Grant Info      | 10             | 10        | 0         | 4                    |
| Grant Request   | 10             | 10        | 0         | 2                    |
| Domain Specific | 4              | 4         | 0         | 3                    |
| Milestones      | 5              | 5         | 0         | 0                    |
| Other           | 1              | 1         | 0         | 0                    |
| **TOTAL**       | **42**         | **40**    | **2**     | **9**                |

### ⚠️ CAMPOS FALTANTES (2):

1. **Email** - Agregar email real
2. **Wallet Address** - Agregar wallet de Arbitrum One

### 🔧 CAMPOS QUE REQUIEREN CORRECCIÓN TÉCNICA (9):

1. Project Details - Tech stack incorrecto
2. Innovation/Value - Claims de ERC-4337
3. Current Stage - What's Built table
4. Idea/Project Description - Arquitectura técnica
5. Budget Breakdown - Scope de auditoría
6. Protocol Performance - Métricas de testnet
7. Audit History - Scope de contratos
8. Composability - Simplificar (solo send/receive, no DeFi)
9. Technical Implementation - Detalles de contratos

---

## CHECKLIST FINAL

### Reemplazos Globales (buscar y reemplazar)

- [ ] "ERC-4337" → "Coinbase CDP Server Wallets (custodial today)"
- [ ] "semi-custodial" → "custodial (opt-out to be implemented)"
- [ ] "Biconomy/Pimlico" → eliminar completamente
- [ ] "Twilio" → "Meta WhatsApp Cloud API"
- [ ] "SippyWalletFactory.sol" → eliminar
- [ ] "SippyPaymaster.sol" → eliminar
- [ ] "SippyTransferRouter.sol" → eliminar
- [ ] "SippyRegistry.sol" → eliminar
- [ ] "Paymaster" (en contexto de gasless) → "GasRefuel contract"
- [ ] "any ERC-20 token" → "PYUSD (multi-token in M4)"
- [ ] "llama-3.1-8b" → "Llama 3.3 70B"
- [ ] "3 languages" → "2 languages (ES/EN); Portuguese planned for M1"
- [ ] "auto-creates wallets" → "creates wallets via simple 'start' command"
- [ ] "DeFi, NFTs, and any dApp" → "send/receive PYUSD (multi-token M4, NFTs future)"

### Verificaciones Pendientes

- [ ] Agregar email faltante
- [ ] Agregar wallet address de Arbitrum One (0x...)
- [ ] Seleccionar fechas de milestones (4, 8, 12, 16 semanas)
- [ ] Confirm real metrics are used (4 wallets, ~10 tx, ~7 PYUSD, 2 users)

---

## NOTA IMPORTANTE

La propuesta sigue siendo **sólida y viable** con estas correcciones. El valor del proyecto no cambia, pero la honestidad sí:

| Claim                              | Estado Real                                    |
| ---------------------------------- | ---------------------------------------------- |
| WhatsApp-native payments           | ✅ Funcionando (PYUSD)                         |
| Easy onboarding ("start" command)  | ✅ Real - más fácil que onboarding tradicional |
| LLM parsing                        | ✅ Implementado (Groq - Llama 3.3 70B)         |
| Gasless para usuarios              | ✅ Real (via GasRefuel contract)               |
| Custodial (CDP wallets)            | ✅ Hoy es custodial                            |
| Opt-out/export                     | 🔜 **To be implemented** (M1 deliverable)      |
| Multi-token support                | 🔜 **M4 deliverable** (PYUSD only today)       |
| Portuguese support                 | 🔜 **M1 deliverable** (ES/EN only today)       |
| LATAM market focus                 | ✅ Válido (CO base)                            |
| Team experience                    | ✅ Verificable                                 |

### Filosofía Clara:

> **Sippy hace el onboarding fácil. Los flujos complejos son para otras apps.**

El modelo es custodial hoy, pero construiremos opt-out/export para que usuarios avanzados puedan tomar control total. Sippy se enfoca en lo que hace mejor: **enviar y recibir PYUSD de forma simple**, con multi-token planeado para M4.

### Honestidad sobre el estado actual:

- **4 wallets, ~10 tx, ~7 PYUSD, 2 active users** - early MVP numbers
- **Custodial** - not semi-custodial yet
- **PYUSD only** - not any ERC-20 yet
- **ES/EN only** - Portuguese not implemented yet
- **Known bugs** - language-switching, 24h window limitation

This corrections document ensures the proposal accurately reflects reality while maintaining the project's value proposition.

---

_Documento actualizado el 26 de Noviembre, 2025_
_Audit corrections applied based on PROJECT-STATUS.md review_

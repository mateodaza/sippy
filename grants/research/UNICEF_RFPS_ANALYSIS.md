# UNICEF Venture Fund RFPS — Strategic Analysis & Playbook

**Status:** Longlisted April 2026, advancing to RFPS stage via UNGM
**Funding:** Up to $100K equity-free + 1 year technical mentorship
**Process timeline:** ~12-16 weeks from RFPS launch, ~18 weeks to contract award
**Owner (recommended focal point):** Lina Sandoval

---

## Executive Summary

The RFPS is a UNICEF Supply Division procurement instrument bolted onto a startup acceleration program. That dual nature is the trap: the Venture Fund team wants a scrappy open-source startup, but the procurement office wants a vendor that looks like a 10-year-old NGO. Sippy will be evaluated on both lenses simultaneously.

Three things determine the outcome:

1. **Administrative compliance.** The silent killer. Most rejections happen before anyone reads the technical proposal.
2. **Strategic positioning.** Generic "blockchain for financial inclusion" pitches lose. Specific population + specific villain wins.
3. **Execution discipline.** Dry-run uploads, Latin-character filenames, deliverable-based budgets, two-envelope submission. Boring stuff that kills applications.

The single biggest meta-insight: the RFPS is an admin-compliance test wearing a startup-acceleration costume. Fail the checklist and the brilliant pitch is never read. Win the checklist and a moderately good pitch wins.

---

## Part 1 — The Three Strategic Reframes

### Reframe 1: Sippy is the LATAM-WhatsApp port of UNICEF's own Aidlink project

This is the biggest finding of the entire research.

In 2024, UNICEF Venture Fund tested **Aidlink**: an open-source, end-to-end USDC cash transfer platform. Tested in Nairobi with 49 participants on basic phones via SMS. USDC on Stellar, EVM-compatible, open-source. UNICEF's 2024 growth strategy explicitly funds "Open Source platforms that integrate stablecoin-based disbursements, multi-sig wallets, and verification mechanisms."

Sippy is Aidlink's missing LATAM piece. Same stablecoin (USDC). Same open-source thesis. Same EVM rails (Arbitrum vs. Stellar). Adapted to the messaging channel LATAM actually uses (WhatsApp, 90%+ penetration) instead of SMS.

**Positioning statement to reuse across templates:**

> "Sippy is the LATAM-WhatsApp counterpart to Aidlink's Africa-SMS pilot. Same stablecoin rails, same open-source thesis, adapted to where the conversation already happens. We are not proposing a new idea. We are completing the regional port of a platform UNICEF already validated."

**Why this works:** It moves Sippy from "nice blockchain startup" to "execution partner for a thesis UNICEF already committed to." Evaluators read that reframe and mentally slot Sippy into an existing budget line, not a speculative new one.

**Source:** https://www.unicefventurefund.org/story/insights-stablecoin-based-end-end-cash-transfer-platform-test

---

### Reframe 2: Target caregivers, not children

UNICEF's **Child-Lens Investing Framework (CLIF)** has an explicit "child-inclusive" category where benefit flows through caretakers. Their 2025 Microfinance Index with **60 Decibels** embedded child-lens assessment methodology directly.

UNICEF's own rationale: "the health and economic realities of caretakers have impacts on their children."

Sippy's actual user base is mostly mothers and caregivers managing household money flows. This is a perfect CLIF "child-inclusive" product. It does not need to be a kids app. It needs to credibly measure caregiver outcomes using the 60 Decibels framework, which Sippy can plug into from day one.

**Positioning to use:**

> "Every USDC sent through Sippy lands in a caregiver's hands. Sippy plugs into the 60 Decibels child-lens MFI methodology from day one and produces caregiver-impact data the UNICEF framework was designed to measure."

**Surprising insight:** UNICEF cares more about caregivers than about children directly in financial-inclusion products. The CLIF "child-inclusive" category is the path of least resistance. Applicants who pitch "kids crypto wallet" lose.

**Sources:**

- https://www.unicef.org/innovation/innovative-finance/child-lens-investing
- https://www.unicef.org/innovation/media/18531/file/Child-Lens%20Investing%20Framework.pdf

---

### Reframe 3: Name a specific population and a specific villain

Leaf Global Fintech (2019 cohort winner) framed itself around "Rwandan refugees vs. Western Union's 33% sub-$10 transaction fees." They intentionally avoided generic "unbanked" framing. They won.

**Sippy's version:** Venezuelan caregivers in Colombia vs. 6-8% remittance fees on Western Union / MoneyGram.

Supporting facts:

- **RMRP 2025-2026** targets 2.34M Venezuelan refugees/migrants across 17 countries
- **ICBF's Te Acompaño** program identified 646 unaccompanied Venezuelan children in Necoclí and Acandí alone
- **174,500 Venezuelan children** obtained Colombian regularization permits (PPT)
- **ADN Dignidad program** (Acción Contra el Hambre + Danish Refugee Council + Norwegian Refugee Council, USAID-funded) gives ~$100/month to 250,000+ Venezuelan migrants using legacy rails
- Sippy already operates in Colombia

**Positioning to use:**

> "Sippy operates in the same Colombian municipalities where UNICEF's largest LATAM child-protection caseload lives — Necoclí, Cúcuta, Bogotá, Medellín. The WhatsApp-first design works on the basic Android phones Venezuelan migrants actually carry. Our pilot cohort is the same population ICBF's Te Acompaño program is already serving with legacy cash programming."

**Rule:** Stop saying "LATAM financial inclusion." Say specific municipalities. Name ICBF. Name the ADN Dignidad consortium. Name the fee structure you replace.

**Sources:**

- https://www.r4v.info/en/refugeeandmigrants
- https://rmrp.r4v.info/
- https://www.calpnetwork.org/publication/understanding-the-impact-of-a-humanitarian-cash-transfer-hct-program-in-colombia/

---

## Part 2 — Two-Mode Product Story

The product story that wins blockchain cohorts has two modes, not one.

### Consumer mode (what Sippy is today)

WhatsApp wallet for families and caregivers. Users receive remittances, send to contacts via alias, onramp through Colurs.io (Colombia) or Coinbase (rest of LATAM), hold USDC on Arbitrum in non-custodial CDP wallets.

### Implementer mode ("Sippy for NGOs") — pitch as Phase 2 deliverable

A disbursement API that lets humanitarian implementers push USDC to existing Sippy users via the same WhatsApp UX, with multi-sig oversight for organizational flows. ADN Dignidad consortium, ICBF, World Vision Colombia, Save the Children Colombia are the named target partners.

**Why this matters:** Rumsan/Rahat (2021 cohort) won their growth funding by becoming the infrastructure layer NGOs plug into, not a direct-to-consumer wallet. UNICEF's 2024 strategic pivot funds infrastructure for humanitarian implementers, not direct apps. Even as a Phase 2 roadmap item, this alignment is worth real evaluation points.

---

## Part 3 — Past Winners to Study

### Xcapit (Argentina, 2021 cohort → growth funding 2022)

**What they built:** Self-custodial multichain wallet, open-source, started smartphone-only.

**Why they won growth:** Pivoted to include a feature-phone version explicitly for "low connectivity" populations. Embedded financial-literacy micro-modules. Reached 50K+ users / 500K beneficiaries / 167 countries.

**Lesson for Sippy:**

- UNICEF rewarded Xcapit for _adding_ a low-connectivity tier and _embedded literacy_, not just shipping a wallet.
- Sippy's WhatsApp-as-low-connectivity-tier is a stronger version of Xcapit's feature-phone move.
- **Action:** Add explicit micro-learning prompts inside the WhatsApp flow. "What is USDC, in 2 sentences." "Why is this wallet non-custodial?" This checks the financial literacy box UNICEF funded Xcapit for.

**Source:** https://www.unicefventurefund.org/story/xcapit-smart-crypto-wallet-social-impact-and-financial-literacy-and-inclusion

---

### Rumsan / Rahat (Nepal, 2021 cohort → growth funding 2024)

**What they built:** Cash and Voucher Assistance (CVA) management platform on Base + stablecoins, with multimodal UX (SMS, IVR, mobile, QR).

**Why they won growth:** Became the infrastructure layer for humanitarian NGOs. Disbursed to 4,000+ households during Nepal monsoons via Danish Red Cross + GSMA Innovation Fund partnership.

**Lesson for Sippy:**

- Implementer-mode framing is what unlocks growth funding, not consumer metrics alone.
- Named partnerships before applying matters. Rumsan had Danish Red Cross on record.
- **Action:** Pitch "Sippy for NGOs" as Phase 2 and chase one LOI from ICBF, ADN Dignidad consortium, World Vision Colombia, or Save the Children Colombia before the RFPS deadline.

**Source:** https://www.unicefventurefund.org/story/mid-investment-update-how-rumsan-transforming-digital-humanitarian-aid-disconnected

---

### Leaf Global Fintech (Rwanda, 2019 cohort → acquired by IDT)

**What they built:** USSD-based, no-smartphone-required cross-border wallet for refugees. Built on Stellar.

**Why they won:** Named population + named villain framing. Cited Western Union charging up to 33% on sub-$10 transactions, dropped that to ~4%. Reached 7,000 direct refugee users / 40,000 beneficiaries across 3 African countries before acquisition.

**Lesson for Sippy:**

- Framing discipline: a specific vulnerable population and a specific incumbent to displace.
- Avoid generic "unbanked" language. Use municipality names, program names, fee percentages.
- **Action:** Adopt Leaf's narrative discipline verbatim. Your named population is "Venezuelan caregivers in Colombia" and your named villain is "6-8% remittance fees on legacy rails."

**Source:** https://www.unicefventurefund.org/story/leaf-wallet-digital-financial-services-refugees-and-under-resourced-communities

---

## Part 4 — The Failure Modes (Top 5)

### 1. Administrative non-compliance disqualification (the silent killer)

The number-one cause of rejection across UN procurement: failing the admin check before anyone reads the technical proposal.

**Concrete causes:**

- Missing signatures/stamps on PDFs
- Filenames with non-Latin characters ("Técnica" instead of "Tecnica")
- Financial proposal not in a separate file, or not encrypted when required
- Wrong language
- Missing "Bid Submission Form"
- Corrupted or non-PDF files

UN guidance is explicit: "failure to do so can result in the disqualification of your offer."

**Mitigation:** Build a checklist from the RFPS Annex listing every document with three fields (file name, signature required Y/N, separate-file Y/N). Lina signs off on every PDF before upload. Latin characters only, PDF format only, signed and stamped, no corruption.

---

### 2. Last-minute upload failure on UNGM/in-tend portal

UN agencies repeatedly warn: "if you face any issue submitting at the last minute, UNICEF may not be able to assist and will not be held liable." The in-tend portal is slow and times out on large uploads.

**Mitigation:**

- Full dry-run upload at least 72 hours before deadline
- Real submission 24+ hours early
- Chrome browser only
- Save progressively in draft as you go, do not compose offline and bulk-upload

---

### 3. Treating the RFPS like a pitch deck instead of a procurement document

Founders write narratives. Procurement officers score against rubrics. If your proposal does not directly answer each numbered requirement in the RFPS Terms of Reference, in the same order, you lose points even if the answer is brilliant.

**Mitigation:** Structure the technical proposal as a literal table mapping each ToR requirement to the response section. This is standard UN procurement practice and evaluators reward it.

---

### 4. Workplan budget that does not tie to deliverables

UNICEF pays "deliverable-based (within 30 days upon UNICEF's acceptance of each deliverable) and based on an all inclusive maximum fixed cost per deliverable." A staff-cost-based budget gets marked non-responsive by the financial evaluator.

**Mitigation:** Every dollar in your budget maps to a numbered, acceptance-testable deliverable. No "general engineering costs." No "founder time."

---

### 5. Open-source commitment ambiguity

UNICEF Venture Fund rule: "To qualify for investment, the solution has to be Open Source or the company needs to indicate willingness to place it on an open license, and if the solution receives investment, it has to have an Open Source license by month six."

Many startups hedge and lose technical points.

**Mitigation:** State unambiguously in writing that Sippy will be MIT or Apache-2.0 by month 6 of investment. Name the repo URL. Include the DPG Standard 9-indicator self-assessment as an annex. Four of five recent financial-inclusion blockchain cohort graduates were certified Digital Public Goods — this is the real target UNICEF funds you toward.

---

## Part 5 — Presenting Minimal Financials (the 1-month-old entity problem)

**This is exactly what the Venture Fund expects from emerging-market startups.** Do not panic but be deliberate.

### UNGM registration level

- **Do not register at Level 2.** Requires 3 years of operating history. Sippy cannot meet this.
- **Register at Basic, then Level 1.** Level 1 requires:
  - Certificate of Incorporation (you have it: SIPPY S.A. DE C.V., NIT 0623-200326-118-2, NRC 383194-0, Matricula 2026131377)
  - Three independent client/partner references (non-affiliated)
  - Ownership disclosure
- Sippy qualifies for Level 1 today.

### Newly Incorporated Entity financial pack

The accepted substitute for audited financials for new entities:

1. **Opening balance sheet** signed by a CPA (get from Accelerate or an El Salvador CPA)
2. **Statement of Financial Position as of [current date]** signed by both founders as administrators
3. **Questbook grant agreement + disbursement record** as third-party revenue validation
4. **Bank account opening confirmation** as operational evidence

Bundle all four into one PDF named "Financial Statements - Newly Incorporated Entity."

### Cover Letter on Financial History (one page)

Must explain:

- Company incorporated March 20, 2026 as SIPPY S.A. DE C.V., El Salvador
- Predecessor activity was operated as a founder project prior to incorporation
- Arbitrum Foundation / Questbook $25K grant agreement attached as third-party validation
- Statement that audited financials will be produced at first fiscal year-end per Salvadoran law

### Reference accounts (the 3 you need for Level 1)

- **Arbitrum Foundation / Offchain Labs** — via Austin Ballard, Ben Terry, or David B. The Questbook program is a perfect reference.
- **Colurs.io** — signed agreement partner for Colombia COP onramp.
- **One LATAM NGO or implementing partner** — this is the hardest. Candidates: ICBF, ADN Dignidad consortium, World Vision Colombia, Save the Children Colombia, or a named beta user's organization.

All three on letterhead. Start chasing this week. References are commonly the 2-3 week bottleneck.

---

## Part 6 — The 9 UNICEF Innovation Principles

### Strongest (provable today)

1. **Open Standards / Open Source / Open Innovation** — GPL/MIT commitment, EVM-compatible, no proprietary lock-in. Show GitHub repo, LiFi integration, Arbitrum public ledger.
2. **Reuse and Improve** — Sippy reuses Coinbase CDP, Arbitrum, USDC, WhatsApp Business API, LiFi. Frame as principled reuse, not vendor dependency.
3. **Design for Scale** — WhatsApp = 90%+ LATAM penetration, no app store distribution friction, dual SMS/WhatsApp OTP. Cite WhatsApp as the only LATAM channel that scales without behavior change.
4. **Be Collaborative** — Offchain Labs (Austin Ballard, Ben Terry, David B), Questbook $25K Arbitrum grant approved, Colurs.io partnership for COP onramp, Bitso/MXNB ecosystem context.

### Provable with effort

5. **Design with the User** — 45 beta testers with $4K+ volume, smart alias resolver tuned for Spanish slang ("mándale", "pásale"), dialect-aware. Bring 2-3 user quotes from real Colombian beta testers.
6. **Be Data Driven** — PostHog analytics + 1090+ unit tests + on-chain Arbiscan trail. Frame the on-chain history as the most rigorous "data" any cash transfer program can have.

### Hardest to claim — needs explicit handling

7. **Do No Harm** — Self-custody is a risk surface UNICEF will scrutinize: lost seed phrases, scam vectors, women in coercive households forced to surrender funds. Pre-empt with concrete mitigations: social-recovery roadmap, keyword-protected delete-contact already shipped, spending limits architecture, anti-injection LLM normalizer, trilingual support reducing misunderstanding risk.
8. **Build for Sustainability** — Show the path: gas sponsorship funded by GasRefuelV2, fee model post-M2, Camello orchestration as the long-term engine. Do not hide the business model.
9. **Understand the Existing Ecosystem** — Map the existing Colombia ecosystem: ICBF, ADN Dignidad consortium, Bitso, Colurs.io, R4V/RMRP, regulatory landscape post-Ley Fintech.

---

## Part 7 — What UNICEF Actually Values vs. What Applicants Usually Pitch

### What generic blockchain pitches do (and lose with)

- Lead with "financial inclusion + 1.4B unbanked"
- Show tokenomics
- Claim "transparent + immutable" as if the words alone earn points
- Name no specific population
- Name no specific implementing partner
- Treat open-source as a license file rather than a practice

### What 2024-2025 winners actually demonstrated

1. **Multimodal accessibility, not just "mobile"**
   Rahat shipped SMS + IVR + mobile + QR. UNICEF reads single-channel pitches as scale-naive.
   **Sippy implication:** Lead with the dual SMS/WhatsApp OTP architecture as proof of multimodal thinking, even before pitching the SMS-only version.

2. **Real partnership pipeline, not "we hope to partner"**
   Rumsan named Danish Red Cross and GSMA before applying for growth.
   **Sippy implication:** One signed LOI from ICBF, ADN Dignidad, World Vision Colombia, or Save the Children Colombia would dramatically outperform the average RFPS submission. Worth serious effort in the next 2-4 weeks.

3. **Implementer mode, not just consumer mode**
   UNICEF's 2024 pivot to "stablecoin disbursements + multi-sig + verification" is explicitly about giving humanitarian implementers infrastructure.
   **Sippy implication:** Describe "Sippy for NGOs" disbursement API as a Phase 2 deliverable with multi-sig oversight for implementer flows.

4. **Named, verified end-user research**
   Xcapit's pivot to feature phones came from user research. UNICEF wants to see _what you learned that changed the product_.
   **Sippy implication:** Tell the Transak/TransFi-decline → Colurs.io story as proof of LATAM ecosystem fluency. Tell the SMS-OTP addition as a learning-driven pivot.

5. **Honest do-no-harm risk register**
   Applicants who wave away custody/coercion/literacy risks lose. Applicants who list them and show mitigations win.
   **Sippy implication:** A one-page "Do No Harm" register is probably the highest-leverage single document Sippy can include beyond the mandatory templates.

### Two surprising insights

**First:** UNICEF cares more about caregivers than children directly. CLIF's "child-inclusive" category is the path of least resistance for any financial product. Sippy does not need to be a kids app.

**Second:** The 2026 cohort's "digital public goods" focus area is underweighted by applicants because most cannot credibly claim it. A Sippy team that walks in with a DPG nomination already submitted (or in motion) has a moat the typical applicant cannot match in 30 days.

---

## Part 8 — UNGM-Specific Gotchas

- **Two-envelope system.** Technical and Financial proposals upload as completely separate files, named exactly "TECHNICAL PROPOSAL" and "FINANCIAL PROPOSAL." Some UNICEF tenders require the financial file to be password-encrypted, with the password sent only after technical evaluation passes. Watch for this in the tender instructions.
- **Latin characters only** in all filenames. No "ñ", no accents. "Sippy_Propuesta_Tecnica.pdf" not "Sippy_Propuesta_Técnica.pdf."
- **Pre-bid clarification phase.** Typically 7-10 days before submission deadline. Q&A is published to all bidders, anonymized. Strategic questions to ask:
  1. "Is the financial statements requirement applicable to entities incorporated within 6 months of the RFPS launch?" (surfaces new-entity accommodation officially)
  2. "Can the workplan period start later than contract signature date if the open-source license transition requires a defined sprint?"
  3. "Are deliverable acceptance criteria negotiable in the workplan annex post-award?"
     Avoid asking anything that telegraphs uncertainty about the tech.
- **Email questions go to the tender focal point, not to UNGM Secretariat.** Explicitly: "they should not, under any circumstances, be submitted to the UNGM Secretariat."
- **Save in draft progressively.** Do not compose offline and bulk-upload at the end.

---

## Part 9 — Critical Path Action List

### Start this week

1. **Register Sippy on UNGM at Basic + Level 1.** Free, takes days to validate docs. Do not wait for the tender invite.
2. **Sanctions pre-screening.** Check OFAC, UN Security Council Consolidated List, EU sanctions against SIPPY S.A. DE C.V., Mateo Daza, Carlos Quintero, Lina Sandoval, and the registered address. El Salvador entities sometimes trip false positives. Getting cleared ahead of time avoids fire drills during legal due diligence.
3. **Line up three reference letters.**
   - Arbitrum Foundation / Offchain Labs (Austin Ballard, Ben Terry, or David B)
   - Colurs.io (signed agreement partner)
   - One LATAM NGO or implementing partner (hardest, start early)
     All on letterhead. Partners take 2-3 weeks to respond.
4. **Lina prepares the Newly Incorporated Entity financial pack.** Opening balance sheet, founder-signed statement of financial position, Questbook grant agreement, bank confirmation, one-page cover letter. Pre-translated to English, signed, stamped, single PDF.
5. **Read the UNICEF General Terms and Conditions of Contract (Services).** Updated March 10, 2025. IP, liability, audit clauses are non-negotiable. Knowing them now means contract negotiation post-award is not a surprise.

### Start within 2 weeks

6. **Draft DPG Standard 9-indicator self-assessment.** Feasible in 1-2 weeks because Sippy meets the hard parts (open source, legal entity, EVM public ledger). Remaining work is documentation: privacy policy per Indicator 7, "do no harm" assessment per Indicator 9, standards adherence evidence. Submit as nominee before the RFPS deadline even if approval has not cleared. Reference the submission ID in the RFPS application. This is a moat typical applicants cannot match in 30 days.
7. **Chase one signed LOI** from ICBF, ADN Dignidad consortium (Acción Contra el Hambre + DRC + NRC), World Vision Colombia, or Save the Children Colombia. Even one LOI for the "Sippy for NGOs" disbursement API dramatically outperforms the average blockchain cohort submission.
8. **Draft a one-page "Do No Harm" register.** List real risks (self-custody / lost seed phrases, household coercion, scam vectors, literacy gaps) and concrete mitigations (social recovery roadmap, keyword-protected delete-contact, spending limits, anti-injection LLM normalizer, trilingual support, dual OTP channels). Include in the technical proposal as an annex.

### Organizational

9. **Lina Sandoval is the RFPS focal point.** Legal/compliance background, Colombia-based, fintech LATAM experience. Best fit to own the process end-to-end.
10. **Dedicated monitored email for UNGM registration.** Not a founder personal email. UNGM sends system mails that hit spam. Resolve the Google Workspace email creation issue for Lina first (see separate notes on unmanaged user transfer / trial caps / identity collisions).
11. **Assign a conflict-of-interest check.** If Mateo or Carlos has any prior or current relationship with anyone at UNICEF Office of Innovation, disclose it proactively in the cover letter. Undisclosed COI is a fast disqualifier in legal due diligence.

---

## Part 10 — Relevant Sources

### UNICEF Venture Fund primary sources

- [Equity-free funding for blockchain solutions](https://www.unicef.org/innovation/equity-free-funding-blockchain-solutions)
- [Funding & Support | UNICEF Venture Fund](https://www.unicefventurefund.org/funding-support)
- [UNICEF Venture Fund Selection Process](https://www.unicef.org/innovation/stories/unicef-venture-fund-selection-process)
- [Tech Outlook 2026: Blockchain Building Blocks for Scalable Impact](https://www.unicefventurefund.org/story/tech-outlook-2026-blockchain-building-blocks-scalable-impact)
- [UNICEF Venture Fund Annual Report 2024](https://www.unicefventurefund.org/sites/default/files/2025-07/AR%202024%20-%20External.pdf)
- [Six Blockchain Startups Graduate from UNICEF's Innovation Fund](https://www.unicef.org/innovation/unicefinnovationfund/blockchain2020)
- [Five Blockchain Startups Graduate from UNICEF's Venture Fund (financial inclusion)](https://www.unicef.org/innovation/venturefund/blockchain-financial-inclusion-graduation)
- [How blockchain can transform humanitarian cash transfers at scale](https://www.unicef.org/innovation/stories/how-blockchain-can-transform-humanitarian-cash-transfers-scale)
- [Investing in Blockchain, Web3, and AI for Social Impact](https://www.unicef.org/innovation/stories/investing-blockchain-web3-and-ai-social-impact)
- [Insights on the stablecoin-based cash transfer platform test (Aidlink)](https://www.unicefventurefund.org/story/insights-stablecoin-based-end-end-cash-transfer-platform-test)
- [UNICEF CryptoFund to use stablecoins to fund innovation](https://www.unicef.org/innovation/unicef-cryptofund-use-stablecoins-fund-innovation)

### Past winners

- [Xcapit: Smart crypto wallet for social impact and financial literacy](https://www.unicefventurefund.org/story/xcapit-smart-crypto-wallet-social-impact-and-financial-literacy-and-inclusion)
- [Mid-Investment Update: Rumsan Transforming Digital Humanitarian Aid](https://www.unicefventurefund.org/story/mid-investment-update-how-rumsan-transforming-digital-humanitarian-aid-disconnected)
- [Rahat: Blockchain for faster, transparent cash assistance](https://www.unicefventurefund.org/story/rahat-blockchain-faster-transparent-cash-assistance-beneficiaries-hard-reach-areas)
- [Leaf Wallet: Digital financial services for refugees](https://www.unicefventurefund.org/story/leaf-wallet-digital-financial-services-refugees-and-under-resourced-communities)

### UNGM / procurement mechanics

- [UNGM Vendor Registration & e-Tendering Supplier User Guide](https://www.unrwa.org/sites/default/files/unrwa_-_ungm_vendor_registration_and_e-tendering_supplier_user_guide.pdf)
- [How to complete UNGM Registration at Level 1](https://help.ungm.org/hc/en-us/articles/360012906539-How-to-complete-the-Registration-at-Level-1)
- [UNGM Registration Levels](https://help.ungm.org/hc/en-us/articles/360013220820-What-are-the-registration-levels-used-by-organizations-on-UNGM)
- [How to participate in electronic submission on UNGM](https://help.ungm.org/hc/en-us/articles/360012912519-How-to-participate-in-procurement-opportunities-requiring-electronic-submission-on-UNGM)
- [UNGM Procurement Tips and Tendencies (Copenhagen 2018)](https://www.ungm.org/Shared/KnowledgeCenter/Document?widgetId=3866&documentId=754746)
- [FAO Bidders' Instructions UNGM (file format & rules)](https://www.fao.org/fileadmin/user_upload/bodies/Progr_Comm/Procurement_Statistics/About_Procurement/UNGM_Bidders_Instructions_ENG__20.02.2019_.pdf)
- [UNICEF General Terms and Conditions of Contract (Services)](https://www.unicef.org/supply/media/911/file/general-terms-and-conditions-of-contract-services.pdf)
- [UNICEF Supply Division - Solicitation Documents](https://www.unicef.org/supply/documents/solicitation-documents)
- [UNICEF Venture Fund Workplan (Bridge Fund cohort template reference)](https://unicef.github.io/inventory/mentoring/workplan-bridge-funding/)
- [UN Evaluation Methods (UN e-learning)](https://elearning.un.org/CONT/GEN/CS/The_Fundamental_of_Procurement/m05downloads/resources/Evaluation_Methods.pdf)

### Strategic alignment sources

- [Child-Lens Investing Framework | UNICEF](https://www.unicef.org/innovation/innovative-finance/child-lens-investing)
- [Child-Lens Investing Framework PDF](https://www.unicef.org/innovation/media/18531/file/Child-Lens%20Investing%20Framework.pdf)
- [The Child-Lens Investing Framework One Year On](https://www.unicef.org/innovation/child-lens-investing-framework-one-year)
- [UNICEF HOPE | Humanitarian Cash Transfers](https://www.unicef.org/hope-hct/)
- [Understanding the Impact of ADN Dignidad (Colombia HCT)](https://www.calpnetwork.org/publication/understanding-the-impact-of-a-humanitarian-cash-transfer-hct-program-in-colombia/)
- [Refugees and Migrants from Venezuela | R4V](https://www.r4v.info/en/refugeeandmigrants)
- [RMRP 2026 Plan](https://rmrp.r4v.info/)
- [Children on the Move including Venezuelans LACRO Sitrep](<https://www.unicef.org/media/148921/file/LACRO-Humanitarian-SitRep-No.1-(Children-on-the-Move-including-Venezuelans-and-other-crisis-affected-communities),-Mid-Year-2023.pdf>)
- [UNICEF Innocenti: Remittances and children](https://www.unicef.org/innocenti/remittances-children)
- [A Lifeline at Risk: COVID-19, Remittances and Children](https://www.unicef.org/media/87986/file/A%20lifeline%20report.pdf)
- [CAF and UNICEF partner: LAC Future Bank](https://www.unicef.org/lac/en/press-releases/caf-and-unicef-partner-promote-development-opportunities-children-and-young-people)
- [UNICEF Accountability to Affected Populations Handbook](https://www.corecommitments.unicef.org/kp/unicef_aap_handbook_en_webdouble.pdf)
- [Making cash transfers work for children and families | UNICEF LAC](https://www.unicef.org/lac/sites/unicef.org.lac/files/2019-11/Making%20cash%20transfers%20work%20for%20children%20and%20families.pdf)

### Digital Public Goods

- [Digital Public Goods Standard | DPGAlliance GitHub](https://github.com/DPGAlliance/DPG-Standard)
- [DPG Submission Guide](https://www.digitalpublicgoods.net/submission-guide)
- [DPG Frequently Asked Questions](https://www.digitalpublicgoods.net/frequently-asked-questions)
- [Privacy and Data Security Framework for DPG Standard](https://new.digitalpublicgoods.net/blog/privacy-and-data-security-framework-for-dpg-standard)
- [Principles for Digital Development](https://digitalprinciples.org/)
- [Digital Public Goods Accelerator Guide (UNICEF)](https://unicef.github.io/publicgoods-accelerator-guide/)

### Market / inclusion data

- [Women's Financial Inclusion | World Bank Findex 2025](https://blogs.worldbank.org/en/opendata/more-women-have-financial-accounts--yet-equal-access-and-use-rem)
- [The Mobile Economy Latin America 2025 | GSMA](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/latam/)
- [The State of Mobile Internet Connectivity 2025 | GSMA Intelligence](https://www.gsmaintelligence.com/research/the-state-of-mobile-internet-connectivity-2025-overview-report)
- [Equity-Free Funding Opportunity for Fem Tech Solutions](https://www.unicef.org/innovation/FemTechCall)

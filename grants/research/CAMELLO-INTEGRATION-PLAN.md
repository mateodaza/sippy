# Sippy → Camello Integration Plan
> **Status:** Post-Arbitrum milestones (after June 2026)
> **Priority:** After M1 (March 26) and M2 (June 5) are shipped and proven

## Vision
Sippy becomes the **Web3 Financial Module** on Camello's generalist agent platform. Sippy stays the user-facing brand. Camello is the invisible engine.

## Why
- Camello's orchestration pipeline (intent classification, module system, autonomy gating, WhatsApp adapter) already solves 65% of what Sippy needs
- Sippy's financial logic (payments, balances, onramp, savings) becomes a reusable module package any fintech can deploy
- Ben Terry (OCL Consumer Partnerships) thesis: "Consumers won't learn DeFi. They'll tell an AI agent: make my money grow. Best agents will run on Arbitrum."

## Sippy → Camello Module Mapping

| Sippy concept | Camello equivalent |
|---|---|
| Single WhatsApp bot | An artifact of type `money_agent` owned by a tenant |
| 8 LLM-parsed commands | Modules: `check_balance`, `transfer_funds`, `create_wallet`, `view_history`, `manage_settings` |
| Groq Llama parsing | Camello's 2-pass intent classifier (regex → LLM), using a finance intent vocabulary |
| CDP wallet service | External service adapter called by `transfer_funds` module's `execute()` |
| Phone → wallet mapping | Camello's customers table + wallet_addresses extension |
| Daily spending limits | Artifact constraints JSONB: `{ dailyLimit: 500, txLimit: 100 }` |
| Spend permissions (on-chain) | `fully_autonomous` autonomy level |
| "Send $25 to Maria? YES" confirmation | `draft_and_approve` autonomy level |

## Future Financial Modules (post-integration)

| Module | Description |
|---|---|
| `send_payment` | USDC transfer via spend permissions |
| `check_balance` | Wallet balance + local currency equivalent |
| `onramp_fiat` | Fiat → USDC via onramp partner |
| `deploy_savings` | USDC → Uniswap v4 LP position (stablecoin pair, tight range, ~2-4% APY) |
| `withdraw_savings` | Pull from LP back to wallet |
| `view_history` | Transaction history with Arbiscan links |

## Three Changes Needed in Camello

### 1. Open type enums (low effort)
- `ArtifactType`: add `'finance'` or open to any string
- `ModuleCategory`: add `'finance'` or open to any string
- Prompt builder: use `personality.role` from JSONB instead of hardcoded type

### 2. Pluggable intent vocabulary (medium effort)
```typescript
interface VerticalConfig {
  slug: string;                           // 'workforce' | 'finance'
  artifactTypes: string[];                // ['money_agent', 'advisor']
  intentTypes: string[];                  // finance-specific intents
  regexIntents: Record<string, RegExp[]>; // fast-path patterns for payments
  intentToDocTypes: Record<string, string[]>;
  modelRouting: Record<string, ModelTier>;
  defaultPromptRules: string[];           // compliance/safety rules
}
```

### 3. Generic module DI callbacks (focused refactor)
```typescript
interface ModuleDefinition<TInput, TOutput> {
  requiredCallbacks: string[];  // ['insertTransaction', 'getWalletBalance']
}
type CallbackRegistry = Record<string, (...args: any[]) => Promise<any>>;
```
Financial modules bring their own callbacks. Existing workforce modules untouched.

## Sequence

1. **Now → March 26:** Ship Sippy M1. Don't touch Camello.
2. **March → June 5:** Ship Sippy M2. Prove traction with real users.
3. **June → July:** Camello ships billing (Paddle). Add vertical config system.
4. **July → August:** Port Sippy's financial logic into Camello modules. Test in parallel.
5. **August+:** Sippy runs on Camello. Pitch Camello to investors with Sippy as proof.

## Uniswap Grant Angle (separate opportunity)
- "Savings mode" via Uniswap v4 LP on Arbitrum
- User says "save 50" → deploys USDC into stablecoin LP → earns yield invisibly
- Pitch: "Sippy makes Uniswap invisible infrastructure for non-crypto users in LATAM"
- Target: Uniswap Foundation General Grants ($250K+) or v4 Hook Design Lab

## References
- Camello architectural assessment: `/Users/mateodazab/Documents/Own/camello/docs/generalist-platform-assessment.md`
- Sippy grant proposal: `/Users/mateodazab/Documents/Own/sippy/grants/research/QUESTBOOK-V7-GDOCS.txt`
- Camello tech spec: `/Users/mateodazab/Documents/Own/camello/TECHNICAL_SPEC_v1.md`

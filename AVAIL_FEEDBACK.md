# Avail Nexus SDK - Feedback from ETHOnline 2025

## Project: Sippy (WhatsApp PYUSD Payments)

### What We Built

Cross-chain funding flow using Avail Nexus SDK to bridge ETH from any source chain (Mainnet, Polygon, Base, Optimism, etc.) to Arbitrum, then execute a multi-hop swap to PYUSD and send to phone-based wallets.

### SDK Usage

- **Feature:** Bridge & Execute (nexus-core)
- **Implementation:** Two-signature flow enabling cross-chain onboarding
- **User flow:** Select source chain → Bridge via Nexus → Swap + Send

### Documentation Feedback

**What Worked Well:**

- Clear integration examples
- TypeScript support was excellent
- Bridge status tracking worked perfectly

**Areas for Improvement:**

1. **Custom Token Integration Documentation:**

   - **Blog post** describes custom token support via cross-chain swaps: "any token in, any token out" with examples like DEGEN, OP, PEPE
   - **SDK documentation** explicitly lists only ETH, USDC, USDT in the supported tokens table
   - Blog explains the concept (Source Swap → Bridge → Destination Swap) but SDK docs lack implementation details
   - No clear guidance on: How to determine if a token is supported, how to pass custom token parameters, or what routing is available
   - **Our experience:** Attempted PYUSD integration but `sdk.utils.isSupportedToken('PYUSD')` returned false; implemented workaround bridging ETH then swapping via Uniswap
   - **Suggestion:** Document how custom token routing works in practice - add API examples showing how to use tokens beyond ETH/USDC/USDT, clarify which tokens are routable vs natively supported, provide integration patterns for common stablecoins (DAI, PYUSD, etc.)

2. **SDK Lifecycle Documentation (Critical for Developer Experience):**

   - Docs show _how_ to call `sdk.deinit()` but not _when_ to call it
   - No guidance on wallet reconnection scenarios (common in web3 apps)
   - Unclear if calling `deinit()` on every disconnect is recommended or if SDK instances can persist across reconnects
   - **Impact on DX:** Without clear patterns, developers must guess - leading to either memory leaks (never deinit) or poor UX (frequent re-signatures from reinit)
   - **Our implementation:** Had to experiment with manual "Initialize Bridge" button to avoid auto-triggering signatures on every wallet reconnect
   - **Suggestion:** Add lifecycle best practices section covering: optimal init/deinit timing, reconnection handling patterns, session persistence strategies, and when SDK state should/shouldn't be preserved

3. **Error Handling Documentation:**

   - Error handling section exists but relies on fragile string matching (`error.message.includes('User denied')`)
   - Only 3 error scenarios documented: user denial, insufficient balance, unsupported chain/token
   - No error codes, types, or comprehensive error reference table
   - Missing: timeout errors, rate limits, network failures, simulation failures, retry strategies
   - **Suggestion:** Provide structured error types/codes instead of string matching, add comprehensive error reference with recovery strategies

4. **Gas Estimation & User-Facing Patterns:**

   - Simulation methods documented with basic examples (`simulateBridge`, `simulateTransfer`, `simulateBridgeAndExecute`)
   - Missing: How to display estimated costs to users in production UIs
   - No examples of simulation-to-execution workflows with loading states
   - No guidance on handling simulation failures or showing fee breakdowns
   - **Suggestion:** Add complete UI integration patterns showing cost display, loading states, and user confirmation flows

5. **Browser-Only Limitation:**
   - SDK requires EIP-1193 provider (browser wallet), cannot run on backend/Node.js
   - Requires `connector.getProvider()` or `window.ethereum` to initialize
   - Cannot use in smart contracts or server-side flows
   - Initially wanted to execute bridge logic from backend for automated flows - not possible
   - **Suggestion:** Document browser-only requirement upfront, or provide server-side alternative for programmatic bridging

### Overall Experience

The SDK enabled exactly what we needed: chain abstraction that's invisible to end users. Integration was smooth and documentation was sufficient to ship in 2 weeks.

---

## Demo

- Live: https://www.sippy.lat/fund
- Video: [link to submission]

---

## Supporting Evidence

### 1. PYUSD Token Support Testing

Our implementation attempted to use PYUSD with Nexus SDK:

```typescript
// frontend/app/providers/NexusProvider.tsx (Lines 98-113)
const tokens = ['ETH', 'USDC', 'USDT', 'PYUSD'];
const supportedTokens = tokens.filter((t) => {
  try {
    return sdk.utils.isSupportedToken(t as any);
  } catch {
    return false;
  }
});
console.log('📋 Supported tokens:', supportedTokens);
// Result: Only ETH, USDC, USDT supported
```

**Workaround implemented:**

- Bridge ETH using Nexus SDK
- Swap ETH → PYUSD using Uniswap Universal Router
- See: `frontend/lib/uniswapSwap.ts` and `frontend/lib/nexus.ts`

### 2. Session Persistence Issue

```typescript
// frontend/app/providers/NexusProvider.tsx (Line 408-409)
useEffect(() => {
  if (!isConnected) {
    cleanupSDK(); // Calls sdk.deinit()
  }
}, [isConnected]);

// Line 84: Re-initialization requires signature every time
await sdk.initialize(provider); // Triggers wallet signature popup
```

**Impact:** Users must sign message every time they reconnect wallet, even in same session.

### 3. Browser-Only Architecture

```typescript
// frontend/app/providers/NexusProvider.tsx (Line 61-70)
// Get the EIP-1193 provider from the connector
const provider = (await connector.getProvider()) as EthereumProvider;

if (!provider) {
  throw new Error('No EIP-1193 provider available');
}
```

**Limitation:** Cannot use SDK in:

- Backend/Node.js services
- Smart contracts
- Automated/programmatic bridging flows

### 4. Implementation Files

Our Nexus SDK integration spans:

- `frontend/app/providers/NexusProvider.tsx` - SDK initialization & session management (457 lines)
- `frontend/lib/nexus.ts` - Bridge helper functions
- `frontend/app/fund/page.tsx` - User-facing implementation
- Total: ~700+ lines of Nexus-related code

**GitHub:** https://github.com/mateodaza/sippy

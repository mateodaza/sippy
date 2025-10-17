# Frontend Testing Guide

## 🧪 Testing "Fund My Phone" Feature

### Prerequisites

- Backend running on `http://localhost:3001`
- Frontend running on `http://localhost:3000`
- MetaMask or Coinbase Wallet installed
- Some ETH on any supported chain (Ethereum, Optimism, Base, Polygon, Arbitrum)

---

## 📋 Test Checklist

### 1. Wallet Connection

- [ ] Go to http://localhost:3000/fund
- [ ] Click "Connect Your Wallet" button
- [ ] Choose your wallet (MetaMask, Coinbase Wallet, WalletConnect)
- [ ] Approve connection
- [ ] Verify you see your ETH balance

### 2. Phone Input with Country Picker

- [ ] Click on country flag dropdown
- [ ] Search for "Colombia" or your country
- [ ] Select country (should auto-add country code)
- [ ] Enter phone number (only digits)
- [ ] Verify format shows as `+57 311 661 3414` (example)

### 3. Gas Amount Selection

- [ ] See 4 options: 1, 5, 10, 20 transactions
- [ ] Click each option (should highlight with blue border)
- [ ] Verify ETH amount updates (0.0001, 0.0005, 0.001, 0.002)

### 4. Unified Balance Display

- [ ] Should show total ETH across all chains
- [ ] Should list breakdown by network if expanded
- [ ] Verify numbers match your wallet

### 5. Send Transaction

- [ ] Enter recipient phone: `+573116613414` (test number)
- [ ] Select gas amount: `5 transactions`
- [ ] Click "⚡ Send 0.0005 ETH"
- [ ] See status: "🔍 Resolving phone number..."
- [ ] See status: "🌉 Finding best route across your chains..."
- [ ] See status: "✍️ Please sign to send 0.0005 ETH to +573116613414"
- [ ] **Sign in wallet** (MetaMask popup)
- [ ] Wait for confirmation (~30 seconds)
- [ ] See success message: "✅ Successfully funded..."

---

## 🔍 Testing PYUSD Support

### Open Browser Console

1. Go to http://localhost:3000/fund
2. Connect your wallet
3. Open DevTools → Console (F12)
4. Run the test script:

```javascript
// Load test script
const script = document.createElement('script');
script.src = '/test-nexus.js';
document.head.appendChild(script);

// Or manually check:
console.log('Supported tokens:', window.nexusSdk.utils.getSupportedTokens());
```

### Expected Output:

```
🧪 SIPPY Nexus SDK Test Suite
=====================================

✅ SDK loaded!

📋 Test 1: Supported Tokens
----------------------------
Supported tokens: ['ETH', 'USDC', 'USDT', ...]

🎯 PYUSD supported: ✅ YES  (or ❌ NO)

📋 Test 2: Supported Chains
----------------------------
Supported chains: [1, 10, 137, 8453, 42161, ...]

📋 Test 3: Unified Balances
----------------------------
All balances: [...]

💰 ETH Balance Details:
  Total: 0.05
  Value: $125.50
  Breakdown by chain:
    - Ethereum (1): 0.03 ETH ($75.30)
    - Arbitrum (42161): 0.02 ETH ($50.20)

✅ Testing complete!
```

### If PYUSD is Supported:

```javascript
// Check your PYUSD balance
await window.checkPYUSD();

// Should output:
// PYUSD Balances:
//   Ethereum: 10.5
//   Arbitrum: 5.2
//   Total: 15.7
```

### Manual Bridge Test (Small Amount):

```javascript
// Test bridge 0.0001 ETH
const result = await window.nexusSdk.bridge({
  chainId: 1, // From Ethereum
  token: 'ETH',
  amount: '0.0001',
});

console.log('Bridge result:', result);
```

---

## 🐛 Common Issues & Solutions

### Issue: "SDK not initialized"

**Solution:** Wait a few seconds after connecting wallet, then refresh page

### Issue: Phone input not accepting numbers

**Solution:** Make sure you selected a country first

### Issue: "Insufficient balance"

**Solution:**

- Check you have enough ETH on ANY supported chain
- Try with smaller gas amount (1 transaction = 0.0001 ETH)

### Issue: Signature rejected

**Solution:**

- Sign again
- Check wallet is connected to correct network
- Refresh page and reconnect

### Issue: Transaction stuck

**Solution:**

- Check browser console for errors
- Verify backend is running
- Check Arbiscan for transaction status

---

## 📊 Success Criteria

✅ **Phase 1 - Wallet Connection:**

- User can choose wallet easily
- Connection is obvious and clear
- Balance displays correctly

✅ **Phase 2 - Phone Input:**

- Country picker works smoothly
- Phone number formats correctly
- Validation shows clear errors

✅ **Phase 3 - Transaction Flow:**

- User sees progress updates
- Signature prompt is clear
- Success/error messages are helpful

✅ **Phase 4 - PYUSD Detection:**

- SDK correctly detects PYUSD support
- Balances show on Mainnet and Arbitrum
- Ready for Phase 5 implementation

---

## 📸 Screenshot Checklist

Take screenshots of:

1. [ ] Connect wallet screen (before connection)
2. [ ] Wallet selection modal
3. [ ] Connected state with balance
4. [ ] Phone input with country picker open
5. [ ] Gas amount selection (all 4 options)
6. [ ] Transaction in progress (status messages)
7. [ ] Success message
8. [ ] Console output with SDK test results

---

## 🚀 Next Steps After Testing

1. **If PYUSD is supported by Nexus SDK:**

   - Implement PYUSD toggle in UI
   - Add PYUSD balance display
   - Create `bridgePyusdToArbitrum()` function
   - Test with small amounts ($1-5)

2. **If PYUSD is NOT supported:**

   - Research Across Protocol integration
   - Document manual bridge process
   - Consider future SDK updates

3. **Production Readiness:**
   - Add error boundaries
   - Implement retry logic
   - Add transaction history
   - Setup monitoring/analytics

---

**Last Updated:** January 2025  
**Status:** Ready for testing  
**Tester:** @mateodazab

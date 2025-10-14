# 🔧 CDP SERVER SIGNER CONFIGURATION

## 🚨 **CRITICAL ISSUE**
```bash
Error: project does not have a registered server signer
apiCode: 'not_found'
apiMessage: 'project does not have a registered server signer'
```

## ✅ **SOLUTION STEPS**

### **Step 1: Login to CDP Portal**
1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Login with your Coinbase account
3. Select your project (the one with the API key we're using)

### **Step 2: Enable Server Signer**
1. **Navigate**: Project Settings → Server Signer
2. **Enable**: Toggle "Server Signer" to ON
3. **Confirm**: Accept the terms about Coinbase managing signatures
4. **Wait**: Allow 5-10 minutes for propagation

### **Alternative Path** (if Server Signer not available):
1. **Navigate**: API Keys → Your Key → Permissions
2. **Enable**: "Server Wallet" permissions
3. **Enable**: "Accounts Export" if available
4. **Save**: Update permissions

### **Step 3: Verify Configuration**
Test with this curl command:
```bash
curl -X POST https://api.cdp.coinbase.com/v1/wallets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "networkId": "arbitrum-mainnet",
    "useServerSigner": true
  }'
```

### **Step 4: Test Our Application**
```bash
cd /Users/mateodazab/Documents/Own/sippy/backend
pnpm dev
```

Send webhook test:
```bash
curl -X POST http://localhost:3001/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "573116613414",
            "text": {"body": "start"},
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

## 🎯 **EXPECTED RESULT**
```bash
✅ CDP Wallet created:
   Wallet ID: [some-wallet-id]
   Address: 0x[wallet-address]
✅ User wallet registered and saved
```

## 📞 **IF ISSUES PERSIST**
- **Coinbase Support**: [CDP Support](https://docs.cdp.coinbase.com/get-help)
- **Alternative**: Switch to `useServerSigner: false` and implement seed management
- **Backup Plan**: Use Base mainnet instead of Arbitrum (more supported)

---

**Time Required**: 15 minutes max ⏱️

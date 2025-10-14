# 📱 WHATSAPP ACCESS TOKEN REFRESH

## 🚨 **CRITICAL ISSUE**
```bash
Error: Session has expired on Monday, 13-Oct-25 17:00:00 PDT
Current time: Monday, 13-Oct-25 17:45:29 PDT
```

## ✅ **SOLUTION STEPS**

### **Step 1: Login to Meta Dashboard**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Login with your Facebook/Meta account
3. Navigate to **Apps** → Your WhatsApp App

### **Step 2: Generate New Token**
1. **Go to**: WhatsApp → Configuration
2. **Find**: "Temporary access token" section
3. **Click**: "Generate" or "Refresh"
4. **Copy**: The new access token (starts with `EAAL...`)

### **Step 3: Update Backend**
Update your `.env` file:
```bash
cd /Users/mateodazab/Documents/Own/sippy/backend
```

Edit `.env`:
```bash
WHATSAPP_ACCESS_TOKEN=YOUR_NEW_TOKEN_HERE
WHATSAPP_PHONE_NUMBER_ID=786205717917216
WHATSAPP_VERIFY_TOKEN=sippy_hackathon_2025
```

### **Step 4: Restart Server**
```bash
pkill -f "ts-node" || true
pnpm dev
```

### **Step 5: Test Message Sending**
```bash
curl -X POST "https://graph.facebook.com/v21.0/786205717917216/messages" \
  -H "Authorization: Bearer YOUR_NEW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "573116613414",
    "type": "text",
    "text": {
      "body": "🧪 SIPPY test message - token refreshed!"
    }
  }'
```

## 📋 **ADD PHONE TO ALLOWED LIST**

While you're in the Meta Dashboard:

### **Step 1: Recipients List**
1. **Navigate**: WhatsApp → Configuration
2. **Find**: "Recipients" or "Phone Numbers" section
3. **Add**: +573116613414 (your test number)
4. **Save**: Confirm the addition

### **Step 2: Verification (Optional)**
Some numbers need verification:
1. **SMS Code**: Meta might send verification SMS
2. **Enter Code**: In the dashboard
3. **Confirm**: Number is now approved

## 🎯 **EXPECTED RESULT**
```bash
✅ Message sent successfully!
   Message ID: wamid.HBgMNTc[...]
```

## ⏰ **TOKEN LIFESPAN**
- **Temporary Token**: 24 hours (for testing)
- **System User Token**: Permanent (for production)

### **For Production/Demo Day**:
Consider creating a **System User Token**:
1. **Go to**: App Settings → Advanced → System Users
2. **Create**: System User with WhatsApp permissions  
3. **Generate**: Permanent token
4. **Use**: This token won't expire during demo

---

**Time Required**: 5 minutes max ⏱️

## 🚨 **DEMO DAY BACKUP**
If token expires during demo:
- Have backup tokens ready
- Know the refresh process (30 seconds)
- Consider System User Token for stability

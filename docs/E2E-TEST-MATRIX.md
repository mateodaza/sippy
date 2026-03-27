# E2E Test Matrix — Sippy Beta

> Manual test checklist for closed beta (50 testers).
> Each checkbox = one manual test. Tester initials + date go after the checkbox when passed.
> Re-run full matrix after each deploy.

---

## 1. New User Onboarding (WhatsApp)

### 1.1 Setup Flow

- [ ] Send "start" from a never-seen number — bot replies with setup link (EN)
- [ ] Send "comenzar" from a never-seen number — bot replies with setup link (ES)
- [ ] Send "comecar" from a never-seen number — bot replies with setup link (PT)
- [ ] Open setup link — phone pre-filled, OTP sent via Twilio SMS
- [ ] Enter correct OTP — wallet created, spend permission granted
- [ ] Enter wrong OTP 3 times — locked out with appropriate message
- [ ] Complete setup — optional recovery email prompt shown
- [ ] Skip email — setup completes with $50/day limit
- [ ] Add email during setup — verification email sent via Resend

### 1.2 Fund Wallet

- [ ] Open /fund page — wallet address displayed with copy button
- [ ] Send ETH to wallet address — balance updates on refresh
- [ ] Send USDC to wallet address — balance updates on refresh

### 1.3 Check Balance (WhatsApp)

- [ ] Send "balance" — bot replies with USDC balance + local currency equivalent (EN)
- [ ] Send "saldo" — bot replies with balance (ES)
- [ ] Send "saldo" — bot replies with balance (PT)
- [ ] Balance shows daily limit remaining: "$50.00 remaining of $50.00"

### 1.4 Send USDC (WhatsApp)

- [ ] Send "send 10 to +573001234567" — confirmation prompt shown (amount > $5)
- [ ] Reply "yes" — transfer executes, receipt with shareable link
- [ ] Recipient receives notification in their language
- [ ] Send "enviar 5 a +573001234567" — transfer executes immediately (amount <= $5, no confirmation)
- [ ] Send "enviar 10 para +5511999998888" — confirmation prompt (PT)
- [ ] Reply "sim" — transfer executes (PT confirm)
- [ ] Sender balance decreased, recipient balance increased (verify on-chain)

### 1.5 Receive USDC

- [ ] Recipient gets WhatsApp notification with amount + sender info
- [ ] Notification is in recipient's preferred language
- [ ] Recipient checks balance — reflects received amount

### 1.6 Transaction History

- [ ] Open profile page — transaction list shows sent + received transfers
- [ ] Open receipt link — shows transaction details (amount, sender, recipient, timestamp)
- [ ] Blockscout link works for on-chain verification

---

## 2. Returning User Flows

### 2.1 English (+1 number)

- [ ] Send "start" — bot recognizes user, shows balance
- [ ] Send "balance" — shows USDC + USD equivalent
- [ ] Send "send 20 to +14155551234" — confirmation flow works
- [ ] Reply "yes" — transfer completes
- [ ] Send "history" or check profile — shows all past transactions

### 2.2 Spanish (+57 / +52 / +54 number)

- [ ] Send "hola" — bot greets in Spanish
- [ ] Send "saldo" — balance in Spanish + local currency (COP / MXN / ARS)
- [ ] Send "enviar 15 a +573009876543" — confirmation in Spanish
- [ ] Reply "si" — transfer completes
- [ ] Limit message in Spanish when approaching daily cap

### 2.3 Portuguese (+55 number)

- [ ] Send "oi" — bot greets in Portuguese
- [ ] Send "saldo" — balance in Portuguese + BRL equivalent
- [ ] Send "enviar 10 para +5511888887777" — confirmation in Portuguese
- [ ] Reply "sim" — transfer completes
- [ ] Limit message in Portuguese when approaching daily cap

### 2.4 Language Switching

- [ ] User with ES preference sends message in English — bot switches to English
- [ ] Language persists across sessions after switch
- [ ] Bot notifications (receive alerts) use recipient's stored language

---

## 3. Edge Cases

### 2.5 Address Book / Contacts

- [ ] Share a WhatsApp contact card -- bot saves it ("Contacto(s) guardado(s): Name -> +57...")
- [ ] Send "save contact mom +573001234567" -- bot confirms save
- [ ] Send "guardar contacto papa +573009999999" -- bot confirms save (ES)
- [ ] Send "salvar contato mae +5511999887766" -- bot confirms save (PT)
- [ ] Send "my contacts" / "mis contactos" / "meus contatos" -- lists saved contacts
- [ ] Send "delete contact mom" / "borrar contacto mama" -- deletes contact
- [ ] Send "send 5 to mom" -- resolves alias, shows confirmation with name + phone
- [ ] Send "mandale 5 a [first name only]" -- prefix match resolves full name
- [ ] Send "mandale 5 a [typo]" -- Levenshtein match suggests closest contact
- [ ] Multiple contacts match -- disambiguation list shown
- [ ] No contact match -- "No encontre a X. Responde con el numero..." + stores partial send
- [ ] Reply with phone number after not-found -- completes the send
- [ ] Save contact with own phone number -- "No puedes guardarte a ti mismo"
- [ ] Save 51st contact -- "Alcanzaste el limite de contactos (50)"
- [ ] Send "borrar historial" -- shows history (NOT delete contact -- requires keyword)

### 2.6 Local Currency Sends

- [ ] Send "enviar 2000 pesos a +573001234567" -- converts COP to USDC, shows both in confirmation
- [ ] Send "enviar 2mil pesos a carlos" -- "mil" expands to 2000, converts, confirms with alias
- [ ] Send "send 2k to +573001234567" -- "k" expands to 2000
- [ ] Send "enviar 50 reais para +5511999887766" -- converts BRL to USDC
- [ ] Send "enviar 100 soles a +51999887766" -- converts PEN to USDC
- [ ] Send "enviar 5 dolares a +573001234567" -- no conversion (already USD)
- [ ] Recipient notification shows local equivalent: "0.54 USDC (~2,000 COP)"

---

## 3. Edge Cases

### 3.1 Wrong Format / Invalid Input

- [ ] Send "send" with no amount or recipient — bot asks for clarification
- [ ] Send "send abc to +573001234567" — bot rejects non-numeric amount
- [ ] Send "send 10 to 123" — bot rejects invalid phone (< 10 digits)
- [ ] Send "send 10 to 000000000000000000" — bot rejects invalid phone (> 15 digits)
- [ ] Send "send 10.123 to +573001234567" — bot rejects > 2 decimal places
- [ ] Send "send 0 to +573001234567" — bot rejects zero amount
- [ ] Send "send 15000 to +573001234567" — bot rejects amount > $10,000 hard ceiling
- [ ] Send "send 10 to 0" — bot replies "That doesn't look like a phone number"
- [ ] Send "1.000" ambiguous thousands separator — bot requests clarification
- [ ] Send "send 10,50 to +573001234567" — bot treats comma as decimal (LATAM format), sends $10.50

### 3.2 Media Messages

- [ ] Send a photo — bot responds gracefully (no crash, helpful message)
- [ ] Send a voice note — bot responds gracefully
- [ ] Send a sticker — bot responds gracefully
- [ ] Send a document — bot responds gracefully

### 3.3 Greetings and Social Phrases

- [ ] Send "hi" — bot greets in English (regex, zero LLM cost)
- [ ] Send "hola" — bot greets in Spanish (regex)
- [ ] Send "oi" — bot greets in Portuguese (regex)
- [ ] Send "thanks" / "gracias" / "obrigado" — bot responds politely
- [ ] Send "help" / "ayuda" / "ajuda" — bot shows available commands

### 3.4 Spam and Replay Protection

- [ ] Send 15 messages in < 1 minute — rate limited after 10 (spam protection)
- [ ] Replay a webhook payload — deduplicated, not processed twice

---

## 4. Security

### 4.1 Transaction Confirmation Flow

- [ ] Send > $5 — confirmation prompt shown before execution
- [ ] Send <= $5 — executes immediately (no confirmation needed)
- [ ] Confirmation prompt auto-expires after 2 minutes — "Transfer expired."
- [ ] Reply "no" / "cancelar" / "nao" — transfer cancelled with message
- [ ] Send new command while confirmation pending — old pending tx cancelled, new command processed
- [ ] Only one pending tx per user at a time
- [ ] Large amount (> $500) — confirmation includes "This is a large transfer" warning

### 4.2 Velocity Limits

- [ ] 6th send within 10 minutes — blocked with rate message
- [ ] Exceed $500 total in 1 hour — blocked with hourly limit message
- [ ] 4th unique new recipient in 1 hour — blocked (anti-scatter protection)
- [ ] Velocity messages are trilingual

### 4.3 Self-Send Block

- [ ] Send to own phone number — "You cannot send money to yourself." (EN)
- [ ] "No puedes enviarte dinero a ti mismo." (ES)
- [ ] "Voce nao pode enviar dinheiro para si mesmo." (PT)
- [ ] Self-send blocked before balance check (fail fast)

### 4.4 Concurrent Send Protection

- [ ] Trigger two sends simultaneously from same user — second blocked with "A transfer is already in progress"
- [ ] After first completes, second attempt works normally
- [ ] Stuck send clears after 60s safety timeout

### 4.5 Authentication

- [ ] Expired JWT — web pages show re-auth prompt (not blank screen)
- [ ] JWT with < 3 min remaining — warning shown to user
- [ ] Invalid JWT — rejected, no data leakage
- [ ] Phone in JWT matches canonical E.164 format in DB

---

## 5. Privacy Controls

### 5.1 Toggle Phone Visibility (Settings Page)

- [ ] Default state: phone visible on profile (toggle ON)
- [ ] Toggle OFF — saves via API, confirmation shown
- [ ] Reload settings page — toggle reflects saved state (OFF)
- [ ] Toggle back ON — phone visible again

### 5.2 Toggle Phone Visibility (WhatsApp)

- [ ] Send "privacy off" — bot confirms phone is now hidden (EN)
- [ ] Send "privacidad off" — bot confirms (ES)
- [ ] Send "privacidade off" — bot confirms (PT)
- [ ] Send "privacy on" — bot confirms phone is now visible

### 5.3 Profile Page Respects Privacy

- [ ] Phone hidden: profile shows masked number "\*\*\*1234" + "Private account"
- [ ] Phone visible: profile shows full phone number
- [ ] Wallet address always visible regardless of privacy setting
- [ ] Transaction history always visible (on-chain data)

---

## 6. Dual Currency Display

### 6.1 Colombia (+57)

- [ ] Balance shows USDC + COP equivalent
- [ ] Send confirmation shows amount in USDC + COP
- [ ] COP uses period as thousands separator, comma as decimal (e.g., 42.500,00 COP)

### 6.2 Mexico (+52)

- [ ] Balance shows USDC + MXN equivalent
- [ ] Send confirmation shows amount in USDC + MXN
- [ ] MXN formatting correct for locale

### 6.3 Argentina (+54)

- [ ] Balance shows USDC + ARS equivalent
- [ ] Send confirmation shows amount in USDC + ARS
- [ ] ARS formatting correct for locale

### 6.4 Brazil (+55)

- [ ] Balance shows USDC + BRL equivalent
- [ ] Send confirmation shows amount in USDC + BRL
- [ ] BRL uses period as thousands separator, comma as decimal (e.g., R$ 42.500,00)

### 6.5 US (+1)

- [ ] Balance shows USDC + USD (1:1)
- [ ] No local currency conversion needed

### 6.6 Exchange Rate Cache

- [ ] Rates refresh from open.er-api.com with 24h cache
- [ ] Stale cache gracefully falls back (no crash if API down)

---

## 7. Email Recovery and Limit Upgrade

### 7.1 Add Email

- [ ] Settings page: enter email — verification email sent via Resend
- [ ] Correct 6-digit code entered — email verified, stored in DB
- [ ] Wrong code entered — rejected with message
- [ ] Email already used by another account — blocked (anti-squatting)

### 7.2 Email Verification Gate

- [ ] Unverified user: daily limit is $50/day
- [ ] After email verification: daily limit upgrades to $500/day immediately
- [ ] Settings page shows current tier: "$50/day" or "$500/day"
- [ ] Unverified user sees CTA: "Verify your email to unlock $500/day limit"

### 7.3 WhatsApp Limit Messages

- [ ] Unverified user hits $50 limit — message includes upgrade instructions with sippy.lat/settings link (EN)
- [ ] Same message in ES and PT
- [ ] Verified user hits $500 limit — "Try again tomorrow" (no upgrade CTA)
- [ ] Balance command shows remaining allowance: "Daily limit: $42.50 remaining of $50.00"

### 7.4 Limit Reset

- [ ] Daily limit resets at midnight UTC regardless of tier
- [ ] User verifies email mid-day — new limit applies immediately (not next day)

---

## 8. Web Wallet

### 8.1 Wallet Page (Balance + Activity)

- [ ] Open /wallet — balance card shows USDC + local currency
- [ ] Activity list shows recent transactions (from Blockscout API)
- [ ] Page loads without auth — redirected to setup

### 8.2 Send via Smart Account (Web)

- [ ] Enter phone number + amount — sends USDC via smart account
- [ ] Enter 0x address + amount — sends USDC to raw address
- [ ] Confirmation shown before execution
- [ ] Transaction appears in activity list after completion
- [ ] Insufficient balance — clear error message

### 8.3 Wallet Send Modes

- [ ] Unified wallet: single balance card with address + USDC + ETH display
- [ ] "Free gas" mode: sends via backend spender (POST /api/send), daily limit applies
- [ ] "Direct" mode: sends via sendUserOperation, user pays gas, no limit
- [ ] "Direct" mode blocked with clear message when wallet has no ETH
- [ ] Limit exceeded error guides user to "Direct" mode or lower amount
- [ ] Wallet drift detection: warning banner + sends blocked if backend/CDP addresses diverge
- [ ] Self-send protection: blocks sending to own wallet address

### 8.4 Settings Page

- [ ] Daily limit management — shows current tier and remaining
- [ ] Private key export with sweep-to-EOA flow
- [ ] Recovery email management (add, verify, change)
- [ ] Language selector: English, Espanol, Portugues
- [ ] "Auto-detect" language option reverts to phone-based detection

---

## 9. Language Auto-Detection (Website)

### 9.1 Phone Prefix Mapping

- [ ] +1 number logs in — website loads in English
- [ ] +55 number logs in — website loads in Portuguese
- [ ] +57 number logs in — website loads in Spanish
- [ ] +52 number logs in — website loads in Spanish
- [ ] +54 number logs in — website loads in Spanish

### 9.2 Manual Override

- [ ] Change language in settings — persists across sessions (DB-backed)
- [ ] Manual selection overrides phone-based detection
- [ ] Select "Auto-detect" — reverts to phone prefix language

---

## 10. Admin Dashboard

### 10.1 Analytics

- [ ] /admin/analytics — total USDC volume displayed
- [ ] Fund flow breakdown visible
- [ ] Top users by volume ranked correctly (sent + received)
- [ ] Daily volume chart renders with data

### 10.2 User Management

- [ ] /admin/users — users table with on-chain data (Total Sent, Received, Txs, Last Activity)
- [ ] Click user — detail page with on-chain stats + activity log

---

## 11. Infrastructure

### 11.1 Health Endpoint

- [ ] GET /health — returns JSON with db, uptime, gasRefuel, whatsapp, timestamp
- [ ] DB healthy — `db: 'ok'`
- [ ] GasRefuel balance > 0.05 ETH — `gasRefuel: 'healthy'`
- [ ] No auth required (Railway health check compatible)

### 11.2 Sentry

- [ ] Backend error captured in Sentry with masked PII
- [ ] Frontend error captured in Sentry
- [ ] Phone numbers masked in breadcrumbs, wallet addresses truncated

### 11.3 On-Chain Indexer

- [ ] Ponder indexer running — USDC transfers indexed
- [ ] GasRefuel events indexed
- [ ] Backend wallet sync with retry + backoff working

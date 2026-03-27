# Address Book — Implementation Plan

Contacts/alias system for the WhatsApp bot. Users save nicknames for phone numbers, then use them in sends.

---

## User Stories

```
User: "save mom +573116613414"
Bot:  "✓ Saved mom → +57 311 661 3414"

User: "send $5 to mom"
Bot:  [normal send flow using +573116613414]

User: "send $5 to mami"
Bot:  "Did you mean mom (+57 311 661 3414)? Reply YES to confirm."

User: [shares contact card for "María García" with phone +573001234567]
Bot:  "✓ Saved María García → +57 300 123 4567"

User: "my contacts"
Bot:  "Your contacts:\n• mom → +57 311 661 3414\n• María García → +57 300 123 4567"

User: "delete mom"
Bot:  "✓ Deleted mom"
```

---

## Design Principles

1. **Zero LLM tokens** — all commands handled by regex. Alias resolution is a DB lookup before the send flow. The LLM never sees contact data.
2. **No prompt injection** — contact names are sanitized (alphanumeric + spaces + accented chars only, max 30 chars). Names are never interpolated into LLM prompts. They're only used in regex matching and DB storage.
3. **Fuzzy matching with confirmation** — when an alias doesn't match exactly but is similar to a saved contact (e.g., "mami" ≈ "mama"), the bot asks for confirmation before sending. Uses Levenshtein distance, not LLM.
4. **Trilingual** — save/delete/list commands work in EN/ES/PT.

---

## Database

### New table: `user_contacts`

```sql
CREATE TABLE IF NOT EXISTS user_contacts (
  id SERIAL PRIMARY KEY,
  owner_phone TEXT NOT NULL,           -- E.164 canonical phone of the owner
  alias TEXT NOT NULL,                 -- normalized lowercase alias (e.g., "mom")
  alias_display TEXT NOT NULL,         -- original casing (e.g., "Mom")
  target_phone TEXT NOT NULL,          -- E.164 canonical phone of the contact
  source TEXT NOT NULL DEFAULT 'command', -- 'command' or 'vcard'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(owner_phone, alias)
);

CREATE INDEX idx_user_contacts_owner ON user_contacts(owner_phone);
```

**Constraints:**

- Max 50 contacts per user (prevent abuse)
- Alias: 1-30 chars, alphanumeric + spaces + accented chars only
- Alias normalized to lowercase for lookup, original casing preserved for display
- Target phone must pass `canonicalizePhone()` validation
- Cannot save yourself as a contact (self-send protection)

**Migration file:** `apps/backend/database/migrations/XXXX_create_user_contacts.ts`

---

## Phase 1: Save/Delete/List Commands (Regex Only)

### 1.1 Regex Patterns

**File:** `apps/backend/app/utils/message_parser.ts`

New patterns to add to `COMMAND_PATTERNS`:

```typescript
// Save contact — trilingual
// EN: "save mom +573116613414", "save mom as +573116613414"
// ES: "guardar mamá +573116613414", "guardar mamá como +573116613414"
// PT: "salvar mãe +573116613414", "salvar mãe como +573116613414"
const SAVE_CONTACT_PATTERNS = [
  /^(?:save|add)\s+(.{1,30}?)\s+(?:as\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
  /^(?:guardar|agregar|añadir)\s+(.{1,30}?)\s+(?:como\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
  /^(?:salvar|adicionar)\s+(.{1,30}?)\s+(?:como\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
]

// Delete contact — trilingual
// EN: "delete mom", "remove mom"
// ES: "borrar mamá", "eliminar mamá"
// PT: "apagar mãe", "remover mãe"
const DELETE_CONTACT_PATTERNS = [
  /^(?:delete|remove)\s+(.{1,30})$/i,
  /^(?:borrar|eliminar|quitar)\s+(.{1,30})$/i,
  /^(?:apagar|remover|excluir)\s+(.{1,30})$/i,
]

// List contacts — trilingual
// EN: "contacts", "my contacts", "address book"
// ES: "contactos", "mis contactos", "libreta"
// PT: "contatos", "meus contatos", "agenda"
const LIST_CONTACT_PATTERNS = [
  /^(?:my\s+)?contacts$/i,
  /^(?:address\s*book|phonebook)$/i,
  /^(?:mis\s+)?contactos$/i,
  /^(?:libreta|agenda)$/i,
  /^(?:meus\s+)?contatos$/i,
  /^(?:agenda|caderneta)$/i,
]
```

### 1.2 Name Sanitization (Prompt Injection Prevention)

**File:** `apps/backend/app/utils/contact_sanitizer.ts` (new)

```typescript
/**
 * Sanitize contact alias to prevent prompt injection and DB abuse.
 * - Strips everything except letters, numbers, spaces, accented chars
 * - Trims, collapses whitespace
 * - Max 30 chars
 * - Returns null if empty after sanitization
 */
export function sanitizeAlias(raw: string): string | null {
  // Allow: letters (including accented), numbers, spaces
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Unicode-aware: keeps letters + digits + spaces
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)

  return cleaned.length > 0 ? cleaned : null
}

/**
 * Normalize alias for DB lookup (lowercase, trimmed).
 */
export function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim()
}
```

### 1.3 Contact Service

**File:** `apps/backend/app/services/contact.service.ts` (new)

Responsibilities:

- `saveContact(ownerPhone, alias, targetPhone, source)` — insert/upsert with validation
- `deleteContact(ownerPhone, alias)` — delete by normalized alias
- `listContacts(ownerPhone)` — return all contacts for user (max 50)
- `resolveAlias(ownerPhone, alias)` — exact match lookup
- `fuzzyResolveAlias(ownerPhone, alias)` — fuzzy match with Levenshtein distance

```typescript
import { query } from '#services/db'
import { canonicalizePhone } from '#utils/phone'
import { sanitizeAlias, normalizeAlias } from '#utils/contact_sanitizer'

const MAX_CONTACTS_PER_USER = 50

export interface SavedContact {
  alias: string
  aliasDisplay: string
  targetPhone: string
  source: string
}

export async function saveContact(
  ownerPhone: string,
  rawAlias: string,
  rawTargetPhone: string,
  source: 'command' | 'vcard' = 'command'
): Promise<{ success: true; alias: string; phone: string } | { success: false; error: string }> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return { success: false, error: 'invalid_alias' }

  const targetPhone = canonicalizePhone(rawTargetPhone)
  if (!targetPhone) return { success: false, error: 'invalid_phone' }

  // Self-save protection
  const ownerDigits = ownerPhone.replace(/\D/g, '')
  const targetDigits = targetPhone.replace(/\D/g, '')
  if (ownerDigits === targetDigits) return { success: false, error: 'self_contact' }

  const normalized = normalizeAlias(alias)

  // Check if alias already exists (update vs create)
  const existing = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalized]
  )

  if (existing.rows.length > 0) {
    const oldPhone = existing.rows[0].target_phone
    const newDigits = targetPhone.replace(/\D/g, '')
    const oldDigits = oldPhone.replace(/\D/g, '')

    if (oldDigits === newDigits) {
      // Same phone — no-op, treat as success
      return { success: true, alias, phone: targetPhone }
    }

    // Different phone — require confirmation (caller must handle this)
    return { success: false, error: 'overwrite_conflict', existingPhone: oldPhone }
  }

  // New contact — enforce limit atomically via INSERT ... WHERE count < 50
  const insertResult = await query(
    `INSERT INTO user_contacts (owner_phone, alias, alias_display, target_phone, source)
     SELECT $1, $2, $3, $4, $5
     WHERE (SELECT COUNT(*) FROM user_contacts WHERE owner_phone = $1) < $6
     ON CONFLICT (owner_phone, alias) DO NOTHING`,
    [ownerPhone, normalized, alias, targetPhone, source, MAX_CONTACTS_PER_USER]
  )

  if ((insertResult.rowCount ?? 0) === 0) {
    return { success: false, error: 'limit_reached' }
  }

  return { success: true, alias, phone: targetPhone }
}

/**
 * Force-update an existing alias to a new phone (after user confirms overwrite).
 */
export async function updateContact(
  ownerPhone: string,
  rawAlias: string,
  rawTargetPhone: string,
  source: 'command' | 'vcard' = 'command'
): Promise<{ success: true; alias: string; phone: string } | { success: false; error: string }> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return { success: false, error: 'invalid_alias' }

  const targetPhone = canonicalizePhone(rawTargetPhone)
  if (!targetPhone) return { success: false, error: 'invalid_phone' }

  await query(
    `UPDATE user_contacts SET target_phone = $3, alias_display = $4, source = $5
     WHERE owner_phone = $1 AND alias = $2`,
    [ownerPhone, normalizeAlias(alias), targetPhone, alias, source]
  )

  return { success: true, alias, phone: targetPhone }
}

export async function deleteContact(ownerPhone: string, rawAlias: string): Promise<boolean> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return false

  const result = await query('DELETE FROM user_contacts WHERE owner_phone = $1 AND alias = $2', [
    ownerPhone,
    normalizeAlias(alias),
  ])
  return (result.rowCount ?? 0) > 0
}

export async function listContacts(ownerPhone: string): Promise<SavedContact[]> {
  const result = await query<SavedContact>(
    `SELECT alias, alias_display AS "aliasDisplay", target_phone AS "targetPhone", source
     FROM user_contacts
     WHERE owner_phone = $1
     ORDER BY alias
     LIMIT 50`,
    [ownerPhone]
  )
  return result.rows
}

export async function resolveAlias(ownerPhone: string, rawAlias: string): Promise<string | null> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return null

  const result = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalizeAlias(alias)]
  )
  return result.rows[0]?.target_phone ?? null
}

/**
 * Fuzzy match: returns ALL contacts within Levenshtein distance ≤ 2.
 * If exactly one match → suggest with confirmation.
 * If multiple matches at same distance → force disambiguation (list all).
 * Returns empty array if no close matches.
 */
export async function fuzzyResolveAlias(
  ownerPhone: string,
  rawAlias: string
): Promise<Array<{ aliasDisplay: string; targetPhone: string; distance: number }>> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return []

  const contacts = await listContacts(ownerPhone)
  const normalized = normalizeAlias(alias)

  // Collect all matches within distance ≤ 2
  const matches: Array<{ aliasDisplay: string; targetPhone: string; distance: number }> = []
  for (const contact of contacts) {
    const d = levenshtein(normalized, contact.alias)
    if (d > 0 && d <= 2) {
      matches.push({
        aliasDisplay: contact.aliasDisplay,
        targetPhone: contact.targetPhone,
        distance: d,
      })
    }
  }

  // Sort by distance, then alphabetically for determinism
  matches.sort((a, b) => a.distance - b.distance || a.aliasDisplay.localeCompare(b.aliasDisplay))

  // If best distance has multiple ties, return all ties (force disambiguation)
  if (matches.length <= 1) return matches
  const bestDist = matches[0].distance
  const ties = matches.filter((m) => m.distance === bestDist)
  return ties.length > 1 ? ties : [matches[0]]
}

/**
 * Levenshtein distance — simple, no dependencies.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
```

### 1.4 Command Handlers

**File:** `apps/backend/app/commands/contact_command.ts` (new)

Four handlers:

- `handleSaveContact(senderPhone, alias, targetPhone, lang)` — calls `saveContact()`, handles overwrite conflict via confirmation flow
- `handleConfirmOverwrite(senderPhone, alias, targetPhone, lang)` — calls `updateContact()` after user confirms
- `handleDeleteContact(senderPhone, alias, lang)` — calls `deleteContact()`, returns localized message
- `handleListContacts(senderPhone, lang)` — calls `listContacts()`, formats as bullet list

**Save flow with overwrite protection:**

```
saveContact() returns:
  - success: true              → reply with save_ok
  - error: 'overwrite_conflict' → store pending overwrite, ask confirmation:
      "{alias} is saved as {oldPhone}. Update to {newPhone}? Reply YES."
  - error: 'limit_reached'     → reply with save_limit
  - error: 'self_contact'      → reply with save_self
  - error: 'invalid_*'         → reply with corresponding error
```

The pending overwrite is stored in a `pendingContactOverwrites` Map (similar to `pendingTransactions`):

```typescript
pendingContactOverwrites: Map<string, { alias: string; newPhone: string; timestamp: number }>
```

On YES/SÍ/SIM → call `updateContact()`. Auto-expires after 60s.

**Localized responses (trilingual):**

| Key                | EN                                                                          | ES                                                                            | PT                                                                           |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| save_ok            | ✓ Saved {alias} → {phone}                                                   | ✓ Guardado {alias} → {phone}                                                  | ✓ Salvo {alias} → {phone}                                                    |
| save_invalid_alias | Invalid contact name. Use letters and numbers only.                         | Nombre inválido. Usa solo letras y números.                                   | Nome inválido. Use apenas letras e números.                                  |
| save_invalid_phone | Invalid phone number.                                                       | Número inválido.                                                              | Número inválido.                                                             |
| save_self          | You can't save yourself as a contact.                                       | No puedes guardarte a ti mismo.                                               | Você não pode salvar a si mesmo.                                             |
| save_limit         | You've reached the contact limit (50).                                      | Alcanzaste el límite de contactos (50).                                       | Você atingiu o limite de contatos (50).                                      |
| save_overwrite     | {alias} is saved as {oldPhone}. Update to {newPhone}? Reply YES to confirm. | {alias} está guardado como {oldPhone}. ¿Actualizar a {newPhone}? Responde SÍ. | {alias} está salvo como {oldPhone}. Atualizar para {newPhone}? Responda SIM. |
| save_updated       | ✓ Updated {alias} → {phone}                                                 | ✓ Actualizado {alias} → {phone}                                               | ✓ Atualizado {alias} → {phone}                                               |
| delete_ok          | ✓ Deleted {alias}                                                           | ✓ Borrado {alias}                                                             | ✓ Apagado {alias}                                                            |
| delete_not_found   | Contact "{alias}" not found.                                                | Contacto "{alias}" no encontrado.                                             | Contato "{alias}" não encontrado.                                            |
| list_empty         | No saved contacts yet.                                                      | Sin contactos guardados.                                                      | Sem contatos salvos.                                                         |
| list_header        | Your contacts:                                                              | Tus contactos:                                                                | Seus contatos:                                                               |

### 1.5 Parser Integration

**File:** `apps/backend/app/utils/message_parser.ts`

Add new command types to `ParsedCommand`:

- `{ command: 'save_contact', alias: string, phone: string }`
- `{ command: 'delete_contact', alias: string }`
- `{ command: 'list_contacts' }`

Add the regex patterns to Stage 1 (before LLM fallback). These patterns are checked in the regex pass, so zero LLM cost.

### 1.6 Webhook Routing

**File:** `apps/backend/app/controllers/webhook_controller.ts`

Add to `routeCommand()`:

```typescript
case 'save_contact':
  return handleSaveContact(senderPhone, parsed.alias, parsed.phone, lang)
case 'delete_contact':
  return handleDeleteContact(senderPhone, parsed.alias, lang)
case 'list_contacts':
  return handleListContacts(senderPhone, lang)
```

---

## Phase 2: Alias Resolution in Send Flow

### 2.1 Parser Change — Preserve Raw Recipient

**Problem:** Today, `parseSendMatch()` in `message_parser.ts` calls `canonicalizePhone(recipient)` inline. When the recipient is not a valid phone (e.g., "mom"), it sets `recipientError: 'INVALID_PHONE'` and the raw string is discarded. The webhook controller sees the error and replies with an invalid-phone message before alias resolution can happen.

**Fix:** Modify the send parser to return the **raw recipient string** when phone canonicalization fails, instead of immediately erroring:

**File:** `apps/backend/app/utils/message_parser.ts`

Change `parseSendMatch()` return type to include:

```typescript
interface ParsedSend {
  command: 'send'
  amount: number
  recipient: string | null // canonical phone, or null if not a phone
  recipientRaw: string // always set — the raw extracted text
  recipientError?: string // only set if recipientRaw is also not resolvable
  // ... existing fields
}
```

When the regex extracts a recipient that fails `canonicalizePhone()`:

- Set `recipient: null`
- Set `recipientRaw: rawExtractedText` (preserving the original)
- Do NOT set `recipientError` yet — let the webhook resolve it

### 2.2 Resolution Step in Webhook

**File:** `apps/backend/app/controllers/webhook_controller.ts`

In the send command handling, AFTER parsing but BEFORE routing to `handleSendCommand()`:

```typescript
// If recipient is null but recipientRaw exists, try alias resolution
if (parsed.command === 'send' && !parsed.recipient && parsed.recipientRaw) {
  const raw = parsed.recipientRaw

  // 1. Exact alias match
  const exactPhone = await resolveAlias(senderPhone, raw)
  if (exactPhone) {
    parsed.recipient = exactPhone
    // Falls through to normal handleSendCommand()
  } else {
    // 2. Fuzzy match
    const fuzzyMatches = await fuzzyResolveAlias(senderPhone, raw)

    if (fuzzyMatches.length === 1) {
      // Single close match → ask confirmation
      // Store in pendingTransactions and send confirmation message
      // (see 2.3 below)
    } else if (fuzzyMatches.length > 1) {
      // Multiple tied matches → force disambiguation
      // (see 2.4 below)
    } else {
      // No match at all → set error, fall through to existing error handling
      parsed.recipientError = 'INVALID_PHONE'
    }
  }
}
```

### 2.3 Single Fuzzy Match — Confirmation Flow

Uses the existing `pendingTransactions` Map. When exactly one fuzzy match is found:

1. Store `{ amount, resolvedPhone, fuzzyAlias, originalInput, timestamp, lang }` in `pendingTransactions`
2. Send confirmation message:
   - EN: `Did you mean {alias} ({phone})? Send ${amount} to them? Reply YES to confirm.`
   - ES: `¿Quisiste decir {alias} ({phone})? ¿Enviar ${amount}? Responde SÍ para confirmar.`
   - PT: `Quis dizer {alias} ({phone})? Enviar ${amount}? Responda SIM para confirmar.`
3. On YES/SÍ/SIM → execute send with resolved phone
4. On anything else → cancel

This reuses the existing confirmation flow (same pattern as large-amount confirmation).

### 2.4 Multiple Fuzzy Matches — Disambiguation

When multiple contacts tie at the same Levenshtein distance:

1. Send disambiguation message (no pending transaction stored):
   - EN: `Multiple contacts match "{input}":\n1. {alias1} ({phone1})\n2. {alias2} ({phone2})\nReply with the full name to send.`
   - ES: `Varios contactos coinciden con "{input}":\n1. {alias1} ({phone1})\n2. {alias2} ({phone2})\nResponde con el nombre completo.`
   - PT: `Vários contatos correspondem a "{input}":\n1. {alias1} ({phone1})\n2. {alias2} ({phone2})\nResponda com o nome completo.`
2. User replies with the exact alias → triggers a new send parse → exact match succeeds

---

## Phase 3: WhatsApp Contact Card (vCard) Import

### 3.1 Webhook Handler Extension

**File:** `apps/backend/app/controllers/webhook_controller.ts`

Currently, non-text messages are rejected at line ~943. Modify to handle `type === 'contacts'`:

```typescript
if (message.type === 'contacts' && message.contacts?.length) {
  return handleContactCard(senderPhone, message.contacts, lang)
}
```

### 3.2 vCard Parser

**File:** `apps/backend/app/commands/contact_command.ts`

```typescript
async function handleContactCard(
  senderPhone: string,
  contacts: WhatsAppContact[],
  lang: Language
): Promise<string> {
  const saved: string[] = []
  const skipped: string[] = []

  for (const contact of contacts.slice(0, 5)) {
    // Max 5 contacts per message
    const name = contact.name?.formatted_name
    const phone = contact.phones?.[0]?.phone // First phone number

    if (!name || !phone) continue

    const result = await saveContact(senderPhone, name, phone, 'vcard')
    if (result.success) {
      saved.push(`✓ ${result.alias} → ${formatPhone(result.phone)}`)
    } else if (result.error === 'overwrite_conflict') {
      // Don't silently overwrite — skip and inform the user
      skipped.push(
        `⚠ ${name} already saved with a different number. Use "save ${name} ${phone}" to update.`
      )
    }
  }

  const lines: string[] = []
  if (saved.length > 0) lines.push(`${RESPONSES[lang].vcard_saved}`, ...saved)
  if (skipped.length > 0) lines.push('', ...skipped)

  return lines.length > 0 ? lines.join('\n') : RESPONSES[lang].vcard_no_valid
}
```

### 3.3 Type Updates

**File:** `apps/backend/app/types/index.ts`

Update the WhatsApp message contacts type to include the full vCard structure:

```typescript
contacts?: Array<{
  name: {
    formatted_name: string
    first_name?: string
    last_name?: string
  }
  phones?: Array<{
    phone: string
    type?: string
    wa_id?: string
  }>
}>
```

### 3.4 Localized Responses

| Key            | EN                                                                    | ES                                                                      | PT                                                                 |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| vcard_saved    | Contact(s) saved:                                                     | Contacto(s) guardado(s):                                                | Contato(s) salvo(s):                                               |
| vcard_no_valid | Couldn't save this contact. Make sure it has a name and phone number. | No se pudo guardar el contacto. Asegúrate de que tenga nombre y número. | Não foi possível salvar o contato. Verifique se tem nome e número. |

---

## Security Considerations

### Prompt Injection Prevention

- **Contact names are NEVER passed to the LLM.** All contact operations (save/delete/list/resolve) are handled by regex + DB. The LLM prompt template does not include contact data.
- **Name sanitization** strips all special characters (only Unicode letters, digits, spaces allowed). This prevents injection of control characters, template syntax, or SQL-like payloads.
- **DB queries use parameterized statements** — no string interpolation.

### Abuse Prevention

- **50 contact limit** per user — prevents DB bloat
- **Name length cap** at 30 chars
- **Rate limiting** — save/delete inherit the existing WhatsApp message rate limit (10 msgs/min)
- **Self-save blocked** — can't save your own number as a contact
- **vCard limit** — max 5 contacts per shared vCard message

### Data Privacy

- Contacts are per-user (owner_phone scoped)
- No cross-user contact enumeration
- Contacts are not exposed via any public API
- Delete removes immediately (no soft-delete)

---

## Files Changed / Created

| Action | File                                                                                | Phase   |
| ------ | ----------------------------------------------------------------------------------- | ------- |
| Create | `apps/backend/database/migrations/XXXX_create_user_contacts.ts`                     | 1       |
| Create | `apps/backend/app/utils/contact_sanitizer.ts`                                       | 1       |
| Create | `apps/backend/app/services/contact.service.ts`                                      | 1       |
| Create | `apps/backend/app/commands/contact_command.ts`                                      | 1       |
| Edit   | `apps/backend/app/utils/message_parser.ts` — add regex patterns + new command types | 1       |
| Edit   | `apps/backend/app/controllers/webhook_controller.ts` — route new commands           | 1, 2, 3 |
| Edit   | `apps/backend/app/types/index.ts` — expand contacts type                            | 3       |

---

## Implementation Order

1. **Phase 1** — Save/delete/list (regex + DB). Testable immediately via WhatsApp.
2. **Phase 2** — Alias resolution in sends + fuzzy matching with confirmation. Builds on Phase 1.
3. **Phase 3** — vCard import. Independent of Phase 2, can be done in parallel.

---

## Example Flows

### Happy path: save + send

```
User: save mom +573116613414
Bot:  ✓ Saved mom → +57 311 661 3414

User: send $5 to mom
Bot:  [processes send to +573116613414]
```

### Overwrite protection

```
User: save mom +573116613414
Bot:  ✓ Saved mom → +57 311 661 3414

User: save mom +573001234567
Bot:  mom is saved as +57 311 661 3414. Update to +57 300 123 4567? Reply YES to confirm.

User: yes
Bot:  ✓ Updated mom → +57 300 123 4567
```

### Fuzzy match: single close match

```
User: save mama +573116613414
Bot:  ✓ Saved mama → +57 311 661 3414

User: send $5 to mami
Bot:  Did you mean mama (+57 311 661 3414)? Send $5? Reply YES to confirm.

User: yes
Bot:  [processes send to +573116613414]
```

### Fuzzy match: multiple ties → disambiguation

```
User: save mama +573116613414
User: save maria +573001234567

User: send $5 to mara
Bot:  Multiple contacts match "mara":
      1. mama (+57 311 661 3414)
      2. maria (+57 300 123 4567)
      Reply with the full name to send.

User: send $5 to mama
Bot:  [processes send to +573116613414]
```

### vCard import (new contact)

```
User: [shares contact card: "María García", +573001234567]
Bot:  Contact(s) saved:
      ✓ María García → +57 300 123 4567
```

### vCard import (conflict — does NOT overwrite)

```
User: [shares contact card: "mom", +573001234567]
Bot:  ⚠ mom already saved with a different number. Use "save mom +573001234567" to update.
```

### Edge cases

```
User: save <script>alert('xss')</script> +573116613414
Bot:  ✓ Saved scriptalertxssscript → +57 311 661 3414
      [sanitizer strips all special chars, harmless alias stored]

User: save mom +573116613414  (own number)
Bot:  You can't save yourself as a contact.

User: [saves 50 contacts, then tries to save one more]
Bot:  You've reached the contact limit (50).

User: [saves 50th contact, then tries to update an existing one]
Bot:  mom is saved as +57 311 661 3414. Update to +57 300 123 4567? Reply YES.
      [works — updates don't count against the limit]
```

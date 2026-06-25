/**
 * SMART MODE — intent conditions table
 *
 * Single source of truth for the intents SMART MODE knows about. The prompt
 * builder enumerates this table when constructing the classifier prompt,
 * so adding a new intent = appending an entry here (no prompt edits).
 *
 * Scope is intentionally limited to intents with a safe slot shape — see
 * `SMART_INTENT_SLUGS` in types.ts for the gate. The no-slot family
 * (start, settings, about, list_contacts, withdraw, dashboard,
 * referral_code, quest_status, balance, pay_qr, fund, history, help,
 * greeting, social) lives in SMART because empty slots are trivially
 * safe. Intents that REQUIRE slot data (language, privacy, save_contact,
 * delete_contact, confirm, cancel) stay regex-only until the slot
 * schema can safely carry their fields (detectedLanguage, privacyAction,
 * alias, phone) — extending SMART for them is a slot + conditions +
 * golden-cases change, never just the slugs list.
 *
 * Pattern lifted from Camello `intent-profiles.ts` + hive-mind
 * `intent-conditions.ts`. Each entry carries:
 *   - `slug`: a `SmartIntent` — strict subset of ParsedCommand.command
 *   - `description`: 1-sentence "what user means" — included in prompt
 *   - `requiresSlots`: slots that MUST be present for category='action'.
 *                     Enforced at runtime by `validateSmartAction()`.
 *                     For 'amount', either `slots.amount` (USDC) OR
 *                     `slots.localAmount` (+ `localCurrency`) satisfies it.
 *   - `examples`: 2-5 short phrases in ES/EN/PT — few-shot anchors.
 *   - `notRoutedHere`: phrases that LOOK like this intent but aren't —
 *                     prevents the classifier from over-routing.
 */

import type { SmartIntent } from './types.js'

export interface IntentCondition {
  slug: SmartIntent
  description: string
  /** Slots required for category='action'. Missing → 'ambiguous'. */
  requiresSlots: Array<'amount' | 'recipientRaw'>
  /** Short example utterances — fed as few-shot anchors. */
  examples: string[]
  /** Phrases that look like this intent but should route elsewhere. */
  notRoutedHere?: string[]
}

export const INTENT_CONDITIONS: IntentCondition[] = [
  {
    slug: 'send',
    description:
      'User wants to send value to a person (by alias, phone, or contact name). ' +
      'USDC by default ("5", "$5", "5 dollars"). If the user names a local currency ' +
      '(pesos, reais, soles, lempiras, quetzales, colones, bolivares, guaraníes), ' +
      'extract `slots.localAmount` + `slots.localCurrency` instead of `slots.amount` — ' +
      'FX conversion happens downstream and the wrong slot ships the wrong-currency send.',
    requiresSlots: ['amount', 'recipientRaw'],
    examples: [
      'envía 5 a mateo',
      'mándale 10 a +573001234567',
      'send 5 to carolina',
      'paga 3 a @cafe-norte',
      'pásale 2 a mi mamá',
      // Local-currency send — must extract localAmount + localCurrency, NOT amount.
      'enviar 10 pesos a mi mamá',
    ],
    notRoutedHere: [
      'paga aquí con sippy', // brand copy, not a send command
      'envía mi qr', // → pay_qr
    ],
  },
  {
    slug: 'balance',
    description: 'User wants to know their current USDC balance.',
    requiresSlots: [],
    examples: ['saldo', 'mi saldo', 'cuánto tengo', 'balance', 'what is my balance'],
  },
  {
    slug: 'pay_qr',
    description: 'User wants their personal pay-QR (the URL to /wallet/pay-qr).',
    requiresSlots: [],
    examples: ['mi qr', 'mi código de pago', 'pay link', 'cómo me pagan', 'pay qr'],
    notRoutedHere: [
      'escanea un qr', // generic, not their own
    ],
  },
  {
    slug: 'invite',
    description: 'User wants to invite a friend by phone number.',
    requiresSlots: ['recipientRaw'],
    examples: ['invita a +573001234567', 'invite +1555...', 'convidar +5511...'],
  },
  {
    slug: 'fund',
    description: 'User wants to add money / fund their wallet.',
    requiresSlots: [],
    examples: ['agregar saldo', 'recargar', 'fund', 'agregar fondos', 'top up'],
  },
  {
    slug: 'history',
    description: 'User wants to see their transaction history.',
    requiresSlots: [],
    examples: ['historial', 'transactions', 'mis transacciones', 'history'],
  },
  {
    slug: 'help',
    description: 'User wants to know what Sippy can do.',
    requiresSlots: [],
    examples: ['ayuda', 'help', 'qué puedes hacer', 'ajuda'],
  },
  {
    slug: 'greeting',
    description: 'Pure greeting with no follow-on intent ("hola", "buenas").',
    requiresSlots: [],
    examples: ['hola', 'buenas', 'hey', 'oi', 'qué tal'],
    notRoutedHere: [
      'hola, envíame mi saldo', // mixed — route to balance, not greeting
    ],
  },
  {
    slug: 'social',
    description: 'Politeness / acknowledgment ("gracias", "ok", "dale").',
    requiresSlots: [],
    examples: ['gracias', 'ok', 'dale', 'thanks', 'perfecto'],
  },
  {
    slug: 'dashboard',
    description:
      'User wants to access the web dashboard / account hub at /wallet. Covers "do you have a dashboard?", "how do I access my account?", "is there a panel?". DO NOT route here for `mi cuenta de banco` (bank account) or any non-Sippy account reference.',
    requiresSlots: [],
    examples: [
      'mi cuenta',
      'panel',
      'dashboard',
      'como entro a mi cuenta',
      'no hay un dashboard?',
      'meu painel',
      'how do I access my account',
    ],
    notRoutedHere: [
      'mi cuenta de banco', // bank account, not Sippy
      'mi cuenta de gmail', // external account
    ],
  },
  {
    slug: 'referral_code',
    description:
      "User wants their Sippy Quest invite code (the code they share with friends to earn draw entries). Distinct from `pay_qr` — pay_qr is the code people use to PAY them, referral_code is the code people use to JOIN Sippy under them. Trigger phrases: 'mi código', 'mi código de referido', 'mi código de invitación', 'cómo invito a alguien', 'my referral code'.",
    requiresSlots: [],
    examples: [
      'mi codigo',
      'mi código',
      'mi código de referido',
      'mi código de invitación',
      'cómo invito a alguien',
      'cómo le doy mi código',
      'my referral code',
      'meu código de convite',
    ],
    notRoutedHere: [
      'mi código de pago', // pay_qr — for receiving payments
      'mi qr', // pay_qr
      'invita a juan', // invite — needs a recipient (different intent)
    ],
  },
  {
    slug: 'quest_status',
    description:
      "User wants to know how they're doing on Sippy Quest — their current entries, rank, or progress toward the cap. Distinct from `referral_code` (which returns the share link): this asks ABOUT progress, not for the code itself. Trigger phrases: 'mi quest', 'mis entradas', 'cuántas entradas tengo', 'cómo voy en el quest', 'quest status', 'how am I doing'.",
    requiresSlots: [],
    examples: [
      'mi quest',
      'mis entradas',
      'cuantas entradas tengo',
      'cuántas entradas tengo?',
      'como voy en el quest',
      'cómo voy?',
      'how am I doing',
      'how many entries do I have',
      'meu quest',
      'quantas entradas tenho',
    ],
    notRoutedHere: [
      'mi codigo', // referral_code — asking for the code, not status
      'cuanto tengo', // balance — money balance, not quest entries
      'mi saldo', // balance
    ],
  },
  {
    slug: 'start',
    description:
      "User wants to begin / start using Sippy. Typically a brand-new user typing 'start' or 'comenzar' as the very first message. The handler treats this as a green-light to send onboarding context (setup link for new users, dashboard for onboarded). DO NOT route 'send' or 'enviar' here — those carry value-transfer intent.",
    requiresSlots: [],
    examples: ['start', 'begin', 'comenzar', 'iniciar', 'começar', "let's start", 'empezar'],
    notRoutedHere: [
      'enviar', // → send (needs slots)
      'start sending', // → send / ambiguous
      'iniciar transferencia', // → send (transfer intent)
    ],
  },
  {
    slug: 'settings',
    description:
      "User wants to access Sippy settings (spending limit, revoke permission, export keys) — the /settings page. Trigger phrases: 'settings', 'configuración', 'ajustes', 'mis ajustes', 'cambiar mi límite', 'configurar Sippy'.",
    requiresSlots: [],
    examples: [
      'settings',
      'configuracion',
      'configuración',
      'ajustes',
      'mis ajustes',
      'configurar sippy',
      'cambiar mi limite',
      'configurações',
    ],
    notRoutedHere: [
      'mi cuenta', // → dashboard (account hub, not settings)
      'mi cuenta de banco', // bank account, off-topic
      'cambiar idioma', // → language (slot-bearing, deferred)
    ],
  },
  {
    slug: 'about',
    description:
      "User wants to know what Sippy is / who it is / what it does. Identity questions: 'qué es Sippy', 'quién eres', 'what is sippy', 'about'. NOT a help request (help asks 'how do I do X', about asks 'what is this').",
    requiresSlots: [],
    examples: [
      'about',
      'what is sippy',
      "what's sippy",
      'que es sippy',
      'qué es sippy',
      'acerca',
      'quien eres',
      'quién eres?',
      'who are you',
      'sobre',
      'o que é sippy',
      'quem é você',
    ],
    notRoutedHere: [
      'help', // → help (how-to, not what-is)
      'ayuda', // → help
      'como funciona enviar', // → help (operational)
    ],
  },
  {
    slug: 'pizza_day',
    description:
      "User is asking about Pizza Day Cartagena 2026 — the event Sippy is the payments layer for. Distinct from `about` (which asks about Sippy itself). Trigger phrases: '¿qué es pizza day?', 'pizza day', 'cuéntame del pizza day', 'info pizza day', 'how does pizza day work'. The handler replies with a one-line description + the deep-link to /pizza-day.",
    requiresSlots: [],
    examples: [
      'pizza day',
      'que es pizza day',
      'qué es el pizza day',
      'que es el pizza day',
      'cuéntame del pizza day',
      'info pizza day',
      'how does pizza day work',
      "what's pizza day",
      'que tal pizza day',
    ],
    notRoutedHere: [
      'que es sippy', // → about
      'how do I pay at pizza day', // → help (operational how-to)
      'paga 5 a pizza', // → send (transactional)
    ],
  },
  {
    slug: 'list_contacts',
    description:
      'User wants to see their saved address-book contacts. Trigger phrases: "mis contactos", "my contacts", "agenda", "libreta", "phonebook", "address book", "meus contatos". Distinct from `save_contact`/`delete_contact` which carry slot data — this is the read-only list view.',
    requiresSlots: [],
    examples: [
      'mis contactos',
      'my contacts',
      'contacts',
      'agenda',
      'libreta',
      'phonebook',
      'address book',
      'meus contatos',
      'muéstrame mis contactos',
      'show me my contacts',
    ],
    notRoutedHere: [
      'guarda a juan como amigo', // → save_contact (slot-bearing)
      'borra a juan', // → delete_contact (slot-bearing)
      'contacto de banco', // off-topic, not Sippy contacts
    ],
  },
  {
    slug: 'withdraw',
    description:
      "User wants to cash out / off-ramp from Sippy to fiat. Trigger phrases: 'retirar', 'sacar plata', 'cobrar', 'withdraw', 'cash out', 'offramp'. No slots: the off-ramp flow collects amount and method on its own page. DO NOT route 'send' / 'enviar' here — those go to a person, withdraw exits the platform.",
    requiresSlots: [],
    examples: [
      'withdraw',
      'cash out',
      'offramp',
      'retirar',
      'retirarme',
      'retiro',
      'sacar',
      'sacar mi plata',
      'cobrar',
      'quiero retirar',
      'quiero sacar mi dinero',
      'sacar usdc',
    ],
    notRoutedHere: [
      'enviar 10 a juan', // → send (recipient = person)
      'send 5 to carolina', // → send
      'pagar a juan', // → send / pay
    ],
  },
  {
    slug: 'poap_code',
    description:
      "User wants their POAP claim link — the one we already assigned to their phone (poap_codes.assigned_to_phone) and DM'd them after they were paid at the event. Common ask: they lost the original message and want it again. Trigger phrases: 'mi poap', 'my poap', 'meu poap', 'donde está mi poap', 'where is my poap', 'cadê meu poap', 'mi código de poap', 'claim my poap'. Distinct from `referral_code` (Sippy Quest code) and `pay_qr` (pay-me link).",
    requiresSlots: [],
    examples: [
      'mi poap',
      'my poap',
      'meu poap',
      'donde está mi poap',
      'donde esta mi poap',
      'where is my poap',
      'cadê meu poap',
      'mi código de poap',
      'claim my poap',
      'reclamar mi poap',
    ],
    notRoutedHere: [
      'mi código', // → referral_code (Sippy Quest invite code)
      'mi código de pago', // → pay_qr
      'que es un poap', // → about / out_of_scope (definition, not lookup)
    ],
  },
]

/** Lookup helper. */
export function getCondition(slug: SmartIntent): IntentCondition | undefined {
  return INTENT_CONDITIONS.find((c) => c.slug === slug)
}

/**
 * Language Detection
 *
 * Detects user language from message text with confidence scoring.
 * Only high-confidence detections (>= 0.8) should be persisted.
 */

type Lang = 'en' | 'es' | 'pt';

export interface DetectionResult {
  lang: Lang;
  confidence: number;
}

// Words/phrases that strongly indicate a specific language.
// Ordered by specificity — check Portuguese before Spanish (overlap).
const LANG_SIGNALS: Array<{ lang: Lang; patterns: RegExp[]; weight: number }> = [
  // Portuguese-specific (check first — many PT words overlap with ES)
  {
    lang: 'pt',
    patterns: [
      /\b(obrigad[oa]|por favor|quanto|tenho|meu|minha|carteira|enviar\s+para)\b/i,
      /\b(ajuda|come[cç]ar|hist[oó]rico|configura[cç][aã]o)\b/i,
      /\b(ol[aá]|bom dia|boa tarde|boa noite|tudo bem)\b/i,
      /\b(o que [eé]|como|quero|preciso|posso)\b/i,
    ],
    weight: 0.9,
  },
  // Spanish-specific
  {
    lang: 'es',
    patterns: [
      /\b(gracias|por favor|cu[aá]nto|tengo|mi|enviar\s+a)\b/i,
      /\b(ayuda|comenzar|historial|configuraci[oó]n|ajustes)\b/i,
      /\b(hola|buenos d[ií]as|buenas tardes|buenas noches)\b/i,
      /\b(qu[eé] es|c[oó]mo|quiero|necesito|puedo)\b/i,
    ],
    weight: 0.9,
  },
  // English-specific
  {
    lang: 'en',
    patterns: [
      /\b(thanks|thank you|please|hello|hi|hey|good morning|good evening)\b/i,
      /\b(what is|how do|can i|i want|i need|my wallet)\b/i,
      /\b(send\s+to|check|show|get|the|this|that)\b/i,
    ],
    weight: 0.85,
  },
];

// Ambiguous words that exist in multiple languages — don't count these
const AMBIGUOUS = /^(balance|saldo|start|help|settings|config|ok|si|no|\?|\d+)$/i;

/**
 * Detect language from message text.
 * Returns null for ambiguous/undetectable messages.
 */
export function detectLanguage(text: string): DetectionResult | null {
  const trimmed = text.trim();

  // Very short or purely numeric messages are ambiguous
  if (trimmed.length < 2 || /^\d+$/.test(trimmed)) return null;

  // Single-word ambiguous commands
  if (AMBIGUOUS.test(trimmed)) return null;

  // Score each language
  const scores: Record<Lang, number> = { en: 0, es: 0, pt: 0 };

  for (const { lang, patterns, weight } of LANG_SIGNALS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        scores[lang] += weight;
      }
    }
  }

  // Find the best match
  const entries = Object.entries(scores) as Array<[Lang, number]>;
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));

  // No signals detected
  if (best[1] === 0) return null;

  // If two languages score equally, it's ambiguous
  const secondBest = entries
    .filter(([l]) => l !== best[0])
    .reduce((a, b) => (b[1] > a[1] ? b : a));
  if (secondBest[1] === best[1]) return null;

  // Confidence: ratio of best to total signal strength
  const total = entries.reduce((sum, [, s]) => sum + s, 0);
  const confidence = Math.min(best[1] / Math.max(total, 0.01), 1);

  return { lang: best[0], confidence };
}

/** Minimum confidence threshold for persisting language preference */
export const PERSIST_THRESHOLD = 0.8;

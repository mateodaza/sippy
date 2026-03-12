import type { BrandVoice } from '../brands/types.js';

export interface TweetArchetype {
  id: string;
  pillar: keyof BrandVoice['contentPillars'];
  label: string;
  promptTemplate: string;
}

export const ARCHETYPES: TweetArchetype[] = [
  {
    id: 'product',
    pillar: 'uxShowcase',
    label: 'Product marketing',
    promptTemplate: `Write a tweet that makes someone want to try Sippy. Describe what it does in a way that creates desire — not by explaining features, but by showing how simple it is. Think Apple marketing: show the experience, not the specs. One clear message. Under 200 characters ideally.`,
  },
  {
    id: 'contrast',
    pillar: 'uxShowcase',
    label: 'Old way vs new way',
    promptTemplate: `Write a tweet that contrasts the old/painful way of sending money or saving dollars with Sippy's way. The contrast should make the old way feel absurd. Parallel structure works well. Let the comparison sell — no need to say "revolutionary" or explain why it's better.`,
  },
  {
    id: 'take',
    pillar: 'domainInsights',
    label: 'Hot take',
    promptTemplate: `Write a short, opinionated tweet about a frustrating reality of money/remittances/banking in Latin America. The take MUST connect back to the problem Sippy solves — don't just observe, frame it so the reader thinks "someone should fix this." Punchy, under 200 characters.`,
  },
  {
    id: 'update',
    pillar: 'buildInPublic',
    label: 'Build-in-public update',
    promptTemplate: `Write a short build-in-public tweet about Sippy's progress. Focus on WHAT was shipped or learned, not metrics. Examples: a feature that went live, a decision you made, something that broke and got fixed. NEVER invent numbers — if you don't have real data, talk about the work itself. Raw, short, founder voice.`,
  },
  {
    id: 'question',
    pillar: 'domainInsights',
    label: 'Genuine question',
    promptTemplate: `Write a tweet asking a genuine question about money habits or payment pain points in Latin America. Not rhetorical — something that invites real answers. Keep it short and conversational. The question should relate to the problem space Sippy operates in.`,
  },
  {
    id: 'hook',
    pillar: 'productMilestone',
    label: 'Curiosity hook',
    promptTemplate: `Write a tweet that makes someone curious about Sippy without over-explaining. Tease what it does or why it exists. Think movie trailer — give enough to create interest, not enough to satisfy it. End with something that makes people want to click your profile or follow.`,
  },
  {
    id: 'why',
    pillar: 'productMilestone',
    label: 'Why we built this',
    promptTemplate: `Write a tweet about WHY Sippy exists — the founder motivation, the personal frustration, the moment that sparked it. Not the product pitch, the human reason behind it. Short, honest, specific to LatAm. This should make someone feel the problem.`,
  },
];

/** Map archetype IDs for quick lookup */
const ARCHETYPE_MAP = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(id: string): TweetArchetype | undefined {
  return ARCHETYPE_MAP.get(id);
}

/**
 * Select a random archetype weighted by the brand's content pillars.
 * Avoids picking any archetype from `recentIds` (anti-repetition).
 */
export function selectArchetype(
  brand: BrandVoice,
  recentIds: string[],
): TweetArchetype {
  const recentSet = new Set(recentIds);
  const eligible = ARCHETYPES.filter((a) => !recentSet.has(a.id));

  // If all are excluded (shouldn't happen with 7 archetypes and max 3 recent), fall back to all
  const pool = eligible.length > 0 ? eligible : ARCHETYPES;

  // Build weighted array based on content pillars
  const weighted: { archetype: TweetArchetype; weight: number }[] = pool.map(
    (a) => ({
      archetype: a,
      weight: brand.contentPillars[a.pillar],
    }),
  );

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;

  for (const { archetype, weight } of weighted) {
    random -= weight;
    if (random <= 0) return archetype;
  }

  // Fallback (shouldn't reach here)
  return pool[0];
}

/**
 * Select language weighted by brand config.
 * Spanish ~70%, English ~30% for Sippy.
 */
export function selectLanguage(brand: BrandVoice): 'en' | 'es' {
  if (brand.languages.length === 1) return brand.languages[0];

  // First language in array is primary — give it 70% weight
  return Math.random() < 0.7 ? brand.languages[0] : brand.languages[1];
}

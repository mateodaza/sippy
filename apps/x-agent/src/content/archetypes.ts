import type { BrandVoice } from '../brands/types.js';

export interface TweetArchetype {
  id: string;
  pillar: keyof BrandVoice['contentPillars'];
  label: string;
  promptTemplate: string;
}

export const ARCHETYPES: TweetArchetype[] = [
  {
    id: 'take',
    pillar: 'domainInsights',
    label: 'Hot take',
    promptTemplate: `Write a short, opinionated tweet about a frustrating reality of money/remittances/banking in Latin America. The take should feel like a genuine observation, not a pitch. Think "noticed that..." or "weird how..." framing (Guillermo Rauch style). No hashtags. One thought, punchy.`,
  },
  {
    id: 'update',
    pillar: 'buildInPublic',
    label: 'Build-in-public update',
    promptTemplate: `Write a short build-in-public tweet sharing progress on Sippy. Include a specific metric or milestone (can be small — users, volume, a feature shipped, a bug fixed). Be honest, even if numbers are modest. Pieter Levels style: raw, unpolished, real. No "we're excited" — just state what happened.`,
  },
  {
    id: 'showcase',
    pillar: 'uxShowcase',
    label: 'UX showcase',
    promptTemplate: `Write a tweet that describes the Sippy WhatsApp experience as if you're showing someone your phone screen. Walk through the flow in 1-2 sentences. Make it feel effortless. The point is: "this is the ENTIRE flow" — emphasize simplicity. No jargon.`,
  },
  {
    id: 'question',
    pillar: 'domainInsights',
    label: 'Genuine question',
    promptTemplate: `Write a tweet asking a genuine question about money habits, saving, or payment pain points in Latin America. Not rhetorical — something you'd actually want answers to. Questions drive replies (150x more valuable than likes in the algorithm). Keep it conversational.`,
  },
  {
    id: 'thread_hook',
    pillar: 'domainInsights',
    label: 'Thread hook',
    promptTemplate: `Write a single tweet that could be the opening of a thread (but standalone is fine too). It should tease an interesting insight about money, remittances, or saving in LatAm. End with something that makes people want to know more. Not clickbait — genuinely interesting.`,
  },
  {
    id: 'story',
    pillar: 'buildInPublic',
    label: 'User story',
    promptTemplate: `Write a short tweet telling a brief, specific story about a Sippy user or interaction. Could be anonymous ("a user in Cali..."). Focus on the human moment, not the technology. Keep it concrete — names, cities, amounts make it real.`,
  },
  {
    id: 'contrast',
    pillar: 'domainInsights',
    label: 'Old way vs new way',
    promptTemplate: `Write a tweet that contrasts the old/traditional way of doing something (sending money, saving in dollars, paying internationally) with how Sippy does it. Use a list or parallel structure. The contrast should make the old way feel absurd. No "revolutionary" — let the comparison speak.`,
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

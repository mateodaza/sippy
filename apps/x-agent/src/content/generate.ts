import { generateText } from 'ai';
import { getLLMClient } from '../lib/llm.js';
import { getRecentTweets, getRecentArchetypeIds } from '../lib/context.js';
import { selectArchetype, selectLanguage } from './archetypes.js';
import { critiqueTweet } from './critique.js';
import { config } from '../lib/config.js';
import { getSippyMetrics, formatMetricsContext } from '../lib/metrics.js';
import type { BrandVoice } from '../brands/types.js';
import type { ContentQueueInsert, ContentQueueRow } from '../db/schema.js';

const MODEL = 'meta-llama/llama-3.3-70b-instruct';
const MAX_TWEET_LENGTH = 280;

/**
 * Build the system prompt for tweet generation.
 * Encodes brand voice, tone guardrails, example tweets, and recent history.
 */
function buildSystemPrompt(
  brand: BrandVoice,
  recentTweets: ContentQueueRow[],
  metricsContext: string,
): string {
  const exampleBlock = brand.exampleTweets
    .map((t) => `- ${t}`)
    .join('\n');

  const recentBlock =
    recentTweets.length > 0
      ? recentTweets.map((t) => `- ${t.content}`).join('\n')
      : '(none yet)';

  return `You are a social media writer for ${brand.name} (${brand.handle}). ${brand.personality}

Your tone: ${brand.tone.join(', ')}
NEVER use these words/phrases: ${brand.avoidPatterns.join(', ')}
Topics you cover: ${brand.topics.join(', ')}
Topics you NEVER cover: ${brand.neverTopics.join(', ')}

Casualness level: ${brand.casualnessLevel}/1.0 (higher = more lowercase, incomplete sentences, casual language)

Here are example tweets in your voice:
${exampleBlock}

Your recent tweets (DO NOT repeat these ideas or phrasings):
${recentBlock}

${metricsContext}`;
}

/**
 * Build the user prompt instructing the LLM to write a single tweet.
 */
function buildUserPrompt(
  language: 'en' | 'es',
  archetype: { label: string; promptTemplate: string },
): string {
  return `Write a single tweet in ${language === 'es' ? 'Spanish' : 'English'}. Format: ${archetype.label}. ${archetype.promptTemplate}

Rules:
- Maximum 280 characters (aim for under 200 — shorter is better)
- No hashtags
- No links (links go in replies, not tweets)
- No emojis unless they add genuine meaning
- NEVER invent numbers, user counts, dollar amounts, or metrics. Only use numbers from the REAL SIPPY DATA section above. If there are no real numbers to share, write about the product or the problem instead.
- Every tweet should make someone want to try Sippy, follow the account, or feel the problem Sippy solves. No generic observations.
- Output ONLY the tweet text, nothing else`;
}

/**
 * Call the LLM to generate raw tweet text.
 * Returns the trimmed output string.
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const openrouter = getLLMClient();

  const { text } = await generateText({
    model: openrouter(MODEL),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.9,
    maxTokens: 300,
  });

  return text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Main content generation pipeline.
 *
 * Orchestrates: context loading -> archetype selection -> LLM generation ->
 * length validation (with one retry) -> self-critique -> returns insert-ready row.
 *
 * Returns null if the generated tweet fails the critique threshold,
 * signaling that the caller should retry the entire pipeline.
 */
export async function generateTweet(
  brand: BrandVoice,
): Promise<ContentQueueInsert | null> {
  // 1. Load recent context + real metrics in parallel
  const [recentTweets, recentArchetypeIds, metrics] = await Promise.all([
    getRecentTweets(10),
    getRecentArchetypeIds(3),
    getSippyMetrics(),
  ]);

  const metricsContext = formatMetricsContext(metrics);
  console.log(`[generate] Metrics loaded — ${metrics.totalUsers} users, ${metrics.totalTransactions} txns`);

  // 2. Select archetype and language
  const archetype = selectArchetype(brand, recentArchetypeIds);
  const language = selectLanguage(brand);

  // 3. Build prompts
  const systemPrompt = buildSystemPrompt(brand, recentTweets, metricsContext);
  const userPrompt = buildUserPrompt(language, archetype);

  // 4. Generate tweet
  let content = await callLLM(systemPrompt, userPrompt);

  // 5. Length validation — retry once if over 280 chars
  if (content.length > MAX_TWEET_LENGTH) {
    const shorterPrompt = `${userPrompt}\n\nIMPORTANT: Your previous attempt was ${content.length} characters. It MUST be under 280. Be much shorter.`;
    content = await callLLM(systemPrompt, shorterPrompt);

    // If still too long, hard-truncate (rare, better than discarding)
    if (content.length > MAX_TWEET_LENGTH) {
      content = content.slice(0, MAX_TWEET_LENGTH - 1) + '…';
    }
  }

  // 6. Self-critique
  const critique = await critiqueTweet(content, brand);

  if (critique.score < config.critiqueThreshold) {
    console.log(
      `[generate] Rejected (score ${critique.score}/${config.critiqueThreshold}): "${content}" — ${critique.note}`,
    );
    return null;
  }

  // 7. Build the insert row
  const row: ContentQueueInsert = {
    brand: brand.handle.replace('@', ''),
    archetype: archetype.id,
    content,
    critiqueScore: critique.score,
    critiqueNote: critique.note,
    status: 'queued',
  };

  console.log(
    `[generate] Accepted (score ${critique.score}): [${archetype.id}/${language}] "${content}"`,
  );

  return row;
}

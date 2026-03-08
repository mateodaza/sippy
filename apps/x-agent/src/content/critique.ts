import { generateText } from 'ai';
import { getLLMClient } from '../lib/llm.js';
import type { BrandVoice } from '../brands/types.js';

/** Result of the self-critique pass on a generated tweet. */
export interface CritiqueResult {
  score: number;
  note: string;
}

/**
 * Run a self-critique pass on a generated tweet.
 * Uses a lower temperature for consistent, deterministic scoring.
 * Returns a score (1-10) and a one-sentence explanation.
 */
export async function critiqueTweet(
  tweetContent: string,
  brand: BrandVoice,
): Promise<CritiqueResult> {
  const openrouter = getLLMClient();

  const systemPrompt = `You are a harsh tweet quality reviewer for ${brand.handle}. Most tweets should score 5-7. Only exceptional tweets score 8+. Be critical.

Score criteria:
- Authenticity (3pts): Would a real person tweet this? Does it sound human or AI-generated?
- Brand alignment (3pts): Does it match the voice? (${brand.tone.join(', ')})
- Engagement potential (2pts): Would this get replies, likes, or retweets?
- Bot-detection risk (2pts): Could this tweet get the account flagged as automated?

AUTOMATIC SCORE 1 — reject immediately if:
- Contains specific numbers (user counts, dollar amounts, percentages) that look fabricated or suspiciously round
- Mentions "semana X de beta" or similar fabricated timeline markers
- Contains metrics that sound made up (e.g. "123 usuarios", "$5,600 en volumen")

Red flags that reduce score by 2-3 points each:
- Perfect grammar in every sentence (real people make minor errors)
- Generic platitudes ("the future of finance", "makes no sense")
- Sounds like a press release or corporate announcement
- Too long or over-explained — good tweets are punchy, not blog paragraphs
- Uses any forbidden patterns: ${brand.avoidPatterns.join(', ')}`;

  const userPrompt = `Score this tweet:
"${tweetContent}"

Respond in this exact format:
SCORE: [1-10]
NOTE: [one sentence explanation]`;

  const { text } = await generateText({
    model: openrouter('meta-llama/llama-3.3-70b-instruct'),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
    maxTokens: 150,
  });

  return parseCritiqueResponse(text);
}

/**
 * Parse the LLM critique response into a structured result.
 * Falls back to score 5 with the raw text if parsing fails.
 */
function parseCritiqueResponse(text: string): CritiqueResult {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/);
  const noteMatch = text.match(/NOTE:\s*(.+)/);

  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
  const note = noteMatch ? noteMatch[1].trim() : text.trim();

  return {
    score: Math.min(10, Math.max(1, score)),
    note,
  };
}

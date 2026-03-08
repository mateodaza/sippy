import { TwitterApi } from 'twitter-api-v2';
import { config } from './lib/config.js';

let _client: TwitterApi | null = null;

/** Get or create the singleton X API client. */
function getXClient(): TwitterApi {
  if (!_client) {
    _client = new TwitterApi({
      appKey: config.x.apiKey(),
      appSecret: config.x.apiSecret(),
      accessToken: config.x.accessToken(),
      accessSecret: config.x.accessTokenSecret(),
    });
  }
  return _client;
}

export interface PostResult {
  success: boolean;
  tweetId?: string;
  dryRun: boolean;
  error?: string;
}

/**
 * Post a tweet to X. Respects DRY_RUN gate.
 * When DRY_RUN=true, logs the tweet and returns a mock success.
 * This is the ONLY function that calls the X API — single chokepoint.
 */
export async function postTweet(content: string): Promise<PostResult> {
  if (config.dryRun) {
    console.log(`[post] [dry-run] Would post tweet (${content.length} chars):\n${content}`);
    return { success: true, dryRun: true };
  }

  try {
    const client = getXClient();
    const result = await client.v2.tweet(content);
    console.log(`[post] Tweet ${result.data.id} (${content.length} chars)`);
    return { success: true, tweetId: result.data.id, dryRun: false };
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    // Log full error details for debugging
    if (err?.data) console.error(`[post] X API response data:`, JSON.stringify(err.data));
    if (err?.code) console.error(`[post] X API error code: ${err.code}`);
    if (err?.rateLimit) console.error(`[post] Rate limit:`, JSON.stringify(err.rateLimit));
    console.error(`[post] Failed to post tweet: ${message}`);
    return { success: false, dryRun: false, error: message };
  }
}

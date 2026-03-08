import cron from 'node-cron';
import { sippy } from './brands/sippy.js';
import { isWithinActiveHours } from './lib/active-hours.js';
import { config } from './lib/config.js';
import { addJitter } from './lib/jitter.js';
import { postTweet } from './x-client.js';
import { claimNextTweet, insertTweet, markDryRun, markFailed, markPosted, markRetry, recoverStaleClaims } from './queue.js';
import { generateTweet } from './content/generate.js';
import { getTodayGenerationCount } from './lib/context.js';
import { notifyDraft } from './notify.js';

const MAX_GENERATION_RETRIES = 3;

let generationTask: cron.ScheduledTask | null = null;
let postingTask: cron.ScheduledTask | null = null;

/**
 * Generation cron — runs at configured base times (9am/4pm COT = 14:00/21:00 UTC).
 * Generates a tweet, critiques it, and queues it with jitter.
 */
async function runGenerationCycle(): Promise<void> {
  try {
    const todayCount = await getTodayGenerationCount();
    if (todayCount >= config.tweetsPerDay) {
      console.log(`[generate] Already generated ${todayCount}/${config.tweetsPerDay} today, skipping`);
      return;
    }

    if (!isWithinActiveHours(sippy)) {
      console.log('[generate] Outside active hours, skipping');
      return;
    }

    let result = null;
    for (let attempt = 1; attempt <= MAX_GENERATION_RETRIES; attempt++) {
      console.log(`[generate] Attempt ${attempt}/${MAX_GENERATION_RETRIES}`);
      result = await generateTweet(sippy);

      if (result !== null) {
        break;
      }

      console.log(`[generate] Attempt ${attempt} failed critique`);
    }

    if (result === null) {
      console.warn('[generate] All retries exhausted — no tweet generated today');
      return;
    }

    const scheduledFor = addJitter(new Date(), 1, 30);
    const row = await insertTweet({
      brand: sippy.name.toLowerCase(),
      archetype: result.archetype,
      content: result.content,
      critiqueScore: result.critiqueScore,
      critiqueNote: result.critiqueNote,
      status: 'queued',
      scheduledFor,
    });

    console.log(`[schedule] Queued tweet (archetype: ${result.archetype}) for ${scheduledFor.toISOString()}`);

    // Send draft to Telegram for review
    await notifyDraft({
      id: row.id,
      content: result.content,
      archetype: result.archetype,
      critiqueScore: result.critiqueScore,
      critiqueNote: result.critiqueNote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate] Unhandled error in generation cycle: ${message}`);
  }
}

/**
 * Posting cron — runs every 5 minutes.
 * Claims the next due tweet, posts it (or dry-runs), and updates status.
 */
async function runPostingCycle(): Promise<void> {
  try {
    const recovered = await recoverStaleClaims();
    if (recovered > 0) {
      console.log(`[post] Recovered ${recovered} stale claim(s)`);
    }

    const claimed = await claimNextTweet();
    if (!claimed) {
      return;
    }

    const result = await postTweet(claimed.content);

    if (result.dryRun) {
      await markDryRun(claimed.id);
      return;
    }

    if (result.success && result.tweetId) {
      await markPosted(claimed.id, result.tweetId);
      return;
    }

    // Posting failed — check retry budget
    const nextRetryCount = (claimed.retryCount ?? 0) + 1;
    if (nextRetryCount >= config.maxPostingRetries) {
      await markFailed(claimed.id, result.error ?? 'Unknown error');
    } else {
      await markRetry(claimed.id, result.error ?? 'Unknown error');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[post] Unhandled error in posting cycle: ${message}`);
  }
}

/**
 * Start both cron jobs (generation + posting).
 * Generation: every 4h during waking hours — 8am, 12pm, 4pm, 8pm COT (13:00, 17:00, 21:00, 01:00 UTC).
 * Posting: every 5 minutes.
 */
export function startScheduler(): void {
  // Generation cron — 13:00, 17:00, 21:00, 01:00 UTC (8am, 12pm, 4pm, 8pm COT)
  // Generates 2 drafts per slot (8 total/day) so there's a surplus to pick from
  generationTask = cron.schedule('0 13,17,21,1 * * *', () => {
    void runGenerationCycle();
    void runGenerationCycle();
  });

  // Posting cron — every 5 minutes
  postingTask = cron.schedule('*/5 * * * *', () => {
    void runPostingCycle();
  });

  console.log('[schedule] Scheduler started — generation: 0 13,17,21,1 * * *, posting: */5 * * * *');
}

/**
 * Stop both cron jobs gracefully.
 */
export function stopScheduler(): void {
  if (generationTask) {
    generationTask.stop();
    generationTask = null;
  }
  if (postingTask) {
    postingTask.stop();
    postingTask = null;
  }
  console.log('[schedule] Scheduler stopped');
}

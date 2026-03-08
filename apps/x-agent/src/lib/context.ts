import { desc, inArray, gte, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { contentQueue, ACTIVE_STATUSES, QueueStatus } from '../db/schema.js';
import type { ContentQueueRow } from '../db/schema.js';

/**
 * Fetch the most recent posted or dry_run tweets for anti-repetition context.
 * Ordered by created_at descending (newest first).
 */
export async function getRecentTweets(
  limit: number = 10,
): Promise<ContentQueueRow[]> {
  const db = getDb();

  return db
    .select()
    .from(contentQueue)
    .where(
      inArray(contentQueue.status, [QueueStatus.POSTED, QueueStatus.DRY_RUN]),
    )
    .orderBy(desc(contentQueue.createdAt))
    .limit(limit);
}

/**
 * Extract archetype IDs from the most recent tweets.
 * Used to avoid picking the same archetype consecutively.
 */
export async function getRecentArchetypeIds(
  limit: number = 3,
): Promise<string[]> {
  const recent = await getRecentTweets(limit);
  return recent.map((row) => row.archetype);
}

/**
 * Count non-terminal rows created today (UTC).
 * Used by the generation cron to allow up to tweetsPerDay generations.
 */
export async function getTodayGenerationCount(): Promise<number> {
  const db = getDb();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ id: contentQueue.id })
    .from(contentQueue)
    .where(
      and(
        inArray(contentQueue.status, ACTIVE_STATUSES),
        gte(contentQueue.createdAt, todayStart),
      ),
    );

  return rows.length;
}

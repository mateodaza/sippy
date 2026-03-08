import { eq } from 'drizzle-orm';
import { getPool } from './db/client.js';
import { getDb } from './db/client.js';
import { contentQueue, QueueStatus } from './db/schema.js';
import type { ContentQueueRow, ContentQueueInsert } from './db/schema.js';

/**
 * Atomically claim the next queued tweet whose scheduled time has passed.
 * Uses raw SQL with SKIP LOCKED to prevent double-claiming across workers.
 */
export async function claimNextTweet(): Promise<ContentQueueRow | null> {
  const result = await getPool().query<ContentQueueRow>(
    `UPDATE x_agent.content_queue
     SET status = 'claimed', claimed_at = now(), updated_at = now()
     WHERE id = (
       SELECT id FROM x_agent.content_queue
       WHERE status = 'queued' AND scheduled_for <= now()
       ORDER BY scheduled_for
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
  );

  const row = result.rows[0] ?? null;
  if (row) {
    console.log(`[queue] Claimed tweet ${row.id} (archetype: ${row.archetype})`);
  }
  return row;
}

/**
 * Atomically claim a specific tweet by ID for manual force-posting.
 * Only claims if the tweet is in a re-postable status (queued or dry_run).
 * Prevents race with the posting cron — if the cron already claimed it, this returns null.
 */
export async function claimTweetById(id: string): Promise<ContentQueueRow | null> {
  const result = await getPool().query<ContentQueueRow>(
    `UPDATE x_agent.content_queue
     SET status = 'claimed', claimed_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('queued', 'dry_run')
     RETURNING *`,
    [id],
  );

  const row = result.rows[0] ?? null;
  if (row) {
    console.log(`[queue] Force-claimed tweet ${row.id}`);
  }
  return row;
}

/**
 * Mark a claimed tweet as successfully posted.
 */
export async function markPosted(id: string, tweetId: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentQueue)
    .set({
      status: QueueStatus.POSTED,
      postedAt: new Date(),
      xTweetId: tweetId,
      updatedAt: new Date(),
    })
    .where(eq(contentQueue.id, id));
  console.log(`[queue] Marked ${id} as posted (tweet: ${tweetId})`);
}

/**
 * Mark a claimed tweet as dry-run (not actually posted).
 */
export async function markDryRun(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentQueue)
    .set({
      status: QueueStatus.DRY_RUN,
      postedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentQueue.id, id));
  console.log(`[queue] Marked ${id} as dry_run`);
}

/**
 * Mark a claimed tweet as permanently failed (max retries reached).
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentQueue)
    .set({
      status: QueueStatus.FAILED,
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(contentQueue.id, id));
  console.log(`[queue] Marked ${id} as failed: ${error}`);
}

/**
 * Return a claimed tweet to the queue for retry, incrementing the retry counter.
 */
export async function markRetry(id: string, error: string): Promise<void> {
  await getPool().query(
    `UPDATE x_agent.content_queue
     SET status = 'queued',
         retry_count = retry_count + 1,
         last_error = $1,
         claimed_at = NULL,
         updated_at = now()
     WHERE id = $2`,
    [error, id],
  );
  console.log(`[queue] Returned ${id} to queue for retry: ${error}`);
}

/**
 * Mark a tweet as rejected by the critique step.
 */
export async function markRejected(id: string, note: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentQueue)
    .set({
      status: QueueStatus.REJECTED,
      critiqueNote: note,
      updatedAt: new Date(),
    })
    .where(eq(contentQueue.id, id));
  console.log(`[queue] Marked ${id} as rejected: ${note}`);
}

/**
 * Insert a new tweet into the content queue.
 */
export async function insertTweet(insert: ContentQueueInsert): Promise<ContentQueueRow> {
  const db = getDb();
  const [row] = await db.insert(contentQueue).values(insert).returning();
  console.log(`[queue] Inserted tweet ${row.id} (archetype: ${row.archetype}, scheduled: ${row.scheduledFor?.toISOString() ?? 'now'})`);
  return row;
}

/**
 * Recover tweets that were claimed more than 5 minutes ago but never completed.
 * Returns them to 'queued' status so they can be re-claimed.
 */
export async function recoverStaleClaims(): Promise<number> {
  const result = await getPool().query(
    `UPDATE x_agent.content_queue
     SET status = 'queued', claimed_at = NULL, updated_at = now()
     WHERE status = 'claimed'
       AND claimed_at < now() - interval '5 minutes'`,
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[queue] Recovered ${count} stale claim(s)`);
  }
  return count;
}

/**
 * Get queue statistics for the health endpoint.
 */
export async function getQueueStats(): Promise<{ queued: number; postedToday: number }> {
  const result = await getPool().query<{ queued: string; posted_today: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'queued') AS queued,
       COUNT(*) FILTER (WHERE status IN ('posted', 'dry_run') AND posted_at >= CURRENT_DATE) AS posted_today
     FROM x_agent.content_queue`,
  );
  const row = result.rows[0];
  return {
    queued: parseInt(row.queued, 10),
    postedToday: parseInt(row.posted_today, 10),
  };
}

import { Hono } from 'hono';
import { config } from './lib/config.js';
import { getQueueStats, claimNextTweet, claimTweetById, insertTweet, markDryRun, markPosted, markFailed, markRetry, markRejected } from './queue.js';
import { generateTweet } from './content/generate.js';
import { postTweet } from './x-client.js';
import { sippy } from './brands/sippy.js';
import { addJitter } from './lib/jitter.js';
import { getDb } from './db/client.js';
import { contentQueue, QueueStatus } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { notifyDraft } from './notify.js';

const app = new Hono();

/** Simple API key auth middleware */
function authGuard(c: any, next: () => Promise<void>) {
  const key = c.req.header('x-api-key') ?? c.req.query('key');
  if (key !== config.apiKey()) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
}

// ── Health (no auth) ────────────────────────────────────────────────

app.get('/health', async (c) => {
  try {
    const stats = await getQueueStats();
    return c.json({
      status: 'ok',
      dryRun: config.dryRun,
      queued: stats.queued,
      postedToday: stats.postedToday,
    });
  } catch {
    return c.json({ status: 'error' }, 500);
  }
});

// ── Protected endpoints ─────────────────────────────────────────────

app.use('/generate', authGuard);
app.use('/queue/*', authGuard);
app.use('/queue', authGuard);

/** Manually trigger content generation */
app.post('/generate', async (c) => {
  console.log('[server] Manual generation triggered');
  const result = await generateTweet(sippy);
  if (!result) {
    return c.json({ error: 'Generation failed critique (all retries exhausted)' }, 422);
  }

  const scheduledFor = addJitter(new Date(), 1, 5);
  const row = await insertTweet({ ...result, scheduledFor });

  // Send draft to Telegram
  await notifyDraft({
    id: row.id,
    content: result.content,
    archetype: result.archetype,
    critiqueScore: result.critiqueScore,
    critiqueNote: result.critiqueNote,
  });

  return c.json({ id: row.id, content: row.content, archetype: row.archetype, scheduledFor: row.scheduledFor });
});

/** View queue (recent + pending) */
app.get('/queue', async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentQueue)
    .orderBy(contentQueue.createdAt)
    .limit(50);

  // Reverse so newest is first in response
  rows.reverse();

  return c.json({
    total: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      archetype: r.archetype,
      content: r.content,
      status: r.status,
      critiqueScore: r.critiqueScore,
      scheduledFor: r.scheduledFor,
      postedAt: r.postedAt,
      xTweetId: r.xTweetId,
      retryCount: r.retryCount,
      lastError: r.lastError,
      createdAt: r.createdAt,
    })),
  });
});

/** Force-post a specific tweet (respects DRY_RUN gate) */
app.post('/queue/:id/post', async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  // Check existence + already-posted first
  const rows = await db.select().from(contentQueue).where(eq(contentQueue.id, id));
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404);

  const row = rows[0];
  if (row.status === QueueStatus.POSTED) {
    return c.json({ error: 'Already posted', xTweetId: row.xTweetId }, 409);
  }
  if (row.status === QueueStatus.FAILED || row.status === QueueStatus.REJECTED) {
    return c.json({ error: `Cannot post tweet in '${row.status}' status` }, 409);
  }

  // Atomic claim — prevents race with posting cron
  const claimed = await claimTweetById(id);
  if (!claimed) {
    return c.json({ error: 'Tweet already claimed by another process' }, 409);
  }

  const result = await postTweet(claimed.content);

  if (result.dryRun) {
    await markDryRun(id);
    return c.json({ id, status: 'dry_run', content: claimed.content });
  }

  if (result.success) {
    await markPosted(id, result.tweetId!);
    return c.json({ id, status: 'posted', xTweetId: result.tweetId });
  }

  // Error
  const newRetry = (claimed.retryCount ?? 0) + 1;
  if (newRetry >= config.maxPostingRetries) {
    await markFailed(id, result.error!);
    return c.json({ id, status: 'failed', error: result.error }, 500);
  }
  await markRetry(id, result.error!);
  return c.json({ id, status: 'retry', retryCount: newRetry, error: result.error }, 500);
});

/** Reject a queued tweet */
app.post('/queue/:id/reject', async (c) => {
  const { id } = c.req.param();
  await markRejected(id, 'Manually rejected via API');
  return c.json({ id, status: 'rejected' });
});

export { app };

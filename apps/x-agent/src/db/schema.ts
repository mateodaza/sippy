import { pgSchema, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const xAgentSchema = pgSchema('x_agent');

export const contentQueue = xAgentSchema.table('content_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  brand: text('brand').notNull().default('sippy'),
  archetype: text('archetype').notNull(),
  content: text('content').notNull(),
  critiqueScore: integer('critique_score'),
  critiqueNote: text('critique_note'),
  status: text('status').notNull().default('queued'),
  retryCount: integer('retry_count').notNull().default(0),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
  postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
  xTweetId: text('x_tweet_id'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type ContentQueueRow = typeof contentQueue.$inferSelect;
export type ContentQueueInsert = typeof contentQueue.$inferInsert;

/** Queue status state machine */
export const QueueStatus = {
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  POSTED: 'posted',
  REJECTED: 'rejected',
  FAILED: 'failed',
  DRY_RUN: 'dry_run',
} as const;

export type QueueStatus = (typeof QueueStatus)[keyof typeof QueueStatus];

/** Terminal statuses — posting cron ignores these */
export const TERMINAL_STATUSES: QueueStatus[] = [
  QueueStatus.POSTED,
  QueueStatus.REJECTED,
  QueueStatus.FAILED,
  QueueStatus.DRY_RUN,
];

/** Non-terminal statuses — generation cron checks these for skip logic */
export const ACTIVE_STATUSES: QueueStatus[] = [
  QueueStatus.QUEUED,
  QueueStatus.CLAIMED,
  QueueStatus.DRY_RUN,
];

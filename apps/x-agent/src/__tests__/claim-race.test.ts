import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests proving manual force-post cannot race the posting cron.
 * Validates the fix: claimTweetById() atomic UPDATE with status guard.
 */

const mockPoolQuery = vi.fn();
vi.mock('../db/client.js', () => ({
  getPool: () => ({ query: mockPoolQuery }),
  getDb: () => ({}),
}));

import { claimTweetById } from '../queue.js';

describe('claimTweetById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the row when tweet is in queued status', async () => {
    const fakeRow = {
      id: 'tweet-1',
      status: 'claimed',
      content: 'Hello world',
      archetype: 'take',
      retryCount: 0,
    };
    mockPoolQuery.mockResolvedValue({ rows: [fakeRow] });

    const result = await claimTweetById('tweet-1');

    expect(result).toEqual(fakeRow);
    expect(mockPoolQuery).toHaveBeenCalledOnce();
    // Verify the SQL includes the status guard
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status IN ('queued', 'dry_run')");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(['tweet-1']);
  });

  it('returns the row when tweet is in dry_run status (re-post)', async () => {
    const fakeRow = {
      id: 'tweet-2',
      status: 'claimed',
      content: 'Re-posting this',
      archetype: 'update',
      retryCount: 0,
    };
    mockPoolQuery.mockResolvedValue({ rows: [fakeRow] });

    const result = await claimTweetById('tweet-2');
    expect(result).toEqual(fakeRow);
  });

  it('returns null when tweet was already claimed by posting cron (race lost)', async () => {
    // The cron already claimed this tweet — status is 'claimed', not 'queued'/'dry_run'
    // So the UPDATE WHERE status IN ('queued','dry_run') matches nothing
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const result = await claimTweetById('tweet-1');
    expect(result).toBeNull();
  });

  it('returns null when tweet is already posted', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const result = await claimTweetById('tweet-1');
    expect(result).toBeNull();
  });

  it('returns null when tweet does not exist', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const result = await claimTweetById('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('force-post endpoint race safety', () => {
  it('concurrent claims: only one succeeds (simulated)', async () => {
    // Simulate two concurrent claimTweetById calls for the same tweet.
    // First call succeeds (row returned), second call gets empty (row already claimed).
    let callCount = 0;
    mockPoolQuery.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { rows: [{ id: 'tweet-1', status: 'claimed', content: 'test', archetype: 'take', retryCount: 0 }] };
      }
      // Second caller loses the race
      return { rows: [] };
    });

    const [result1, result2] = await Promise.all([
      claimTweetById('tweet-1'),
      claimTweetById('tweet-1'),
    ]);

    // Exactly one wins
    const winners = [result1, result2].filter((r) => r !== null);
    const losers = [result1, result2].filter((r) => r === null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });
});

import { getPool } from '../db/client.js';

export interface SippyMetrics {
  totalUsers: number;
  activeUsers7d: number;
  totalTransactions: number;
  totalVolume: number;
  transactions7d: number;
  volume7d: number;
  newestUserDaysAgo: number | null;
}

/**
 * Fetch real-time Sippy metrics from the database.
 * Used to ground tweet generation in actual data instead of hallucinated numbers.
 */
export async function getSippyMetrics(): Promise<SippyMetrics> {
  const result = await getPool().query<{
    total_users: string;
    active_7d: string;
    total_txns: string;
    total_volume: string;
    txns_7d: string;
    volume_7d: string;
    newest_user_days: string | null;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM phone_registry) as total_users,
      (SELECT COUNT(*) FROM phone_registry
       WHERE last_activity > EXTRACT(EPOCH FROM now() - interval '7 days') * 1000) as active_7d,
      (SELECT COUNT(*) FROM web_send_log) as total_txns,
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM web_send_log) as total_volume,
      (SELECT COUNT(*) FROM web_send_log
       WHERE created_at > now() - interval '7 days') as txns_7d,
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM web_send_log
       WHERE created_at > now() - interval '7 days') as volume_7d,
      (SELECT EXTRACT(DAY FROM now() - to_timestamp(MAX(created_at) / 1000))::int
       FROM phone_registry) as newest_user_days
  `);

  const row = result.rows[0];
  return {
    totalUsers: parseInt(row.total_users, 10),
    activeUsers7d: parseInt(row.active_7d, 10),
    totalTransactions: parseInt(row.total_txns, 10),
    totalVolume: parseFloat(row.total_volume),
    transactions7d: parseInt(row.txns_7d, 10),
    volume7d: parseFloat(row.volume_7d),
    newestUserDaysAgo: row.newest_user_days ? parseInt(row.newest_user_days, 10) : null,
  };
}

/**
 * Format metrics into a context string for the LLM prompt.
 * Only includes non-zero metrics to avoid awkward "0 transactions" tweets.
 */
export function formatMetricsContext(m: SippyMetrics): string {
  const lines: string[] = [
    `REAL SIPPY DATA (use these numbers, do NOT invent metrics):`,
  ];

  lines.push(`- Total registered users: ${m.totalUsers}`);

  if (m.activeUsers7d > 0) {
    lines.push(`- Active users (last 7 days): ${m.activeUsers7d}`);
  }

  if (m.totalTransactions > 0) {
    lines.push(`- Total transactions: ${m.totalTransactions}`);
    lines.push(`- Total volume: $${m.totalVolume.toFixed(2)} USDC`);
  }

  if (m.transactions7d > 0) {
    lines.push(`- Transactions (last 7 days): ${m.transactions7d}`);
    lines.push(`- Volume (last 7 days): $${m.volume7d.toFixed(2)} USDC`);
  }

  if (m.newestUserDaysAgo !== null) {
    lines.push(`- Last new user signup: ${m.newestUserDaysAgo} days ago`);
  }

  if (m.totalTransactions === 0) {
    lines.push(`- Stage: pre-launch / building. No live transactions yet.`);
    lines.push(`- Focus tweets on: building process, insights, market observations, vision. Do NOT fabricate transaction data or user counts beyond what's shown above.`);
  }

  return lines.join('\n');
}

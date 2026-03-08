import { serve } from '@hono/node-server';
import { app } from './server.js';
import { config } from './lib/config.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { closeDb } from './db/client.js';

const port = config.port;

console.log(`[boot] x-agent starting (dryRun=${config.dryRun}, tweetsPerDay=${config.tweetsPerDay})`);

// Start Hono server
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[boot] Server listening on :${port}`);
});

// Start cron scheduler
startScheduler();
console.log('[boot] Scheduler started');

// Graceful shutdown
function shutdown() {
  console.log('[shutdown] Stopping...');
  stopScheduler();
  server.close(() => {
    closeDb().then(() => {
      console.log('[shutdown] Clean exit');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[shutdown] Forced exit after 10s timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

-- Migration: 0001_x_agent_schema.sql
-- X-Agent content queue for automated tweet generation + posting.
--
-- PREREQUISITE (infrastructure, not migration):
--   CREATE ROLE x_agent_user LOGIN PASSWORD '...';
--   GRANT USAGE ON SCHEMA x_agent TO x_agent_user;
--   GRANT ALL ON ALL TABLES IN SCHEMA x_agent TO x_agent_user;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA x_agent GRANT ALL ON TABLES TO x_agent_user;

CREATE SCHEMA IF NOT EXISTS x_agent;

CREATE TABLE IF NOT EXISTS x_agent.content_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           text NOT NULL DEFAULT 'sippy',
  archetype       text NOT NULL,
  content         text NOT NULL,
  critique_score  integer,
  critique_note   text,
  status          text NOT NULL DEFAULT 'queued',
  retry_count     integer NOT NULL DEFAULT 0,
  claimed_at      timestamptz,
  scheduled_for   timestamptz,
  posted_at       timestamptz,
  x_tweet_id      text,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN x_agent.content_queue.status IS
  'queued → claimed → posted | failed | dry_run. Also: rejected (critique). See QueueStatus in schema.ts.';

-- Partial index for posting cron picker
CREATE INDEX idx_xcq_queued_scheduled ON x_agent.content_queue (scheduled_for)
  WHERE status = 'queued';

-- Partial index for stale claim recovery
CREATE INDEX idx_xcq_claimed ON x_agent.content_queue (claimed_at)
  WHERE status = 'claimed';

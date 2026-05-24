-- Migration 07 â€” Add pid / tid columns to tm_log_events
-- Apply via:
--   docker exec -i truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     < ./sql/init/07-log-events-pid-tid.sql
--
-- L1: The mcp-debug.log format carries pid=N tid=N in every line header
--   (YYYY-MM-DD HH:MM:SS.mmm pid=N tid=N <signal> <body>).
-- The mirror's parseLogLine regex already captured these groups but discarded
-- them. Adding the columns here lets bulkInsertLogEvents store them for process
-- attribution â€” useful when multiple TrueMemory workers run concurrently.
--
-- Both columns are nullable so existing rows (written before this migration)
-- retain NULL values with no backfill required. The mirror will populate pid/tid
-- on all new rows after this migration is applied.

ALTER TABLE tm_log_events
  ADD COLUMN IF NOT EXISTS pid INTEGER NULL,
  ADD COLUMN IF NOT EXISTS tid INTEGER NULL;

-- Optional index â€” useful if you ever query by pid to isolate a specific
-- worker's log stream. Low-cardinality column so a partial index isn't needed.
CREATE INDEX IF NOT EXISTS idx_tm_log_events_pid ON tm_log_events (pid) WHERE pid IS NOT NULL;

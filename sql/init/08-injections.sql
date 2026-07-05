-- Init 08 — Injections table (chat-open memory context feed)
-- Mirrors ~/.truememory/injections.log (JSONL) into Postgres so the dashboard
-- can render the injection feed (session_start / user_prompt_submit / stop /
-- compact / smoke_test events) without re-tailing the log per poll.
--
-- The log is append-only JSONL with per-hook records; the tailer in
-- src/mirror/truememory.ts:syncInjectionsLog uses a byte-offset watermark
-- against tm_mirror_state (source_table='injections.log') and dedupes on
-- raw_line_hash so re-tails after rotation don't duplicate rows.
--
-- Apply via:
--   docker exec -i truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     < ./sql/init/08-injections.sql

-- ============================================================================
-- tm_injections — one row per JSONL record in ~/.truememory/injections.log
-- ============================================================================
CREATE TABLE IF NOT EXISTS tm_injections (
    id             BIGSERIAL PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL,
    hook           TEXT NOT NULL,
    session_id     TEXT NULL,
    action         TEXT NULL,
    memory_count   INT NULL,
    char_count     INT NULL,
    query          TEXT NULL,
    preview        TEXT NULL,
    full_content   TEXT NULL,
    extra          JSONB NULL,
    -- raw_line_hash: sha1 hex of the raw JSONL line. Dedup guard so re-tails
    -- after log rotation (mcp-debug.log-style shrink → offset reset → replay)
    -- can't produce duplicate rows. Also lets us idempotently retry a failed
    -- batch by re-parsing the same lines.
    raw_line_hash  TEXT NOT NULL UNIQUE,
    mirrored_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed ordering (dashboard /injections endpoint) — DESC by wall-clock ts.
CREATE INDEX IF NOT EXISTS tm_injections_ts_desc
    ON tm_injections (ts DESC);

-- Grouping by session (session_start → user_prompt_submit → stop sequence).
CREATE INDEX IF NOT EXISTS tm_injections_session_id
    ON tm_injections (session_id);

-- ============================================================================
-- Grants
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        GRANT SELECT ON tm_injections TO claude_usage_ro;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage') THEN
        GRANT INSERT ON tm_injections TO claude_usage;
        GRANT USAGE, SELECT ON SEQUENCE tm_injections_id_seq TO claude_usage;
    END IF;
END
$$;

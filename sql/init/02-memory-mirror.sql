-- Migration 03 â€” Postgres mirror of ~/.truememory/memories.db for the MEMORY dashboard tab
-- Apply via:
--   docker exec -i truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     < ./sql/init/03-memory-mirror.sql
--
-- Why mirror at all: memories.db is SQLite + has the sqlite-vec extension
-- loaded; opening it from the Express server would (a) require sqlite-vec on
-- the server box, (b) risk lock contention with the live MCP server which
-- holds a writer connection, and (c) ship JSON over a Python-shaped schema.
-- Mirroring into Postgres lets the dashboard reuse the existing pg client /
-- read-only role / query layer with zero new auth surface.
--
-- Defense in depth: this migration only ever runs in the writer role and is
-- idempotent (IF NOT EXISTS everywhere). The mirror process opens
-- memories.db with mode=ro URI form per the read-only-discipline
-- note â€” a default-rw probe once corrupted a sibling sqlite file via WAL
-- state mismatch.

-- ============================================================================
-- tm_memories â€” mirror of ~/.truememory/memories.db `messages` table
-- ============================================================================
-- The native `messages` table does NOT carry salience / last_retrieved_at /
-- retrieval_count columns â€” those are derived from the `telemetry` table by
-- the mirror process at sync time:
--   salience          = AVG(telemetry.value_num) where signal='salience'
--   retrieval_count   = COUNT(*) where signal='memory_returned'
--   last_retrieved_at = MAX(ts) where signal='memory_returned'
-- The mirror still stores the raw native columns (sender, category, etc.)
-- alongside, so derived columns stay computable in pure SQL on the pg side
-- once the next telemetry tick arrives.
CREATE TABLE IF NOT EXISTS tm_memories (
    id                   BIGINT PRIMARY KEY,
    content              TEXT NOT NULL,
    category             TEXT,
    sender               TEXT,
    recipient            TEXT,
    modality             TEXT,
    emotional_valence    NUMERIC,
    salience             NUMERIC,
    created_at           TIMESTAMPTZ,
    last_retrieved_at    TIMESTAMPTZ NULL,
    retrieval_count      INTEGER NOT NULL DEFAULT 0,
    is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
    embedding_dim        INTEGER NULL,
    embedding            BYTEA NULL,
    mirrored_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_memories_category_salience
    ON tm_memories (category, salience DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tm_memories_last_retrieved
    ON tm_memories (last_retrieved_at);
CREATE INDEX IF NOT EXISTS idx_tm_memories_created_at
    ON tm_memories (created_at);
CREATE INDEX IF NOT EXISTS idx_tm_memories_retrieval_count
    ON tm_memories (retrieval_count);

-- ============================================================================
-- tm_telemetry â€” mirror of the in-memories.db `telemetry` table
-- ============================================================================
-- Source schema (memories.db inspection 2026-05-21):
--   telemetry(id INT, ts REAL epoch-float, pid INT, signal TEXT,
--             memory_id INT, value_num REAL, value_text TEXT, context_json TEXT)
-- Empty table is created unconditionally so endpoints don't error out on
-- environments where the truememory-diag overlay has never run.
CREATE TABLE IF NOT EXISTS tm_telemetry (
    id           BIGINT PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL,
    signal       TEXT NOT NULL,
    lane         TEXT,             -- store | search | lifecycle | ops | gate (derived from signal)
    memory_id    BIGINT NULL,
    value_num    NUMERIC NULL,
    value_text   TEXT NULL,
    raw_blob     JSONB NULL,       -- parsed context_json
    mirrored_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_telemetry_ts        ON tm_telemetry (ts);
CREATE INDEX IF NOT EXISTS idx_tm_telemetry_signal_ts ON tm_telemetry (signal, ts);
CREATE INDEX IF NOT EXISTS idx_tm_telemetry_memory_id ON tm_telemetry (memory_id);
CREATE INDEX IF NOT EXISTS idx_tm_telemetry_lane_ts   ON tm_telemetry (lane, ts);

-- ============================================================================
-- tm_log_events â€” parsed events from ~/.truememory/logs/mcp-debug.log
-- ============================================================================
-- Format (per truememory-viz debug_log.py):
--   YYYY-MM-DD HH:MM:SS.mmm pid=N tid=N <signal> <body>
-- The mirror watermarks by byte offset, parses regex-extractable timing +
-- memory_id, and inserts here.
CREATE TABLE IF NOT EXISTS tm_log_events (
    id           BIGSERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL,
    level        TEXT,            -- debug | info | warn | error (heuristic from body)
    event_type   TEXT NOT NULL,   -- store | search | forget | heartbeat | _backlog_drainer | etc.
    phase        TEXT,            -- enter | exit | add | get_memory | other (store sub-phase)
    memory_id    BIGINT NULL,
    duration_ms  INTEGER NULL,
    message      TEXT,            -- body[:200]
    raw_line     TEXT             -- the full original log line for forensic trail
);

CREATE INDEX IF NOT EXISTS idx_tm_log_events_ts          ON tm_log_events (ts);
CREATE INDEX IF NOT EXISTS idx_tm_log_events_event_type  ON tm_log_events (event_type);
CREATE INDEX IF NOT EXISTS idx_tm_log_events_event_ts    ON tm_log_events (event_type, ts);

-- ============================================================================
-- tm_mirror_state â€” sync watermarks per source
-- ============================================================================
-- Pattern matches existing `ingest_state` (used by the OTLP-to-PG ingester).
-- Sources are logical names:
--   'messages'         â†’ tm_memories rowid watermark
--   'telemetry'        â†’ tm_telemetry rowid watermark
--   'mcp-debug.log'    â†’ byte-offset watermark (last_rowid stores file offset)
CREATE TABLE IF NOT EXISTS tm_mirror_state (
    source_table     TEXT PRIMARY KEY,
    last_rowid       BIGINT NOT NULL DEFAULT 0,
    last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_mirrored    BIGINT NOT NULL DEFAULT 0
);

-- ============================================================================
-- Grants â€” keep read-only role accessible after migration
-- ============================================================================
-- `claude_usage_ro` is created in 01-schema.sql with default-SELECT privileges;
-- new tables only need an explicit GRANT for the existing role. The DO block
-- swallows the missing-role case so re-runs on a fresh container still work.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        GRANT SELECT ON tm_memories, tm_telemetry, tm_log_events, tm_mirror_state
            TO claude_usage_ro;
    END IF;
END
$$;

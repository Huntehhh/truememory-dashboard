-- Migration 06 â€” Open Loops table (Observatory Gap 3)
-- Moves the static getMemoryOpenLoops() array to Postgres so cards can be
-- updated / extended without a code deploy.
--
-- Apply via:
--   docker exec -i truememory-dashboard-pg psql -U claude_usage -d claude_usage \
--     < ./sql/init/06-open-loops.sql

-- ============================================================================
-- tm_open_loops â€” persistent open-loop cards for the Observatory dashboard
-- ============================================================================
CREATE TABLE IF NOT EXISTS tm_open_loops (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    body             TEXT NOT NULL,
    activation_text  TEXT NOT NULL DEFAULT '',
    severity         TEXT NOT NULL DEFAULT 'info'   CHECK (severity IN ('info', 'warn', 'crit')),
    lane             TEXT NOT NULL DEFAULT 'slate',
    last_fired_at    TIMESTAMPTZ NULL,
    activation_count INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Seed â€” exact strings from the retired static array in getMemoryOpenLoops()
-- ============================================================================
INSERT INTO tm_open_loops (id, title, body, activation_text, severity, lane)
VALUES
  (
    'Supersession',
    'Supersession chains never fire',
    'When a new memory contradicts or refines an older one, supersession should link them and lower the older memory effective salience. Today: zero supersession_recorded events. The signal infrastructure is present (telemetry slot reserved) but consolidate() never calls it.',
    'Wire consolidate() into the Stop hook to compare new memories against the top-K most-similar existing memories and emit supersession when content disagreement is detected.',
    'warn',
    'slate'
  ),
  (
    'Episodes',
    'Episode assignment is unused',
    'Episodes group memories that share a session-context window. Useful for "what was I working on when I learned this." All memories currently land with episode_id=NULL.',
    'Add an episode_id heuristic during ingest: same session within a 30-minute window of the most recent stored memory in that session.',
    'info',
    'slate'
  ),
  (
    'Landmarks',
    'Landmark events never marked',
    'Landmarks are the high-salience milestones the retrieval system should anchor toward (a decision, a fix, a breakthrough). The telemetry signal exists; nothing emits it.',
    'Emit a landmark_recorded event when salience > 0.85 AND memory_returned count for the source session > 3 within the next 7 days.',
    'info',
    'slate'
  ),
  (
    'Native surprise',
    'Native surprise scoring is silent',
    'Surprise is currently approximated from gate pred_error. Native surprise (actual prediction-vs-outcome delta on retrieval) never fires because retrieval does not feed back into the encoding model.',
    'After every memory_returned event, log surprise = 1 - cosine(predicted_top_k_at_store_time, actual_top_k_at_retrieve_time). Requires storing predicted neighbors at store time.',
    'info',
    'slate'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Grants
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        GRANT SELECT ON tm_open_loops TO claude_usage_ro;
    END IF;
    -- rw role gets UPDATE on the activity-tracking columns only
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage') THEN
        GRANT UPDATE (last_fired_at, activation_count) ON tm_open_loops TO claude_usage;
    END IF;
END
$$;

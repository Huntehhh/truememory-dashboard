-- Init 07 — Materialized views for hot memory-dashboard queries
-- ============================================================================
-- Why matviews: the /api/memory/* queries are read-heavy aggregates over
-- tm_memories / tm_telemetry / tm_log_events. Running them on every dashboard
-- poll (every 10-30s) is slow; pre-aggregating drops the read side to <10ms.
--
-- Refresh strategy: src/refresh/matviews.ts uses REFRESH MATERIALIZED VIEW
-- CONCURRENTLY for every view (each has a unique index, so readers stay live).
-- All views are created WITH NO DATA so init applies instantly; the first
-- refresh populates them.
-- ============================================================================

-- ---------- mv_memory_kpi ---------------------------------------------------
-- Single-row KPI strip. Constant `bucket` column makes CONCURRENTLY valid.
DROP MATERIALIZED VIEW IF EXISTS mv_memory_kpi CASCADE;
CREATE MATERIALIZED VIEW mv_memory_kpi AS
WITH params AS (
  SELECT
    NOW() - INTERVAL '7 days'  AS week_start,
    NOW() - INTERVAL '14 days' AS prior_week_start
)
SELECT
  1::int                                                                       AS bucket,
  (SELECT COUNT(*)::bigint FROM tm_memories)                                   AS total_memories,
  (
    SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                ELSE SUM(CASE WHEN value_text = 'pass' THEN 1 ELSE 0 END)::numeric / COUNT(*)
           END
    FROM tm_telemetry, params
    WHERE signal IN ('gate_decision','gate_eval') AND ts >= params.week_start
  )::numeric                                                                    AS gate_pass_rate,
  -- gate_pass_rate_delta_pts: this-week pass rate minus prior-week (7-14d ago),
  -- expressed in percentage POINTS (e.g. +4 means +4pts). NULL when either
  -- window has zero gate rows — the gate_decision/gate_eval signals are not
  -- emitted by stock TrueMemory, so this is typically NULL (graceful-empty).
  (
    SELECT CASE
             WHEN this_n = 0 OR prior_n = 0 THEN NULL
             ELSE (this_pass::numeric / this_n - prior_pass::numeric / prior_n) * 100.0
           END
    FROM (
      SELECT
        SUM(CASE WHEN ts >= p.week_start AND value_text = 'pass' THEN 1 ELSE 0 END)                       AS this_pass,
        SUM(CASE WHEN ts >= p.week_start THEN 1 ELSE 0 END)                                               AS this_n,
        SUM(CASE WHEN ts >= p.prior_week_start AND ts < p.week_start AND value_text = 'pass' THEN 1 ELSE 0 END) AS prior_pass,
        SUM(CASE WHEN ts >= p.prior_week_start AND ts < p.week_start THEN 1 ELSE 0 END)                   AS prior_n
      FROM tm_telemetry, params p
      WHERE signal IN ('gate_decision','gate_eval') AND ts >= p.prior_week_start
    ) g
  )::numeric                                                                    AS gate_pass_rate_delta_pts,
  (
    SELECT COUNT(*)::bigint
    FROM tm_telemetry, params
    WHERE signal = 'memory_returned' AND ts >= params.week_start
  )                                                                             AS retrieved_7d,
  (
    SELECT (COALESCE(pg_total_relation_size('tm_memories'), 0)
          + COALESCE(pg_total_relation_size('tm_telemetry'), 0)
          + COALESCE(pg_total_relation_size('tm_log_events'), 0))::bigint
  )                                                                             AS db_size_bytes,
  (
    SELECT COUNT(*)::bigint FROM tm_memories, params WHERE created_at >= params.week_start
  )                                                                             AS growth_this_week,
  -- growth_pct_7d: fractional change in corpus size vs 7 days ago.
  -- baseline = total rows whose created_at is older than week_start; the
  -- newer rows are the numerator. NULL when the baseline is 0 (cold corpus)
  -- so the frontend renders an em-dash instead of a divide-by-zero spike.
  (
    SELECT CASE WHEN baseline = 0 THEN NULL
                ELSE added::numeric / baseline
           END
    FROM (
      SELECT
        COUNT(*) FILTER (WHERE created_at >= p.week_start)                          AS added,
        COUNT(*) FILTER (WHERE created_at IS NOT NULL AND created_at < p.week_start) AS baseline
      FROM tm_memories, params p
    ) gp
  )::numeric                                                                    AS growth_pct_7d
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_memory_kpi_bucket ON mv_memory_kpi (bucket);

-- ---------- mv_memory_by_category_30d ---------------------------------------
-- retrievals_7d: per-category count of memory_returned telemetry events in the
-- last 7 days, joined memory_id -> tm_memories.category. memory_returned is a
-- live signal (flows on stock TrueMemory), so this column lights up with real
-- data. The category key matches the COALESCE(NULLIF(category,''),
-- '(uncategorized)') projection below so the LEFT JOIN aligns 1:1.
DROP MATERIALIZED VIEW IF EXISTS mv_memory_by_category_30d CASCADE;
CREATE MATERIALIZED VIEW mv_memory_by_category_30d AS
WITH retr_7d AS (
  SELECT
    COALESCE(NULLIF(m.category, ''), '(uncategorized)') AS category,
    COUNT(*)::bigint                                    AS retrievals_7d
  FROM tm_telemetry t
  JOIN tm_memories m ON m.id = t.memory_id
  WHERE t.signal = 'memory_returned'
    AND t.memory_id IS NOT NULL
    AND t.ts >= NOW() - INTERVAL '7 days'
  GROUP BY 1
)
SELECT
  COALESCE(NULLIF(m.category, ''), '(uncategorized)')                   AS category,
  COUNT(*)::bigint                                                       AS count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.salience)               AS median_salience,
  COALESCE(r.retrievals_7d, 0)::bigint                                  AS retrievals_7d
FROM tm_memories m
LEFT JOIN retr_7d r
  ON r.category = COALESCE(NULLIF(m.category, ''), '(uncategorized)')
WHERE m.created_at IS NULL OR m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, r.retrievals_7d
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_memory_by_category_30d_cat ON mv_memory_by_category_30d (category);

-- ---------- mv_memory_operations --------------------------------------------
-- Single-row latency snapshot. CTE-heavy (~5 sub-selects); strong matview candidate.
DROP MATERIALIZED VIEW IF EXISTS mv_memory_operations CASCADE;
CREATE MATERIALIZED VIEW mv_memory_operations AS
WITH
rerank AS (
  SELECT
    PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY duration_ms)  AS p50,
    PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)  AS p95
  FROM tm_log_events
  WHERE event_type IN ('search','reranker','reranker_done')
    AND duration_ms IS NOT NULL
    AND ts >= NOW() - INTERVAL '24 hours'
),
llm AS (
  SELECT
    COUNT(*)                                                    AS call_count,
    PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY duration_ms)  AS p50
  FROM tm_log_events
  WHERE event_type IN ('llm_call','store','m.add()')
    AND duration_ms IS NOT NULL
    AND ts >= NOW() - INTERVAL '24 hours'
),
drainer AS (
  SELECT COUNT(*) AS backlog
  FROM tm_log_events
  WHERE event_type IN ('_backlog_drainer','backlog-drainer','backlog_drainer')
    AND ts >= NOW() - INTERVAL '1 hour'
),
failures AS (
  SELECT COUNT(*) AS fail_count
  FROM tm_log_events
  WHERE (event_type = 'parallel_search' AND message LIKE '%FAIL%')
     OR level = 'error'
  AND ts >= NOW() - INTERVAL '24 hours'
),
ingest AS (
  SELECT COUNT(*)::numeric / 24.0 AS per_hour
  FROM tm_memories
  WHERE created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
  1::int                                  AS bucket,
  (SELECT p50 FROM rerank)::numeric        AS reranker_p50_ms,
  (SELECT p95 FROM rerank)::numeric        AS reranker_p95_ms,
  (SELECT call_count FROM llm)::bigint     AS llm_call_count,
  (SELECT p50 FROM llm)::numeric           AS llm_call_p50_ms,
  (SELECT backlog FROM drainer)::bigint    AS drainer_backlog,
  (SELECT fail_count FROM failures)::bigint AS failure_count_24h,
  (SELECT per_hour FROM ingest)::numeric   AS ingester_throughput
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_memory_operations_bucket ON mv_memory_operations (bucket);

-- ============================================================================
-- Grants — keep claude_usage_ro able to read the matviews
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_usage_ro') THEN
        GRANT SELECT ON
          mv_memory_kpi,
          mv_memory_by_category_30d,
          mv_memory_operations
        TO claude_usage_ro;
    END IF;
END
$$;

-- Belt-and-suspenders default grant for any future matviews.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_usage_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_usage_ro;

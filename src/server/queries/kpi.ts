/**
 * KPI strip for the Memory Overview tab.
 * See ./types.ts for the exported MemoryKpi shape.
 */
import type { MemoryKpi, PgRunner } from './types.js';
import { intOrNull, numOrNull } from './types.js';

export async function getMemoryKpi(client: PgRunner): Promise<MemoryKpi> {
  // Matview fast-path. Falls back to the raw multi-CTE query if the matview
  // is empty (not yet refreshed).
  try {
    const res = await client.query(
      `SELECT total_memories, gate_pass_rate, gate_pass_rate_delta_pts,
              retrieved_7d, db_size_bytes, growth_this_week, growth_pct_7d
         FROM mv_memory_kpi WHERE bucket = 1`,
    );
    const row = res.rows[0];
    if (row) {
      return kpiRowToShape(row);
    }
  } catch {
    // matview missing — fall through to raw
  }
  const sql = `
    WITH params AS (
      SELECT
        NOW() - INTERVAL '7 days'  AS week_start,
        NOW() - INTERVAL '14 days' AS prior_week_start
    )
    SELECT
      (SELECT COUNT(*) FROM tm_memories)                                          AS total_memories,
      (
        SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                    ELSE SUM(CASE WHEN value_text = 'pass' THEN 1 ELSE 0 END)::numeric / COUNT(*)
               END
        FROM tm_telemetry, params
        WHERE signal IN ('gate_decision','gate_eval') AND ts >= params.week_start
      )                                                                            AS gate_pass_rate,
      -- this-week minus prior-week gate pass rate, in percentage POINTS.
      -- NULL when either window is empty (gate signals not emitted by stock
      -- TrueMemory) so the frontend hides the delta instead of showing 0.
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
      )                                                                            AS gate_pass_rate_delta_pts,
      (
        SELECT COUNT(*)
        FROM tm_telemetry, params
        WHERE signal = 'memory_returned' AND ts >= params.week_start
      )                                                                            AS retrieved_7d,
      (
        SELECT COALESCE(pg_total_relation_size('tm_memories'), 0)
              + COALESCE(pg_total_relation_size('tm_telemetry'), 0)
              + COALESCE(pg_total_relation_size('tm_log_events'), 0)
      )                                                                            AS db_size_bytes,
      (
        SELECT COUNT(*) FROM tm_memories, params WHERE created_at >= params.week_start
      )                                                                            AS growth_this_week,
      -- fractional corpus growth vs 7d ago; NULL on a cold corpus (baseline=0).
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
      )                                                                            AS growth_pct_7d
  `;
  const res = await client.query(sql);
  const row = res.rows[0] ?? {};
  return kpiRowToShape(row);
}

// Shared row->MemoryKpi mapper for both the matview fast-path and the raw
// fallback (identical column set). Derives added_this_week (alias of
// growth_this_week) and corpus_size_mb (db_size_bytes / 1 MiB) here so the
// two code paths can never drift.
function kpiRowToShape(row: Record<string, unknown>): MemoryKpi {
  const growth = intOrNull(row.growth_this_week) ?? 0;
  const dbBytes = intOrNull(row.db_size_bytes) ?? 0;
  return {
    total_memories: intOrNull(row.total_memories) ?? 0,
    gate_pass_rate: numOrNull(row.gate_pass_rate),
    retrieved_7d: intOrNull(row.retrieved_7d) ?? 0,
    db_size_bytes: dbBytes,
    growth_this_week: growth,
    added_this_week: growth,
    gate_pass_rate_delta_pts: numOrNull(row.gate_pass_rate_delta_pts),
    growth_pct_7d: numOrNull(row.growth_pct_7d),
    corpus_size_mb: dbBytes > 0 ? dbBytes / 1048576 : null,
  };
}

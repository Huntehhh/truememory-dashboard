/**
 * Operations tab — memory ops + rich log-stream endpoints.
 * See ./types.ts for MemoryOperations + OpsRich.
 */
import type { MemoryOperations, OpsRich, PgRunner } from './types.js';
import { intOrNull, num, numOrNull, tsToIso } from './types.js';

export async function getMemoryOperations(client: PgRunner): Promise<MemoryOperations> {
  // Matview fast-path. Single-row snapshot of the original ~5-CTE aggregate.
  try {
    const mvRes = await client.query(
      `SELECT reranker_p50_ms, reranker_p95_ms, llm_call_count, llm_call_p50_ms,
              drainer_backlog, failure_count_24h, ingester_throughput
         FROM mv_memory_operations WHERE bucket = 1`,
    );
    const mvRow = mvRes.rows[0];
    if (mvRow) {
      return {
        reranker_p50_ms: numOrNull(mvRow.reranker_p50_ms),
        reranker_p95_ms: numOrNull(mvRow.reranker_p95_ms),
        llm_call_count: intOrNull(mvRow.llm_call_count) ?? 0,
        llm_call_p50_ms: numOrNull(mvRow.llm_call_p50_ms),
        drainer_backlog: intOrNull(mvRow.drainer_backlog) ?? 0,
        failure_count_24h: intOrNull(mvRow.failure_count_24h) ?? 0,
        ingester_throughput: num(mvRow.ingester_throughput),
      };
    }
  } catch {
    // matview missing — fall through to raw
  }
  // Latency from tm_log_events (parsed mcp-debug.log) + counts from
  // tm_telemetry. p50/p95 via PERCENTILE_DISC for stability with sparse data.
  const sql = `
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
      -- Parenthesize the OR group so the 24h time bound applies to BOTH
      -- disjuncts. Without parens, SQL precedence (AND > OR) would scan
      -- the entire log history for parallel_search FAILs and only apply
      -- the time bound to the level='error' branch.
      SELECT COUNT(*) AS fail_count
      FROM tm_log_events
      WHERE ts >= NOW() - INTERVAL '24 hours'
        AND (
          (event_type = 'parallel_search' AND message LIKE '%FAIL%')
          OR level = 'error'
        )
    ),
    ingest AS (
      SELECT COUNT(*)::numeric / 24.0 AS per_hour
      FROM tm_memories
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    )
    SELECT
      (SELECT p50 FROM rerank)        AS reranker_p50_ms,
      (SELECT p95 FROM rerank)        AS reranker_p95_ms,
      (SELECT call_count FROM llm)    AS llm_call_count,
      (SELECT p50 FROM llm)           AS llm_call_p50_ms,
      (SELECT backlog FROM drainer)   AS drainer_backlog,
      (SELECT fail_count FROM failures) AS failure_count_24h,
      (SELECT per_hour FROM ingest)   AS ingester_throughput
  `;
  const res = await client.query(sql);
  const row = res.rows[0] ?? {};
  return {
    reranker_p50_ms: numOrNull(row.reranker_p50_ms),
    reranker_p95_ms: numOrNull(row.reranker_p95_ms),
    llm_call_count: intOrNull(row.llm_call_count) ?? 0,
    llm_call_p50_ms: numOrNull(row.llm_call_p50_ms),
    drainer_backlog: intOrNull(row.drainer_backlog) ?? 0,
    failure_count_24h: intOrNull(row.failure_count_24h) ?? 0,
    ingester_throughput: num(row.ingester_throughput),
  };
}

export async function getMemoryOpsRich(client: PgRunner): Promise<OpsRich> {
  // configure_reembeds_7d — count only legitimate re-embed events, not every
  // `configure` log line. TrueMemory wraps re-embeds inside the
  // `truememory_configure` lifecycle, which emits multiple event_type='configure'
  // rows per call: ENTER, "offline-mode restored", "going-online", and EXIT.
  // Only the EXIT row whose message contains rebuild_action='delta_or_full'
  // represents a real re-embed kickoff (see truememory/mcp_server.py:854-870 —
  // 'config_only' is a same-embedding tier swap, 'None' is a no-op configure).
  // Forward-compat: also count any future discrete reembed_* / tier_switch_*
  // event_types if TrueMemory ever emits them (none today; probe confirmed).
  const kpiSql = `
    SELECT
      COUNT(*) FILTER (WHERE event_type ILIKE '%drainer%' AND ts >= NOW() - INTERVAL '7 days') AS drainer_ticks_7d,
      COUNT(*) FILTER (WHERE event_type ILIKE '%forget%' AND ts >= NOW() - INTERVAL '7 days') AS forget_events_7d,
      COUNT(*) FILTER (
        WHERE ts >= NOW() - INTERVAL '7 days'
          AND (
            event_type ILIKE 'reembed%'
            OR event_type ILIKE 'tier_switch%'
            OR (
              event_type = 'configure'
              AND message LIKE 'EXIT%'
              AND message LIKE '%rebuild_action=''delta_or_full''%'
            )
          )
      ) AS configure_reembeds_7d,
      COUNT(*) FILTER (WHERE event_type ILIKE '%parallel_search%' AND level = 'error' AND ts >= NOW() - INTERVAL '7 days') AS parallel_search_fails_7d
    FROM tm_log_events
  `;
  const timingsSql = `
    SELECT
      AVG(duration_ms) FILTER (WHERE event_type ILIKE '%reranker%' AND duration_ms IS NOT NULL) AS reranker_avg,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE event_type ILIKE '%reranker%' AND duration_ms IS NOT NULL) AS reranker_p95,
      AVG(duration_ms) FILTER (WHERE event_type ILIKE '%llm%' AND duration_ms IS NOT NULL) AS llm_avg,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE event_type ILIKE '%llm%' AND duration_ms IS NOT NULL) AS llm_p95
    FROM tm_log_events
    WHERE ts >= NOW() - INTERVAL '7 days'
  `;
  const streamSql = `
    SELECT ts, level, event_type, duration_ms, message
    FROM tm_log_events
    WHERE ts >= NOW() - INTERVAL '7 days'
    ORDER BY ts DESC
    LIMIT 50
  `;
  // reranker_samples — recent reranker durations as a scatter-ready array.
  // Pull the 200 most-recent (DESC) then re-order oldest->newest in JS so the
  // x-axis reads left=old, right=new (matches the chart's axis label).
  const rerankerSamplesSql = `
    SELECT duration_ms
    FROM tm_log_events
    WHERE event_type ILIKE '%reranker%'
      AND duration_ms IS NOT NULL
      AND ts >= NOW() - INTERVAL '7 days'
    ORDER BY ts DESC
    LIMIT 200
  `;
  // llm_histogram — latency buckets for llm_call/store/m.add() durations over
  // 7d. 12 buckets across [0, 30000]ms via width_bucket; bucket_ms is the lower
  // edge. Out-of-range (>30s) durations collect in the top bucket via LEAST.
  const llmHistogramSql = `
    WITH vals AS (
      SELECT LEAST(duration_ms, 29999)::numeric AS d
      FROM tm_log_events
      WHERE event_type IN ('llm_call','store','m.add()')
        AND duration_ms IS NOT NULL
        AND ts >= NOW() - INTERVAL '7 days'
    ),
    bucketed AS (
      SELECT width_bucket(d, 0, 30000, 12) AS bin
      FROM vals
    )
    SELECT
      bin,
      ROUND((bin - 1) * (30000.0 / 12.0))::int AS bucket_ms,
      COUNT(*)::int                            AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin
    ORDER BY bin
  `;
  const [kpi, timings, stream, rerankerSamples, llmHistogram] = await Promise.all([
    client.query(kpiSql),
    client.query(timingsSql),
    client.query(streamSql),
    client.query(rerankerSamplesSql),
    client.query(llmHistogramSql),
  ]);
  const k = kpi.rows[0] ?? {};
  const t = timings.rows[0] ?? {};
  return {
    kpis: {
      drainer_ticks_7d: num(k.drainer_ticks_7d),
      // drainer_items: count of items drained per tick. No source signal yet —
      // the mirror's parseLogLine extracts only duration_ms + memory_id from
      // _backlog_drainer lines, never an item-count payload, and tm_log_events
      // has no column for it. Left null rather than fabricated. Wire this once
      // TrueMemory emits a drained-item count in the drainer log message.
      drainer_items: null,
      forget_events_7d: num(k.forget_events_7d),
      configure_reembeds_7d: num(k.configure_reembeds_7d),
    },
    timings: {
      reranker_cold_avg_ms: numOrNull(t.reranker_avg),
      reranker_cold_p95_ms: numOrNull(t.reranker_p95),
      llm_call_avg_ms: numOrNull(t.llm_avg),
      llm_call_p95_ms: numOrNull(t.llm_p95),
      reranker_samples: rerankerSamples.rows
        .map((r) => numOrNull(r.duration_ms))
        .filter((v): v is number => v !== null)
        .reverse(),
      llm_histogram: llmHistogram.rows.map((r) => ({
        bucket_ms: intOrNull(r.bucket_ms) ?? 0,
        count: intOrNull(r.count) ?? 0,
      })),
    },
    failures_7d: {
      parallel_search: num(k.parallel_search_fails_7d),
    },
    log_stream: stream.rows.map((r) => ({
      ts: tsToIso(r.ts),
      event: String(r.event_type ?? 'event'),
      lane: laneFromEvent(String(r.event_type ?? ''), String(r.level ?? '')),
      kv: {
        level: r.level ?? null,
        duration_ms: r.duration_ms ?? null,
        msg: r.message ? String(r.message).slice(0, 80) : null,
      } as Record<string, string | number | null>,
    })),
  };
}

// Map tm_log_events event_type + level to the lane taxonomy the dashboard
// filter expects (mirrors the lanes computed in mirror/truememory.ts for
// tm_telemetry). Errors always win regardless of event_type.
function laneFromEvent(eventType: string, level: string): string {
  if (level === 'error') return 'warn';
  if (/gate/i.test(eventType)) return 'gate';
  if (/search|rerank/i.test(eventType)) return 'search';
  if (/store|add|consolidate/i.test(eventType)) return 'store';
  if (/forget|unload|archive/i.test(eventType)) return 'lifecycle';
  return 'ops';
}

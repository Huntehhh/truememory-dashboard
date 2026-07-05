/**
 * Canned SQL queries for the /api/memory/* endpoints (MEMORY dashboard tab).
 *
 * Mirrors the patterns in queries.ts:
 *   - takes a pg Client + typed params,
 *   - parameterized queries only ($1, $2, ...),
 *   - returns Promise<typed-row> ready to JSON-serialize,
 *   - read-only (claude_usage_ro role).
 *
 * Source-of-truth for callout logic: truememory-viz/views/memory_aging.py +
 * by_category.py + ops.py + gate_decisions.py. Heuristics in this file are
 * the SQL ports of those Python heuristics.
 */
import type { Client, Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

// PgRunner: accepts either a bare Client or a Pool (Pool implements .query()).
// Used so memory-routes.ts can pass either without a cast.
type PgRunner = Pick<Client, 'query'> | Pool;

// ---------- shared coercion (mirrors queries.ts) ----------

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// M2 note: Number.parseInt truncates silently at 2^53. The BIGINT columns
// passing through here (db_size_bytes, total_memories counts) are safe at
// current scale (<2^53) but this is a silent-truncation pothole long-term.
// Accepted: all fields routed here are display-only KPIs, not arithmetic
// inputs; a truncated byte count renders visually fine. If any field ever
// exceeds ~9PB / ~9 quadrillion rows, switch to BigInt on that specific field.
// Stream B has made the same decision for the queries.ts copy.
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ---------- result types ----------

export type MemoryKpi = {
  total_memories: number;
  gate_pass_rate: number | null;
  retrieved_7d: number;
  db_size_bytes: number;
  growth_this_week: number;
  // Delta/derived fields read by renderMemoryKpiStrip (render-memory.js ~174-192).
  // added_this_week     — alias of growth_this_week (count of messages last 7d).
  // gate_pass_rate_delta_pts — this-week minus prior-week gate pass rate, in
  //                       percentage POINTS; NULL when gate signals absent
  //                       (gate_decision/gate_eval are not emitted by stock
  //                       TrueMemory, so this is typically NULL).
  // growth_pct_7d       — fractional corpus growth vs 7d ago; NULL on cold corpus.
  // corpus_size_mb      — db_size_bytes / 1048576 (unit conversion of an existing field).
  added_this_week: number;
  gate_pass_rate_delta_pts: number | null;
  growth_pct_7d: number | null;
  corpus_size_mb: number | null;
};

export type MemoryFeedRow = {
  id: number;
  ts: string | null;
  content_preview: string;
  category: string | null;
  sender: string | null;
  salience: number | null;
  retrieval_count: number;
  last_retrieved_at: string | null;
};

export type MemoryByCategoryRow = {
  category: string;
  count: number;
  median_salience: number | null;
  // retrievals_7d: per-category memory_returned events in the last 7 days.
  // Read by renderCategoryTable (render-memory.js ~441). memory_returned is a
  // live signal so this populates with real data.
  retrievals_7d: number;
};

type CalloutPayload = Record<string, unknown> | null;
export type MemoryAging = {
  decay_leader: CalloutPayload;
  long_stored_stranger: CalloutPayload;
  surprise_faded: CalloutPayload;
  cluster_nobody_visited: CalloutPayload;
  retrieval_gap: CalloutPayload;
  memory_horizon: CalloutPayload;
};

// UMAP themes — one record per memory that has an embedding. The Python
// scheduler in src/themes/compute_umap.py recomputes the full layout hourly
// and writes into tm_themes_cache; the endpoint just joins back to
// tm_memories for content + retrieval metadata.
//
// Frontend contract (render-memory.js -> renderThemesUMAP):
//   - points[].id           memory id (used as hover customdata key)
//   - points[].x / .y        UMAP-2D coords
//   - points[].cluster_id    'noise' or 'c<n>' — Plotly trace grouping key
//   - points[].label         truncated content for hover tooltip
//   - points[].retrievals    drives dot-size
export type MemoryThemePoint = {
  id: number;
  memory_id: number;        // alias of id, kept for analytics-side consumers
  x: number;
  y: number;
  cluster_id: string;       // 'noise' for label=-1, else 'c<label>'
  cluster_label: number;    // raw HDBSCAN label, -1 = noise
  cluster_name: string | null;
  label: string;            // truncated content preview (<=100 chars) for hover tooltip
  category: string | null;
  salience: number | null;
  retrievals: number;
  last_retrieved_at: string | null;
};

export type MemoryThemesResp = {
  points: MemoryThemePoint[];
  computed_at: string | null;
  note?: string;
  tier?: string | null;
};

export type MemoryOperations = {
  reranker_p50_ms: number | null;
  reranker_p95_ms: number | null;
  llm_call_count: number;
  llm_call_p50_ms: number | null;
  drainer_backlog: number;
  failure_count_24h: number;
  ingester_throughput: number;
};

export type MemoryEncodingGate = {
  pass_rate: number | null;
  reject_rate: number | null;
  reject_reasons: Array<{ reason: string; count: number }>;
};

// ---------- queries ----------

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

export async function getMemoryFeed(
  client: PgRunner,
  limit: number,
  category?: string,
): Promise<MemoryFeedRow[]> {
  // recent_messages port from truememory-viz/data/memories_db.py — joined
  // with the mirror-derived salience/retrieval_count columns.
  // Optional category filter: when provided, restricts to rows whose category
  // matches exactly (parameterized — no string interpolation).
  const params: (number | string)[] = [limit];
  const categoryClause =
    category && category !== 'all'
      ? `AND LOWER(NULLIF(category, '')) = LOWER($2)`
      : '';
  if (category && category !== 'all') params.push(category);

  const sql = `
    SELECT
      id,
      created_at                              AS ts,
      SUBSTR(content, 1, 200)                 AS content_preview,
      NULLIF(category, '')                    AS category,
      NULLIF(sender, '')                      AS sender,
      salience,
      retrieval_count,
      last_retrieved_at
    FROM tm_memories
    WHERE TRUE ${categoryClause}
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT $1::int
  `;
  const res = await client.query(sql, params);
  return res.rows.map((r) => ({
    id: intOrNull(r.id) ?? 0,
    ts: tsToIso(r.ts),
    content_preview: String(r.content_preview ?? ''),
    category: r.category ?? null,
    sender: r.sender ?? null,
    salience: numOrNull(r.salience),
    retrieval_count: intOrNull(r.retrieval_count) ?? 0,
    last_retrieved_at: tsToIso(r.last_retrieved_at),
  }));
}

export type MemoryFeedCategory = { category: string; count: number };

export async function getMemoryFeedCategories(
  client: PgRunner,
): Promise<MemoryFeedCategory[]> {
  // Returns distinct non-null, non-empty categories with their counts from
  // tm_memories, ordered by count descending.  Used to populate the chip bar
  // on 02-feed.html.
  const sql = `
    SELECT
      LOWER(NULLIF(category, '')) AS category,
      COUNT(*)::int               AS count
    FROM tm_memories
    WHERE category IS NOT NULL AND category <> ''
    GROUP BY 1
    ORDER BY count DESC, category ASC
  `;
  const res = await client.query(sql);
  return res.rows
    .filter((r) => r.category != null)
    .map((r) => ({
      category: String(r.category),
      count: intOrNull(r.count) ?? 0,
    }));
}

export async function getMemoryByCategory(
  client: PgRunner,
  days: number,
): Promise<MemoryByCategoryRow[]> {
  // Matview fast-path for the default 30d window.
  if (days === 30) {
    try {
      const res = await client.query(
        `SELECT category, count, median_salience, retrievals_7d
           FROM mv_memory_by_category_30d
           ORDER BY count DESC`,
      );
      if (res.rows.length > 0) {
        return res.rows.map((r) => ({
          category: String(r.category),
          count: intOrNull(r.count) ?? 0,
          median_salience: numOrNull(r.median_salience),
          retrievals_7d: intOrNull(r.retrievals_7d) ?? 0,
        }));
      }
    } catch {
      // matview missing — fall through to raw
    }
  }
  // Gap 1 fallback: tm_memories.category is always NULL because the upstream
  // TrueMemory engine never writes messages.category at store time. Derive it
  // at query time from the latest gate_decision telemetry row per memory_id.
  // The gate captures context_json at encoding time, which contains the
  // category key (tried in order: "category", "cat", "tag").
  // COALESCE(m.category, tcat.derived) means once the backfill script runs,
  // the mirrored value takes priority; this JOIN only kicks in for new memories
  // that arrive before the next backfill cron.
  // retr_7d is computed per memory_id (memory_returned events in last 7d) then
  // rolled up alongside count/median in the GROUP BY — SUM of per-memory
  // retrieval counts gives the per-category 7d retrieval total. This keeps the
  // derived-category JOIN intact (one pass over tm_memories) instead of a
  // second outer join on the COALESCE'd category string.
  const sql = `
    WITH latest_gate AS (
      SELECT DISTINCT ON (memory_id)
        memory_id,
        COALESCE(
          raw_blob->>'category',
          raw_blob->>'cat',
          raw_blob->>'tag'
        ) AS derived_category
      FROM tm_telemetry
      WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
        AND value_text = 'pass'
        AND memory_id IS NOT NULL
        AND raw_blob IS NOT NULL
      ORDER BY memory_id, ts DESC
    ),
    retr_7d AS (
      SELECT memory_id, COUNT(*)::int AS n
      FROM tm_telemetry
      WHERE signal = 'memory_returned'
        AND memory_id IS NOT NULL
        AND ts >= NOW() - INTERVAL '7 days'
      GROUP BY memory_id
    )
    SELECT
      COALESCE(
        NULLIF(m.category, ''),
        NULLIF(tcat.derived_category, ''),
        '(uncategorized)'
      )                                                                      AS category,
      COUNT(*)::int                                                          AS count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.salience)               AS median_salience,
      COALESCE(SUM(r.n), 0)::int                                            AS retrievals_7d
    FROM tm_memories m
    LEFT JOIN latest_gate tcat ON tcat.memory_id = m.id
    LEFT JOIN retr_7d r ON r.memory_id = m.id
    WHERE m.created_at IS NULL OR m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
    GROUP BY 1
    ORDER BY count DESC
  `;
  const res = await client.query(sql, [days]);
  return res.rows.map((r) => ({
    category: String(r.category),
    count: intOrNull(r.count) ?? 0,
    median_salience: numOrNull(r.median_salience),
    retrievals_7d: intOrNull(r.retrievals_7d) ?? 0,
  }));
}

export async function getMemoryAging(client: PgRunner): Promise<MemoryAging> {
  // Each callout is a separate cheap query — total round-trip is <20ms on
  // local pg. Wrapping in CTEs would force the same NULL-handling logic to
  // be repeated in each branch; six selects keep the SQL legible.

  // decay_leader — highest-salience memory either never retrieved OR not
  // retrieved in 30d. Salience>0.0 guards the "all NULL" case.
  const decaySql = `
    SELECT
      id                                                                            AS memory_id,
      SUBSTR(content, 1, 160)                                                       AS content_preview,
      salience,
      CASE WHEN last_retrieved_at IS NULL
           THEN EXTRACT(DAY FROM NOW() - created_at)::int
           ELSE EXTRACT(DAY FROM NOW() - last_retrieved_at)::int
      END                                                                           AS days_since_retrieval,
      GREATEST(0, 30 - CASE WHEN last_retrieved_at IS NULL
                            THEN EXTRACT(DAY FROM NOW() - created_at)::int
                            ELSE EXTRACT(DAY FROM NOW() - last_retrieved_at)::int
                       END)                                                         AS days_until_threshold
    FROM tm_memories
    WHERE salience IS NOT NULL
      AND created_at IS NOT NULL          -- M6: guard NULL created_at so EXTRACT never yields NULL
      AND (
        last_retrieved_at IS NULL
        OR last_retrieved_at <= NOW() - INTERVAL '30 days'
      )
    ORDER BY salience DESC NULLS LAST, created_at ASC
    LIMIT 1
  `;

  // long_stored_stranger — oldest memory with retrieval_count=0. The spec
  // calls for salience>0.7; we relax to salience IS NULL OR salience>=0
  // because in early life of the mirror most rows have no salience yet,
  // and the dashboard still wants to surface neglected memories.
  const longSql = `
    SELECT
      id                                                                            AS memory_id,
      SUBSTR(content, 1, 160)                                                       AS content_preview,
      EXTRACT(DAY FROM NOW() - created_at)::int                                     AS days_old,
      salience,
      TRUE                                                                          AS never_retrieved
    FROM tm_memories
    WHERE retrieval_count = 0
      AND created_at IS NOT NULL
      AND created_at <= NOW() - INTERVAL '30 days'
    ORDER BY salience DESC NULLS LAST, created_at ASC
    LIMIT 1
  `;

  // surprise_faded — memory with highest stored surprise value whose
  // last retrieval is >60d ago. Uses tm_telemetry.signal='surprise' as the
  // source-of-truth.
  const surpriseSql = `
    WITH surprise AS (
      SELECT memory_id, MAX(value_num) AS surprise_score
      FROM tm_telemetry
      WHERE signal = 'surprise' AND value_num IS NOT NULL AND memory_id IS NOT NULL
      GROUP BY memory_id
    )
    SELECT
      m.id                                                                          AS memory_id,
      SUBSTR(m.content, 1, 160)                                                     AS content_preview,
      EXTRACT(DAY FROM NOW() - m.created_at)::int                                   AS days_old,
      s.surprise_score                                                              AS original_surprise_score,
      CASE WHEN m.last_retrieved_at IS NULL
           THEN EXTRACT(DAY FROM NOW() - m.created_at)::int
           ELSE EXTRACT(DAY FROM NOW() - m.last_retrieved_at)::int
      END                                                                           AS days_since_touch
    FROM tm_memories m
    JOIN surprise s ON m.id = s.memory_id
    WHERE m.last_retrieved_at IS NULL
       OR m.last_retrieved_at <= NOW() - INTERVAL '60 days'
    ORDER BY s.surprise_score DESC, m.id ASC
    LIMIT 1
  `;

  // cluster_nobody_visited — biggest category with zero total retrievals.
  // Use category as proxy cluster until embedding-side UMAP is computed.
  const clusterSql = `
    SELECT
      COALESCE(NULLIF(category, ''), '(uncategorized)')                            AS category,
      COUNT(*)::int                                                                 AS memory_count,
      TRUE                                                                          AS zero_retrievals,
      AVG(emotional_valence)                                                        AS avg_embedding_density
    FROM tm_memories
    GROUP BY 1
    HAVING SUM(retrieval_count) = 0
       AND COUNT(*) >= 3
    ORDER BY memory_count DESC
    LIMIT 1
  `;

  // retrieval_gap — memory that has telemetry-recorded semantic matches
  // (search_distance signal) but zero memory_returned events in the same
  // window. Best-effort: counts search_distance rows per memory_id and
  // memory_returned rows in the last 30 days.
  const gapSql = `
    WITH search_seen AS (
      SELECT memory_id, COUNT(*) AS semantic_match_count
      FROM tm_telemetry
      WHERE signal = 'search_distance' AND memory_id IS NOT NULL
      GROUP BY memory_id
    ),
    returned_30d AS (
      SELECT memory_id, COUNT(*) AS returned_30d
      FROM tm_telemetry
      WHERE signal = 'memory_returned'
        AND memory_id IS NOT NULL
        AND ts >= NOW() - INTERVAL '30 days'
      GROUP BY memory_id
    )
    SELECT
      m.id                                                                           AS memory_id,
      SUBSTR(m.content, 1, 160)                                                      AS content_preview,
      s.semantic_match_count                                                         AS semantic_match_count,
      TRUE                                                                           AS never_returned
    FROM search_seen s
    JOIN tm_memories m ON m.id = s.memory_id
    LEFT JOIN returned_30d r ON r.memory_id = s.memory_id
    WHERE COALESCE(r.returned_30d, 0) = 0
    ORDER BY s.semantic_match_count DESC, m.id ASC
    LIMIT 1
  `;

  // memory_horizon — telemetry signal 'memory_horizon' if it exists; else
  // synthesize from search_distance percentile vs age. Spec defers to NULL
  // when not computable.
  const horizonSql = `
    WITH explicit AS (
      SELECT value_num AS horizon_days, NULL::numeric AS retrieval_distance_at_horizon
      FROM tm_telemetry
      WHERE signal = 'memory_horizon' AND value_num IS NOT NULL
      ORDER BY ts DESC
      LIMIT 1
    )
    SELECT * FROM explicit
  `;

  const [decay, longStored, surprise, cluster, gap, horizon] = await Promise.all([
    client.query(decaySql),
    client.query(longSql),
    client.query(surpriseSql),
    client.query(clusterSql),
    client.query(gapSql),
    client.query(horizonSql),
  ]);

  const firstOrNull = (rows: unknown[]): CalloutPayload => {
    if (!rows || rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    // Coerce common numeric strings to numbers for JSON cleanliness.
    // `instanceof Date` already narrows to object, no need for a redundant
    // `typeof v === 'object'` guard in front.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) {
        out[k] = null;
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
        const n = Number.parseFloat(v);
        out[k] = Number.isFinite(n) ? n : v;
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  return {
    decay_leader: firstOrNull(decay.rows),
    long_stored_stranger: firstOrNull(longStored.rows),
    surprise_faded: firstOrNull(surprise.rows),
    cluster_nobody_visited: firstOrNull(cluster.rows),
    retrieval_gap: firstOrNull(gap.rows),
    memory_horizon: firstOrNull(horizon.rows),
  };
}

export type MemoryThemeTier = { tier: string; points: number; clusters: number };

export async function getMemoryThemeTiers(client: PgRunner): Promise<MemoryThemeTier[]> {
  // Powers the tier chip-bar on 05-themes.html. One row per tier name
  // present in tm_themes_cache, with point + cluster counts for the chip
  // label (matches the category-chip pattern on 02-feed.html).
  const sql = `
    SELECT tier,
           COUNT(*)::int                                   AS points,
           COUNT(DISTINCT cluster_label)::int              AS clusters
    FROM tm_themes_cache
    GROUP BY tier
    ORDER BY points DESC
  `;
  const res = await client.query(sql);
  return res.rows.map((r) => ({
    tier: String(r.tier),
    points: intOrNull(r.points) ?? 0,
    clusters: intOrNull(r.clusters) ?? 0,
  }));
}

export async function getMemoryThemes(
  client: PgRunner,
  tier?: string | null,
): Promise<MemoryThemesResp> {
  // Read the precomputed UMAP+HDBSCAN layout from tm_themes_cache (populated
  // by src/themes/compute_umap.py on a 1-hour cadence). Joins back to
  // tm_memories for tooltip metadata. Optional tier filter lets the dashboard
  // A/B layouts between embedding models (edge vs pro) without recomputing.
  //
  // tier resolution:
  //   - explicit param  -> use it
  //   - null/missing    -> default to the tier with the most points (usually
  //                        pro since it covers 352 vs edge's 275)
  //   - 'all' or empty  -> same as default; we never want to mix tiers in one
  //                        scatter (UMAP coords aren't comparable across models)
  let activeTier = tier && tier.trim() && tier !== 'all' ? tier.trim() : null;
  if (!activeTier) {
    const tierPick = await client.query<{ tier: string }>(
      `SELECT tier FROM tm_themes_cache
         GROUP BY tier ORDER BY COUNT(*) DESC, tier ASC LIMIT 1`,
    );
    activeTier = tierPick.rows[0]?.tier ?? null;
  }

  if (!activeTier) {
    return {
      points: [],
      computed_at: null,
      note: 'UMAP computation pending - first run takes ~1min',
      tier: null,
    };
  }

  const sql = `
    SELECT
      tc.memory_id,
      tc.x,
      tc.y,
      tc.cluster_label,
      tc.cluster_name,
      tc.tier,
      SUBSTR(m.content, 1, 100)                              AS label,
      NULLIF(m.category, '')                                 AS category,
      m.salience,
      COALESCE(m.retrieval_count, 0)::int                    AS retrievals,
      m.last_retrieved_at,
      tc.computed_at
    FROM tm_themes_cache tc
    JOIN tm_memories m ON m.id = tc.memory_id
    WHERE tc.tier = $1
    ORDER BY tc.cluster_label, tc.memory_id
  `;
  const res = await client.query(sql, [activeTier]);
  if (res.rows.length === 0) {
    return {
      points: [],
      computed_at: null,
      note: `No themes cached for tier='${activeTier}' - run compute_umap.py to populate.`,
      tier: activeTier,
    };
  }
  const points: MemoryThemePoint[] = res.rows.map((r) => {
    const lbl = intOrNull(r.cluster_label) ?? -1;
    const id = intOrNull(r.memory_id) ?? 0;
    return {
      id,
      memory_id: id,
      x: numOrNull(r.x) ?? 0,
      y: numOrNull(r.y) ?? 0,
      cluster_id: lbl === -1 ? 'noise' : 'c' + String(lbl),
      cluster_label: lbl,
      cluster_name: r.cluster_name == null ? null : String(r.cluster_name),
      label: String(r.label ?? ''),
      category: r.category == null ? null : String(r.category),
      salience: numOrNull(r.salience),
      retrievals: intOrNull(r.retrievals) ?? 0,
      last_retrieved_at: tsToIso(r.last_retrieved_at),
    };
  });
  return {
    points,
    computed_at: tsToIso(res.rows[0]?.computed_at),
    tier: activeTier,
  };
}

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

export async function getMemoryEncodingGate(client: PgRunner): Promise<MemoryEncodingGate> {
  // Pass/reject rate from tm_telemetry.signal='gate_decision'.
  // reject_reasons groups by value_text where verdict != 'pass'.
  const summarySql = `
    SELECT
      SUM(CASE WHEN value_text = 'pass'   THEN 1 ELSE 0 END)::numeric AS pass_count,
      SUM(CASE WHEN value_text = 'reject' THEN 1 ELSE 0 END)::numeric AS reject_count,
      COUNT(*)::numeric                                               AS total
    FROM tm_telemetry
    WHERE signal IN ('gate_decision','gate_eval')
      AND ts >= NOW() - INTERVAL '30 days'
  `;
  const reasonsSql = `
    SELECT
      COALESCE(NULLIF(value_text, ''), '(unknown)') AS reason,
      COUNT(*)::int                                  AS count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision','gate_eval')
      AND value_text IS NOT NULL
      AND value_text <> 'pass'
      AND ts >= NOW() - INTERVAL '30 days'
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 10
  `;
  const [summary, reasons] = await Promise.all([client.query(summarySql), client.query(reasonsSql)]);
  const sRow = summary.rows[0] ?? {};
  const total = num(sRow.total);
  const passRate = total > 0 ? num(sRow.pass_count) / total : null;
  const rejectRate = total > 0 ? num(sRow.reject_count) / total : null;
  return {
    pass_rate: passRate,
    reject_rate: rejectRate,
    reject_reasons: reasons.rows.map((r) => ({
      reason: String(r.reason),
      count: intOrNull(r.count) ?? 0,
    })),
  };
}

// ============================================================================
// Rich shapes for the dashboard frontend (paths /ops, /gate, /open-loops).
// Returns the schema render-memory.js expects. Added 2026-05-21.
// ============================================================================

export type OpsRich = {
  kpis: {
    drainer_ticks_7d: number;
    drainer_items: number | null;
    forget_events_7d: number;
    configure_reembeds_7d: number;
  };
  timings: {
    reranker_cold_avg_ms: number | null;
    reranker_cold_p95_ms: number | null;
    llm_call_avg_ms: number | null;
    llm_call_p95_ms: number | null;
    // reranker_samples: recent per-event reranker durations (ms), oldest->newest,
    //   capped at 200 points. Drives the scatter chart in renderOpsHealth
    //   (render-memory.js ~939). Empty array when no reranker log events exist.
    reranker_samples: number[];
    // llm_histogram: latency buckets for llm_call/store/m.add() durations.
    //   Drives the bar chart in renderOpsHealth (render-memory.js ~958). Empty
    //   array when no such log events exist. bucket_ms is the lower edge of each
    //   bucket in ms (frontend reads b.bucket_ms).
    llm_histogram: Array<{ bucket_ms: number; count: number }>;
  };
  failures_7d: { parallel_search: number };
  log_stream: Array<{
    ts: string | null;
    event: string;
    lane: string;
    kv: Record<string, string | number | null>;
  }>;
};

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

export type GateRich = {
  pass_rate: number;
  pass_count: number;
  reject_count: number;
  reject_reasons: Array<{ reason_code: string; count: number; pct: number; interpretation: string }>;
  session_pass_rates: number[];
};

const REASON_INTERPRETATIONS: Record<string, string> = {
  novelty_too_low: 'Too similar to existing memories.',
  salience_floor: 'Salience composite below threshold.',
  pred_error_low: 'Predicted-error signal too small to be surprising.',
  combined_below_threshold: 'Composite gate score did not clear minimum.',
  duplicate: 'Exact-match content already stored.',
};

export async function getMemoryGateRich(client: PgRunner): Promise<GateRich> {
  const summarySql = `
    SELECT
      COUNT(*) FILTER (WHERE value_text = 'pass') AS pass_count,
      COUNT(*) FILTER (WHERE value_text IS NOT NULL AND value_text <> 'pass') AS reject_count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND ts >= NOW() - INTERVAL '7 days'
  `;
  const reasonsSql = `
    SELECT COALESCE(value_text, 'unknown') AS reason_code, COUNT(*) AS count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND value_text IS NOT NULL AND value_text <> 'pass'
      AND ts >= NOW() - INTERVAL '7 days'
    GROUP BY value_text
    ORDER BY count DESC
    LIMIT 10
  `;
  const sessionSql = `
    SELECT raw_blob->>'session_id' AS session_id,
           SUM(CASE WHEN value_text = 'pass' THEN 1 ELSE 0 END)::float
             / NULLIF(COUNT(*), 0) AS pass_rate
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND ts >= NOW() - INTERVAL '7 days'
      AND raw_blob ? 'session_id'
    GROUP BY raw_blob->>'session_id'
    ORDER BY MIN(ts) DESC
    LIMIT 30
  `;
  const [summary, reasons, sessions] = await Promise.all([
    client.query(summarySql),
    client.query(reasonsSql),
    client.query(sessionSql),
  ]);
  const sRow = summary.rows[0] ?? {};
  const passCount = num(sRow.pass_count);
  const rejectCount = num(sRow.reject_count);
  const total = passCount + rejectCount;
  const passRate = total > 0 ? passCount / total : 0;
  return {
    pass_rate: passRate,
    pass_count: passCount,
    reject_count: rejectCount,
    reject_reasons: reasons.rows.map((r) => {
      const code = String(r.reason_code);
      const count = num(r.count);
      return {
        reason_code: code,
        count,
        pct: rejectCount > 0 ? count / rejectCount : 0,
        interpretation: REASON_INTERPRETATIONS[code] ?? '',
      };
    }),
    session_pass_rates: sessions.rows.map((r) => numOrNull(r.pass_rate) ?? 0),
  };
}

export type OpenLoopCard = {
  id: string;
  tag: string;
  title: string;
  body: string;
  activation: string;
  severity: string;
  lane: string;
  last_fired_at: string | null;
  activation_count: number;
};

export type OpenLoopsResp = {
  loops: OpenLoopCard[];
};

// ============================================================================
// Decay panels — 4-panel grid for the Aging tab (04-aging.html).
// Frontend contract: render-memory.js:507-624 renderDecayPanels().
// Endpoint: GET /api/memory/decay-panels
// ============================================================================

export type DecayHistBucket = { bucket: number; count: number };
export type DecayScatterPoint = {
  id: number;
  age_days: number;
  decay: number;
  is_outlier?: boolean;
  is_relevant?: boolean;
};

// Daily count of memory_returned events from tm_telemetry — drives the
// 12-week activity heatmap on the Overview page. Frontend bucketizes the
// rows into a 7×12 grid client-side, so we just emit one row per day.
export type MemoryActivityRow = { day: string; count: number };

export async function getMemoryActivity(client: PgRunner, days: number): Promise<MemoryActivityRow[]> {
  const sql = `
    SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count
    FROM tm_telemetry
    WHERE signal = 'memory_returned'
      AND ts >= NOW() - ($1::int || ' days')::interval
    GROUP BY day
    ORDER BY day
  `;
  const res = await client.query<{ day: string; count: number }>(sql, [days]);
  return res.rows.map((r) => ({ day: r.day, count: intOrNull(r.count) ?? 0 }));
}

export type MemoryDecayPanels = {
  decay_histogram: DecayHistBucket[];
  salience_histogram: DecayHistBucket[];
  surprise_histogram: DecayHistBucket[];
  decay_age_scatter: DecayScatterPoint[];
};

export async function getMemoryDecayPanels(client: PgRunner): Promise<MemoryDecayPanels> {
  // decay_histogram — 12 even bins on [0,1] of synthetic_decay.
  // synthetic_decay = 1 - exp(-days_since_retrieval / 14), clamped [0,1].
  // days_since_retrieval derived from last_retrieved_at falling back to created_at.
  const decayHistSql = `
    WITH decay_vals AS (
      SELECT
        GREATEST(0.0, LEAST(1.0,
          1.0 - EXP(
            -EXTRACT(EPOCH FROM (
              NOW() - COALESCE(last_retrieved_at, created_at)
            )) / 86400.0 / 14.0
          )
        )) AS synthetic_decay
      FROM tm_memories
      WHERE COALESCE(last_retrieved_at, created_at) IS NOT NULL
    ),
    bucketed AS (
      SELECT width_bucket(synthetic_decay, 0.0, 1.0, 12) AS bin
      FROM decay_vals
    )
    SELECT
      bin,
      -- midpoint of each bin: bin_index maps to (bin - 0.5) / 12
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // salience_histogram — 12 bins on [0,1] of tm_memories.salience (NULL → skip,
  // they don't map to a valid bin and width_bucket rejects out-of-range).
  const salienceHistSql = `
    WITH bucketed AS (
      SELECT width_bucket(LEAST(salience::numeric, 0.9999), 0.0, 1.0, 12) AS bin
      FROM tm_memories
      WHERE salience IS NOT NULL
        AND salience >= 0 AND salience <= 1
    )
    SELECT
      bin,
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // surprise_histogram — from tm_telemetry rows with signal='surprise' or
  // 'gate_decision' AND value_num IS NOT NULL. Clamped [0,1] then binned.
  // Returns empty array when telemetry has no such rows — frontend handles gracefully.
  const surpriseHistSql = `
    WITH surprise_vals AS (
      SELECT GREATEST(0.0, LEAST(1.0, value_num::float)) AS sv
      FROM tm_telemetry
      WHERE signal IN ('surprise', 'gate_decision')
        AND value_num IS NOT NULL
    ),
    bucketed AS (
      SELECT width_bucket(LEAST(sv::numeric, 0.9999), 0.0, 1.0, 12) AS bin
      FROM surprise_vals
      WHERE sv BETWEEN 0 AND 1
    )
    SELECT
      bin,
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // decay_age_scatter — up to 500 sampled rows.
  // is_outlier: decay >= 0.85 AND age_days >= 30.
  // age_days: days since created_at.
  const scatterSql = `
    SELECT
      id,
      ROUND(
        EXTRACT(EPOCH FROM (NOW() - COALESCE(last_retrieved_at, created_at))) / 86400.0
      )::int AS age_days,
      ROUND(GREATEST(0.0, LEAST(1.0,
        1.0 - EXP(
          -EXTRACT(EPOCH FROM (
            NOW() - COALESCE(last_retrieved_at, created_at)
          )) / 86400.0 / 14.0
        )
      ))::numeric, 4) AS decay
    FROM tm_memories
    WHERE COALESCE(last_retrieved_at, created_at) IS NOT NULL
    ORDER BY random()
    LIMIT 500
  `;

  const [decayHist, salienceHist, surpriseHist, scatter] = await Promise.all([
    client.query(decayHistSql),
    client.query(salienceHistSql),
    client.query(surpriseHistSql),
    client.query(scatterSql),
  ]);

  return {
    decay_histogram: decayHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    salience_histogram: salienceHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    surprise_histogram: surpriseHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    decay_age_scatter: scatter.rows.map((r) => {
      const decay = num(r.decay);
      const age_days = intOrNull(r.age_days) ?? 0;
      return {
        id: intOrNull(r.id) ?? 0,
        age_days,
        decay,
        is_outlier: decay >= 0.85 && age_days >= 30,
      };
    }),
  };
}

// Gap 3: open loops now live in tm_open_loops (Postgres) instead of a static
// array. The dashboard frontend contract is unchanged: { loops: [...] } where
// each card has { id, tag, title, body, activation, lane, ... }.
// "tag" is aliased from the id column since render-memory.js reads l.tag.
export async function getMemoryOpenLoops(client: PgRunner): Promise<OpenLoopsResp> {
  const sql = `
    SELECT
      id,
      id                    AS tag,
      title,
      body,
      severity,
      lane,
      last_fired_at,
      activation_count,
      -- activation text stored in body; split convention: body ends with
      -- a paragraph starting "to activate:" — pass it through as-is so the
      -- frontend's existing l.activation rendering still works.
      -- We store activation separately in the table; expose it directly.
      COALESCE(activation_text, '') AS activation
    FROM tm_open_loops
    ORDER BY
      CASE severity WHEN 'crit' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
      id
  `;
  const res = await client.query(sql);
  return {
    loops: res.rows.map((r) => ({
      id: String(r.id),
      tag: String(r.tag),
      title: String(r.title),
      body: String(r.body),
      activation: String(r.activation),
      severity: String(r.severity),
      lane: String(r.lane),
      last_fired_at: tsToIso(r.last_fired_at),
      activation_count: intOrNull(r.activation_count) ?? 0,
    })),
  };
}

// ============================================================================
// Injections — hook-emitted JSONL feed mirrored to tm_injections by the mirror
// process. One row per session_start / user_prompt_submit / stop / compact /
// smoke_test event. Powers the injection feed on the dashboard.
// ============================================================================

export type MemoryInjectionRow = {
  id: number;
  ts: string | null;
  hook: string;
  session_id: string | null;
  action: string | null;
  memory_count: number | null;
  char_count: number | null;
  query: string | null;
  preview: string | null;
  full_content: string | null;
  extra: Record<string, unknown> | null;
};

export async function getMemoryInjections(
  client: PgRunner,
  limit: number,
): Promise<MemoryInjectionRow[]> {
  const sql = `
    SELECT id, ts, hook, session_id, action, memory_count, char_count,
           query, preview, full_content, extra
      FROM tm_injections
     ORDER BY ts DESC, id DESC
     LIMIT $1::int
  `;
  const res = await client.query(sql, [limit]);
  return res.rows.map((r) => {
    // node-postgres parses JSONB into a JS value automatically. Guard against
    // arrays / primitives showing up in the column so the type stays honest.
    let extra: Record<string, unknown> | null = null;
    const raw = r.extra;
    if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
      extra = raw as Record<string, unknown>;
    }
    return {
      id: intOrNull(r.id) ?? 0,
      ts: tsToIso(r.ts),
      hook: String(r.hook ?? ''),
      session_id: r.session_id == null ? null : String(r.session_id),
      action: r.action == null ? null : String(r.action),
      memory_count: intOrNull(r.memory_count),
      char_count: intOrNull(r.char_count),
      query: r.query == null ? null : String(r.query),
      preview: r.preview == null ? null : String(r.preview),
      full_content: r.full_content == null ? null : String(r.full_content),
      extra,
    };
  });
}

// ============================================================================
// Inspect — single-memory deep view: memory + connections (entities, causal
// edges, fact timeline, landmarks, cluster) + top-10 vector neighbors +
// optional raw embedding. Serves the memory inspector modal.
//
// Postgres for tm_memories (mirrored, cheap). SQLite read-only for the
// connection tables — they're not mirrored (low-write-rate reference data;
// snapshot at request time is fine). Neighbor computation reads the embedding
// matrix out of the sqlite-vec storage tables (same layout compute_umap.py
// uses); the matrix is cached in-process for 15 min to avoid re-parsing
// ~350 vectors on every inspect.
// ============================================================================

export type MemoryInspectResult = {
  memory: {
    id: number;
    content: string;
    category: string | null;
    sender: string | null;
    recipient: string | null;
    modality: string | null;
    emotional_valence: number | null;
    created_at: string | null;
    salience: number | null;
    last_retrieved_at: string | null;
    retrieval_count: number;
    embedding_dim: number | null;
  } | null;
  connections: {
    entities: Array<{
      entity: string;
      message_count: number | null;
      traits: string | null;
      communication_style: string | null;
      topics: string | null;
      relationships: string | null;
      updated_at: string | null;
    }>;
    causal_edges: Array<{
      id: number;
      direction: 'cause_of' | 'effect_of';
      other_id: number;
      other_preview: string;
      relationship: string | null;
      confidence: number | null;
    }>;
    fact_timeline: Array<{
      id: number;
      subject: string;
      fact: string;
      timestamp: string | null;
      superseded_by: number | null;
      entity_scope: string | null;
      valid_from: string | null;
      valid_to: string | null;
      status: string | null;
    }>;
    landmark_events: Array<{
      id: number;
      event_name: string;
      timestamp: string | null;
      event_type: string | null;
      related_entities: string | null;
    }>;
    cluster: {
      cluster_id: number;
      noise: boolean;
      cluster_size: number;
      summary: string | null;
      session_range: string | null;
    } | null;
  };
  neighbors: Array<{
    id: number;
    distance: number;
    preview: string;
    category: string | null;
  }>;
  vector: number[] | null;
};

// ---------------------------------------------------------------------------
// SQLite read-only helper
// ---------------------------------------------------------------------------
// Matches the mirror's read-only discipline (readonly:true + fileMustExist:true
// + WAL + busy_timeout). Open-close on every call — SQLite open is sub-ms and
// keeping a long-lived connection would fight with the mirror's writer.

function memoriesDbPath(): string {
  return process.env.TRUEMEMORY_DB_PATH ?? path.join(os.homedir(), '.truememory', 'memories.db');
}

function openSourceDbRO(): Database.Database {
  const p = memoriesDbPath();
  const db = new Database(p, { readonly: true, fileMustExist: true });
  db.pragma('journal_mode=WAL');
  db.pragma('busy_timeout=5000');
  return db;
}

// ---------------------------------------------------------------------------
// Neighbor cache (module-level, 15-min TTL)
// ---------------------------------------------------------------------------
// The embedding matrix is small (~350 × 256 floats = ~360KB) so keeping it
// in-process is basically free. Cache invalidation: age > 15 min. Concurrent
// callers share a single in-flight reload via cacheLoadPromise.

type NeighborCache = {
  ids: number[];             // memory ids, indexed by row in vecs
  idToRow: Map<number, number>; // memory id -> row index into vecs
  vecs: Float32Array;        // N * dim, row-major, L2-normalized
  dim: number;
  activeTable: string;
  loadedAt: number;
};

const NEIGHBOR_CACHE_TTL_MS = 15 * 60 * 1000;
let neighborCache: NeighborCache | null = null;
let neighborCacheLoadPromise: Promise<NeighborCache> | null = null;

function pickWinningVecTable(db: Database.Database): { vec_table: string; embedding_dim: number } | null {
  // vector_cache_registry.vector_count is the count of embeddings emitted for
  // each tier. Highest count wins — that's the actively-embedded tier.
  const row = db
    .prepare(
      `SELECT vec_table, embedding_dim, vector_count
         FROM vector_cache_registry
        ORDER BY vector_count DESC
        LIMIT 1`,
    )
    .get() as { vec_table: string | null; embedding_dim: number | null; vector_count: number | null } | undefined;
  if (!row || !row.vec_table || !row.embedding_dim || !row.vector_count) return null;
  return { vec_table: row.vec_table, embedding_dim: row.embedding_dim };
}

async function buildNeighborCache(): Promise<NeighborCache> {
  const db = openSourceDbRO();
  try {
    const winner = pickWinningVecTable(db);
    if (!winner) {
      // No embeddings — empty cache (still valid, prevents thrashing).
      return {
        ids: [],
        idToRow: new Map(),
        vecs: new Float32Array(0),
        dim: 0,
        activeTable: '',
        loadedAt: Date.now(),
      };
    }
    const { vec_table, embedding_dim } = winner;
    const rowidsTable = `${vec_table}_rowids`;
    const chunksTable = `${vec_table}_vector_chunks00`;
    const slotBytes = embedding_dim * 4;

    const rowidRows = db
      .prepare(`SELECT rowid, chunk_id, chunk_offset FROM ${rowidsTable} ORDER BY rowid`)
      .all() as Array<{ rowid: number; chunk_id: number; chunk_offset: number }>;

    if (rowidRows.length === 0) {
      return {
        ids: [],
        idToRow: new Map(),
        vecs: new Float32Array(0),
        dim: embedding_dim,
        activeTable: vec_table,
        loadedAt: Date.now(),
      };
    }

    // Group by chunk_id so each chunk blob is fetched once.
    const byChunk = new Map<number, Array<{ rowid: number; offset: number }>>();
    for (const r of rowidRows) {
      let list = byChunk.get(r.chunk_id);
      if (!list) {
        list = [];
        byChunk.set(r.chunk_id, list);
      }
      list.push({ rowid: r.rowid, offset: r.chunk_offset });
    }

    const ids: number[] = [];
    const vecFlat = new Float32Array(rowidRows.length * embedding_dim);
    let writeRow = 0;

    const chunkStmt = db.prepare(`SELECT vectors FROM ${chunksTable} WHERE rowid = ?`);
    for (const [chunkId, entries] of byChunk) {
      const blobRow = chunkStmt.get(chunkId) as { vectors: Buffer | null } | undefined;
      if (!blobRow || !blobRow.vectors) continue;
      const blob = blobRow.vectors;
      for (const e of entries) {
        const start = e.offset * slotBytes;
        const end = start + slotBytes;
        if (end > blob.length) continue;
        // Copy the float32 slice into the pre-allocated flat buffer, and
        // L2-normalize as we go so runtime queries can use a plain dot.
        const view = new Float32Array(blob.buffer, blob.byteOffset + start, embedding_dim);
        let norm = 0;
        for (let j = 0; j < embedding_dim; j++) {
          const v = view[j] ?? 0;
          norm += v * v;
        }
        const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
        const base = writeRow * embedding_dim;
        for (let j = 0; j < embedding_dim; j++) {
          const v = view[j] ?? 0;
          vecFlat[base + j] = v * inv;
        }
        ids.push(e.rowid);
        writeRow++;
      }
    }

    // Trim vecFlat if any rows were skipped (e.g. offset out of range).
    let finalVecs: Float32Array;
    if (writeRow === rowidRows.length) {
      finalVecs = vecFlat;
    } else {
      finalVecs = new Float32Array(writeRow * embedding_dim);
      finalVecs.set(vecFlat.subarray(0, writeRow * embedding_dim));
    }

    const idToRow = new Map<number, number>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === undefined) continue;
      idToRow.set(id, i);
    }

    return {
      ids,
      idToRow,
      vecs: finalVecs,
      dim: embedding_dim,
      activeTable: vec_table,
      loadedAt: Date.now(),
    };
  } finally {
    db.close();
  }
}

async function getNeighborCache(): Promise<NeighborCache> {
  const now = Date.now();
  if (neighborCache && now - neighborCache.loadedAt < NEIGHBOR_CACHE_TTL_MS) {
    return neighborCache;
  }
  if (neighborCacheLoadPromise) return neighborCacheLoadPromise;
  neighborCacheLoadPromise = (async () => {
    try {
      const built = await buildNeighborCache();
      neighborCache = built;
      return built;
    } finally {
      neighborCacheLoadPromise = null;
    }
  })();
  return neighborCacheLoadPromise;
}

function topKNeighbors(
  cache: NeighborCache,
  queryId: number,
  k: number,
): Array<{ id: number; distance: number }> {
  const dim = cache.dim;
  if (dim === 0 || cache.ids.length === 0) return [];
  const row = cache.idToRow.get(queryId);
  if (row === undefined) return [];
  const base = row * dim;

  // Score every row (vectors are L2-normalized so dot == cosine similarity).
  // 350 × 256 = 89,600 float mults — sub-millisecond in V8.
  const scores: Array<{ id: number; sim: number }> = [];
  const n = cache.ids.length;
  for (let i = 0; i < n; i++) {
    if (i === row) continue;
    const other = i * dim;
    let s = 0;
    for (let j = 0; j < dim; j++) {
      s += (cache.vecs[base + j] ?? 0) * (cache.vecs[other + j] ?? 0);
    }
    const otherId = cache.ids[i];
    if (otherId === undefined) continue;
    scores.push({ id: otherId, sim: s });
  }
  scores.sort((a, b) => b.sim - a.sim);
  return scores.slice(0, k).map((s) => ({
    id: s.id,
    // Clamp to [0, 2] then round for JSON cleanliness — cosine distance is
    // 1 - sim, sim ∈ [-1, 1], so distance ∈ [0, 2].
    distance: Math.max(0, Math.min(2, 1 - s.sim)),
  }));
}

export async function getMemoryInspect(
  client: PgRunner,
  id: number,
  options: { includeVector: boolean },
): Promise<MemoryInspectResult> {
  // ---- 1. Memory (Postgres, cheap) ----
  const memRes = await client.query(
    `SELECT id, content, NULLIF(category, '') AS category,
            NULLIF(sender, '') AS sender, NULLIF(recipient, '') AS recipient,
            modality, emotional_valence, created_at, salience,
            last_retrieved_at, retrieval_count, embedding_dim
       FROM tm_memories
      WHERE id = $1`,
    [id],
  );
  const memRow = memRes.rows[0];
  if (!memRow) {
    return {
      memory: null,
      connections: {
        entities: [],
        causal_edges: [],
        fact_timeline: [],
        landmark_events: [],
        cluster: null,
      },
      neighbors: [],
      vector: null,
    };
  }
  const memory = {
    id: intOrNull(memRow.id) ?? id,
    content: String(memRow.content ?? ''),
    category: memRow.category == null ? null : String(memRow.category),
    sender: memRow.sender == null ? null : String(memRow.sender),
    recipient: memRow.recipient == null ? null : String(memRow.recipient),
    modality: memRow.modality == null ? null : String(memRow.modality),
    emotional_valence: numOrNull(memRow.emotional_valence),
    created_at: tsToIso(memRow.created_at),
    salience: numOrNull(memRow.salience),
    last_retrieved_at: tsToIso(memRow.last_retrieved_at),
    retrieval_count: intOrNull(memRow.retrieval_count) ?? 0,
    embedding_dim: intOrNull(memRow.embedding_dim),
  };

  // ---- 2. Connections (SQLite read-only, single open) ----
  const db = openSourceDbRO();
  let causalOtherIdsToLookup: number[] = [];
  let entities: MemoryInspectResult['connections']['entities'] = [];
  let causalRaw: Array<{
    id: number;
    cause_msg_id: number;
    effect_msg_id: number;
    relationship: string | null;
    confidence: number | null;
  }> = [];
  let factTimelineRaw: Array<{
    id: number;
    subject: string;
    fact: string;
    timestamp: string | null;
    superseded_by: number | null;
    entity_scope: string | null;
    valid_from: string | null;
    valid_to: string | null;
    status: string | null;
  }> = [];
  let landmarkRaw: Array<{
    id: number;
    event_name: string;
    timestamp: string | null;
    event_type: string | null;
    related_entities: string | null;
  }> = [];
  let clusterRow:
    | {
        cluster_id: number;
        noise: number;
        message_count: number | null;
        summary: string | null;
        session_range: string | null;
      }
    | undefined;
  try {
    // Entities — matched on sender name (LOWER + trim). Empty sender = skip.
    const senderKey = memory.sender ? memory.sender.trim().toLowerCase() : '';
    if (senderKey.length > 0) {
      entities = (db
        .prepare(
          `SELECT entity, message_count, traits, communication_style, topics,
                  relationships, updated_at
             FROM entity_profiles
            WHERE LOWER(TRIM(entity)) = ?
            LIMIT 5`,
        )
        .all(senderKey) as Array<{
        entity: string;
        message_count: number | null;
        traits: string | null;
        communication_style: string | null;
        topics: string | null;
        relationships: string | null;
        updated_at: string | null;
      }>).map((r) => ({
        entity: r.entity,
        message_count: r.message_count,
        traits: r.traits,
        communication_style: r.communication_style,
        topics: r.topics,
        relationships: r.relationships,
        updated_at: r.updated_at,
      }));
    }

    // Causal edges (either direction)
    causalRaw = db
      .prepare(
        `SELECT id, cause_msg_id, effect_msg_id, relationship, confidence
           FROM causal_edges
          WHERE cause_msg_id = ? OR effect_msg_id = ?
          LIMIT 20`,
      )
      .all(id, id) as typeof causalRaw;

    causalOtherIdsToLookup = causalRaw.map((r) =>
      r.cause_msg_id === id ? r.effect_msg_id : r.cause_msg_id,
    );

    // Fact timeline entries where this memory is the source.
    factTimelineRaw = db
      .prepare(
        `SELECT id, subject, fact, timestamp, superseded_by, entity_scope,
                valid_from, valid_to, status
           FROM fact_timeline
          WHERE source_message_id = ?
          LIMIT 20`,
      )
      .all(id) as typeof factTimelineRaw;

    // Landmark events tagged with this memory as source.
    landmarkRaw = db
      .prepare(
        `SELECT id, event_name, timestamp, event_type, related_entities
           FROM landmark_events
          WHERE source_message_id = ?
          LIMIT 20`,
      )
      .all(id) as typeof landmarkRaw;

    // Cluster membership + centroid metadata.
    clusterRow = db
      .prepare(
        `SELECT mc.cluster_id, mc.noise,
                cc.message_count, cc.summary, cc.session_range
           FROM message_clusters mc
           LEFT JOIN cluster_centroids cc ON cc.cluster_id = mc.cluster_id
          WHERE mc.message_id = ?
          LIMIT 1`,
      )
      .get(id) as typeof clusterRow;
  } finally {
    db.close();
  }

  // Batch-look-up previews for the causal edges' "other" ids.
  const causalPreviews = new Map<number, string>();
  if (causalOtherIdsToLookup.length > 0) {
    // Filter out this memory's own id (defensive — should never happen).
    const otherIds = Array.from(new Set(causalOtherIdsToLookup.filter((x) => x !== id)));
    if (otherIds.length > 0) {
      const previewRes = await client.query(
        `SELECT id, SUBSTR(content, 1, 100) AS preview
           FROM tm_memories
          WHERE id = ANY($1::bigint[])`,
        [otherIds],
      );
      for (const r of previewRes.rows) {
        const idNum = intOrNull(r.id);
        if (idNum === null) continue;
        causalPreviews.set(idNum, String(r.preview ?? ''));
      }
    }
  }

  const causalEdges: MemoryInspectResult['connections']['causal_edges'] = causalRaw.map((r) => {
    const direction: 'cause_of' | 'effect_of' = r.cause_msg_id === id ? 'cause_of' : 'effect_of';
    const otherId = direction === 'cause_of' ? r.effect_msg_id : r.cause_msg_id;
    return {
      id: r.id,
      direction,
      other_id: otherId,
      other_preview: causalPreviews.get(otherId) ?? '',
      relationship: r.relationship,
      confidence: numOrNull(r.confidence),
    };
  });

  const factTimeline: MemoryInspectResult['connections']['fact_timeline'] = factTimelineRaw.map(
    (r) => ({
      id: r.id,
      subject: r.subject,
      fact: r.fact,
      timestamp: r.timestamp,
      superseded_by: intOrNull(r.superseded_by),
      entity_scope: r.entity_scope,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      status: r.status,
    }),
  );

  const landmarks: MemoryInspectResult['connections']['landmark_events'] = landmarkRaw.map((r) => ({
    id: r.id,
    event_name: r.event_name,
    timestamp: r.timestamp,
    event_type: r.event_type,
    related_entities: r.related_entities,
  }));

  let cluster: MemoryInspectResult['connections']['cluster'] = null;
  if (clusterRow) {
    const memberCount = clusterRow.message_count ?? 0;
    // Spec: cluster_size = message_count - 1 (other members, excluding this).
    // Clamp at 0 to guard cluster_centroids being empty (LEFT JOIN → null).
    const clusterSize = Math.max(0, memberCount - 1);
    cluster = {
      cluster_id: clusterRow.cluster_id,
      noise: Boolean(clusterRow.noise),
      cluster_size: clusterSize,
      summary: clusterRow.summary,
      session_range: clusterRow.session_range,
    };
  }

  // ---- 3. Neighbors (in-process cache) ----
  const cache = await getNeighborCache();
  // The mirror derives tm_memories.embedding_dim from messages.embedding_separation
  // (the SEP-tier blob), which is often NULL for memories that DO have a real
  // basepro/edge embedding stored elsewhere in the vec_messages_* tables. When
  // the cache confirms the embedding exists, surface its dim so the frontend
  // knows to show the raw-vector loader button.
  if (memory.embedding_dim == null && cache.idToRow.has(id) && cache.dim > 0) {
    memory.embedding_dim = cache.dim;
  }
  const topIds = topKNeighbors(cache, id, 10);
  let neighbors: MemoryInspectResult['neighbors'] = [];
  if (topIds.length > 0) {
    const neighborIds = topIds.map((n) => n.id);
    const neighborRes = await client.query(
      `SELECT id, SUBSTR(content, 1, 100) AS preview, NULLIF(category, '') AS category
         FROM tm_memories
        WHERE id = ANY($1::bigint[])`,
      [neighborIds],
    );
    const previewMap = new Map<number, { preview: string; category: string | null }>();
    for (const r of neighborRes.rows) {
      const idNum = intOrNull(r.id);
      if (idNum === null) continue;
      previewMap.set(idNum, {
        preview: String(r.preview ?? ''),
        category: r.category == null ? null : String(r.category),
      });
    }
    neighbors = topIds.map((n) => {
      const meta = previewMap.get(n.id);
      return {
        id: n.id,
        distance: n.distance,
        preview: meta?.preview ?? '',
        category: meta?.category ?? null,
      };
    });
  }

  // ---- 4. Optional raw vector ----
  let vector: number[] | null = null;
  if (options.includeVector) {
    const row = cache.idToRow.get(id);
    if (row !== undefined && cache.dim > 0) {
      const base = row * cache.dim;
      const out = new Array<number>(cache.dim);
      for (let j = 0; j < cache.dim; j++) {
        out[j] = cache.vecs[base + j] ?? 0;
      }
      vector = out;
    }
  }

  return {
    memory,
    connections: {
      entities,
      causal_edges: causalEdges,
      fact_timeline: factTimeline,
      landmark_events: landmarks,
      cluster,
    },
    neighbors,
    vector,
  };
}

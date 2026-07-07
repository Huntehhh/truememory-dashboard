/**
 * Aging tab callouts — decay_leader, long_stored_stranger, surprise_faded,
 * cluster_nobody_visited, retrieval_gap, memory_horizon.
 * See ./types.ts for MemoryAging and CalloutPayload.
 */
import type { CalloutPayload, MemoryAging, PgRunner } from './types.js';

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

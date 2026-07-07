/**
 * Memory feed + category endpoints.
 * See ./types.ts for MemoryFeedRow, MemoryFeedCategory, and MemoryByCategoryRow.
 */
import type {
  MemoryByCategoryRow,
  MemoryFeedCategory,
  MemoryFeedRow,
  PgRunner,
} from './types.js';
import { intOrNull, numOrNull, tsToIso } from './types.js';

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

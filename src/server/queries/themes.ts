/**
 * UMAP themes — tm_themes_cache read-through for the 05-themes.html tab.
 * See ./types.ts for MemoryThemePoint, MemoryThemesResp, and MemoryThemeTier.
 */
import type {
  MemoryThemePoint,
  MemoryThemeTier,
  MemoryThemesResp,
  PgRunner,
} from './types.js';
import { intOrNull, numOrNull, tsToIso } from './types.js';

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

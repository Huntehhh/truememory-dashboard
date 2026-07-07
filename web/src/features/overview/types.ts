/**
 * API-tolerant types for the Overview page.
 *
 * The dashboard server's TypeScript source-of-truth
 * (`src/server/queries/types.ts`) declares richer shapes than the *live*
 * matview fast-path currently emits — several derived fields
 * (`gate_pass_rate_delta_pts`, `growth_pct_7d`, `retrievals_7d` on
 * by-category) are absent from the wire when the matview hasn't been
 * regenerated. These types make every derived field optional so the
 * frontend renders gracefully whether or not the mv is fresh.
 */

/** GET /api/memory/kpi */
export interface KpiPayload {
  total_memories: number
  gate_pass_rate: number | null
  retrieved_7d: number
  db_size_bytes: number
  growth_this_week: number
  /** Derived fields — present when the mv has caught up; missing otherwise. */
  gate_pass_rate_delta_pts?: number | null
  growth_pct_7d?: number | null
  added_this_week?: number
  corpus_size_mb?: number | null
}

export interface KpiEnvelope {
  data: KpiPayload
}

/** GET /api/memory/activity?days=N */
export interface ActivityRow {
  day: string
  count: number
}

export interface ActivityEnvelope {
  window_days: number
  data: ActivityRow[]
}

/** GET /api/memory/by-category?days=N */
export interface ByCategoryRow {
  category: string
  count: number
  median_salience: number | null
  /** Optional — absent from current live matview. */
  retrievals_7d?: number
}

export interface ByCategoryEnvelope {
  window_days: number
  data: ByCategoryRow[]
}

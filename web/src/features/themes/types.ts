/**
 * Themes API types — matched against live GET /api/memory/theme-tiers +
 * GET /api/memory/themes?tier= (2026-07-07). Source of truth:
 * src/server/queries/themes.ts + src/server/queries/types.ts.
 *
 * Point counts (live, 2026-07-07): basepro=546, pro=319, edge=260 — the
 * scatter is well within a single-SVG budget (<1000 nodes) for every tier,
 * so no canvas/webgl fallback is needed at this scale.
 */

export interface ThemeTier {
  tier: string
  points: number
  clusters: number
}

export interface ThemeTierEnvelope {
  data: ThemeTier[]
}

export interface ThemePoint {
  id: number
  memory_id: number
  x: number
  y: number
  cluster_id: string
  cluster_label: number
  cluster_name: string | null
  label: string
  category: string | null
  salience: number | null
  retrievals: number
  last_retrieved_at: string | null
}

export interface ThemesPayload {
  points: ThemePoint[]
  computed_at: string | null
  tier: string | null
  note?: string
}

export interface ThemesEnvelope {
  data: ThemesPayload
}

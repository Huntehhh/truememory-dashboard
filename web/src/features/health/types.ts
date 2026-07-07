/**
 * Health API types — matched against the live `/api/memory/health-detail`
 * payload (2026-07-07). See src/server/queries for the server-side shape.
 *
 * Real-world realities baked into the type comments (so downstream renderers
 * make the right null-vs-empty distinctions):
 *
 * - `tiers[]` is always populated (one row per registered embedding tier).
 *   Coverage percent is already scaled to 0–100 (26.03 means 26.03%, NOT
 *   0.2603) and can be null when the tier has no vectors yet. Exactly one row
 *   has `active: true` — resolved by the backend from the tier with the most
 *   vectors, not from a config flag.
 *
 * - `rebuild_status[]` is almost always empty — it only carries live/recent
 *   re-embed rows from the engine's status table. Empty means "no re-embed
 *   running", not "unknown".
 *
 * - `model_server` is a compound state: `status_file_exists` and
 *   `port_file_exists` are independent probes. Both true = healthy; one =
 *   partial (typical mid-boot state or a stale port lock); neither = down.
 *
 * - `backlog_count` / `extracted_count` are null when the pipeline directories
 *   don't exist yet (fresh install), zero when they're empty. Treat null and
 *   0 differently at render time — `—` vs `0`.
 */

export interface HealthTier {
  tier: string
  model: string | null
  vectors: number
  total_messages: number
  coverage_pct: number | null
  active: boolean
  embedding_dim: number | null
  last_embedded_id: number | null
  last_updated: string | null
}

export interface RebuildRow {
  id: number
  tier_group: string | null
  target_tier: string | null
  status: string | null
  action: string | null
  total_messages: number | null
  processed_messages: number | null
  progress_pct: number | null
  eta_seconds: number | null
  batch_size: number | null
  throughput_ips: number | null
  ram_pct: number | null
  pressure: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  backup_path: string | null
  last_heartbeat: string | null
}

export interface ModelServerState {
  status_file_exists: boolean
  status_content: string | null
  port_file_exists: boolean
  port: number | null
}

export interface HealthDetail {
  tiers: HealthTier[]
  rebuild_status: RebuildRow[]
  model_server: ModelServerState
  backlog_count: number | null
  extracted_count: number | null
}

export interface HealthDetailEnvelope {
  data: HealthDetail
}

/** Composite model-server verdict — see utils.serverStatusFrom(). */
export type ServerHealth = 'healthy' | 'partial' | 'down'

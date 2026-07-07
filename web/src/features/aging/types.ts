/**
 * API-tolerant types for the Aging page.
 *
 * Mirrored against live payloads on 2026-07-07:
 *   GET /api/memory/aging         — six callouts, each nullable
 *   GET /api/memory/decay-panels  — three histograms + a scatter sample
 *
 * The aging endpoint returns Postgres rows coerced to JSON — every callout
 * carries a `memory_id` (except cluster_nobody_visited, which is category-
 * scoped, and memory_horizon, which is a global aggregate). Fields that the
 * source query can leave NULL (salience, surprise_score) are typed nullable.
 *
 * The decay-panels payload is currently partial — salience_histogram and
 * surprise_histogram often return [] because tm_telemetry lacks salience /
 * surprise rows. The frontend treats [] as "not emitting yet" and renders
 * a muted placeholder — sparse ≠ broken.
 */

/** GET /api/memory/aging — callout payloads (each nullable). */
export interface DecayLeaderCallout {
  memory_id: number
  content_preview: string
  salience: number | null
  days_since_retrieval: number
  days_until_threshold: number
}

export interface LongStoredStrangerCallout {
  memory_id: number
  content_preview: string
  days_old: number
  salience: number | null
  never_retrieved: boolean
}

export interface SurpriseFadedCallout {
  memory_id: number
  content_preview: string
  days_old: number
  original_surprise_score: number | null
  days_since_touch: number
}

export interface ClusterNobodyVisitedCallout {
  category: string
  memory_count: number
  zero_retrievals: boolean
  avg_embedding_density: number | null
}

export interface RetrievalGapCallout {
  memory_id: number
  content_preview: string
  semantic_match_count: number
  never_returned: boolean
}

export interface MemoryHorizonCallout {
  horizon_days: number
  retrieval_distance_at_horizon: number | null
}

export interface AgingPayload {
  decay_leader: DecayLeaderCallout | null
  long_stored_stranger: LongStoredStrangerCallout | null
  surprise_faded: SurpriseFadedCallout | null
  cluster_nobody_visited: ClusterNobodyVisitedCallout | null
  retrieval_gap: RetrievalGapCallout | null
  memory_horizon: MemoryHorizonCallout | null
}

export interface AgingEnvelope {
  data: AgingPayload
}

/** GET /api/memory/decay-panels */
export interface DecayHistBucket {
  bucket: number
  count: number
}

export interface DecayScatterPoint {
  id: number
  age_days: number
  decay: number
  is_outlier?: boolean
  is_relevant?: boolean
}

export interface DecayPanelsPayload {
  decay_histogram: DecayHistBucket[]
  salience_histogram: DecayHistBucket[]
  surprise_histogram: DecayHistBucket[]
  decay_age_scatter: DecayScatterPoint[]
}

export interface DecayPanelsEnvelope {
  data: DecayPanelsPayload
}

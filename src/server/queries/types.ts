/**
 * Shared types + coercion helpers for the /api/memory/* query modules.
 *
 * Kept as one file so every sibling query module has a single import
 * source for the PgRunner runner alias, the JSON-ready coercion helpers,
 * and the exported result shapes. See ./index.ts for the public API surface
 * re-exported to callers of the old `memory-queries.ts` module.
 */
import type { Client, Pool } from 'pg';

// PgRunner: accepts either a bare Client or a Pool (Pool implements .query()).
// Used so memory-routes.ts can pass either without a cast.
export type PgRunner = Pick<Client, 'query'> | Pool;

// ---------- shared coercion (mirrors queries.ts) ----------

export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(v: unknown): number | null {
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
export function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export function tsToIso(v: unknown): string | null {
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

export type CalloutPayload = Record<string, unknown> | null;
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

export type MemoryFeedCategory = { category: string; count: number };

export type MemoryThemeTier = { tier: string; points: number; clusters: number };

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

export type GateRich = {
  pass_rate: number;
  pass_count: number;
  reject_count: number;
  reject_reasons: Array<{ reason_code: string; count: number; pct: number; interpretation: string }>;
  session_pass_rates: number[];
};

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

export type MemoryDecayPanels = {
  decay_histogram: DecayHistBucket[];
  salience_histogram: DecayHistBucket[];
  surprise_histogram: DecayHistBucket[];
  decay_age_scatter: DecayScatterPoint[];
};

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

// ============================================================================
// Entities — SQLite entity_profiles read-through. The four JSON-in-text columns
// (traits, communication_style, topics, relationships) are parsed defensively:
// on parse success we return the parsed value (object / array / primitive), on
// parse failure we return the raw string so the payload never silently drops
// data. Empty / null column → JS null. Table absent → [] (older installs).
// ============================================================================

export type EntityProfileRow = {
  entity: string;
  message_count: number | null;
  // Each of the four JSON columns below is either:
  //   - a parsed JS value (object / array / primitive) if JSON.parse succeeds,
  //   - the raw string if the column held non-JSON text,
  //   - null if the column was NULL or empty.
  traits: unknown;
  communication_style: unknown;
  topics: unknown;
  relationships: unknown;
  updated_at: string | null;
};

// ============================================================================
// Timeline — fact_timeline grouped into supersession chains. Each chain walks
// forward via superseded_by (X.superseded_by = Y means Y is newer than X), so
// chain[0] is the oldest, chain[chain.length-1] is the newest. The tip has
// `active: true`. Rows outside any chain (dangling superseded_by, cycles) are
// surfaced as singleton chains so no row is dropped.
// ============================================================================

export type FactTimelineRow = {
  id: number;
  subject: string;
  fact: string;
  source_message_id: number | null;
  timestamp: string | null;
  superseded_by: number | null;
  entity_scope: string | null;
  valid_from: string | null;
  valid_to: string | null;
  status: string | null;
  active: boolean;
};

export type FactTimelineChain = {
  subject: string;
  chain: FactTimelineRow[];
};

export type MemoryTimeline = {
  chains: FactTimelineChain[];
};

// ============================================================================
// Sessions — episodes + landmark_events merged into a single chronological
// payload. Both lists are newest-first; ?limit clamps each list independently.
// related_entities on landmark rows is parsed defensively like the entity JSON
// columns (parsed on success, raw string on failure, null when empty/absent).
// ============================================================================

export type EpisodeRow = {
  id: number;
  start_time: string | null;
  end_time: string | null;
  message_count: number | null;
  summary: string | null;
};

export type LandmarkEventRow = {
  id: number;
  event_name: string;
  timestamp: string | null;
  event_type: string | null;
  related_entities: unknown;
  source_message_id: number | null;
};

export type MemorySessions = {
  episodes: EpisodeRow[];
  landmarks: LandmarkEventRow[];
};

// ============================================================================
// Health detail — per-tier embed coverage from vector_cache_registry vs the
// live message count, plus rebuild_status rows (live re-embed progress, usually
// empty), plus filesystem probes for ~/.truememory/{model_server.status,
// model_server.port, backlog/, extracted/}. Everything is null-tolerant — a
// missing table or file degrades to null / [], never surfaces as a 500.
// ============================================================================

export type HealthTier = {
  tier: string;
  model: string | null;
  vectors: number;
  total_messages: number;
  // coverage_pct = min(100, vectors / total_messages * 100). NULL when
  // total_messages is 0 (division by zero guard — a cold DB reports null).
  coverage_pct: number | null;
  // active tier = the row with the highest vector_count in vector_cache_registry.
  // Ties resolve to the first row seen; on tables with 0 or 1 rows the flag
  // still holds the invariant "exactly one active tier, else none".
  active: boolean;
  embedding_dim: number | null;
  last_embedded_id: number | null;
  // last_updated is stored as a REAL epoch-seconds in SQLite. We surface an
  // ISO-8601 string for consistency with the rest of the API.
  last_updated: string | null;
};

export type RebuildStatusRow = {
  id: number;
  tier_group: string;
  target_tier: string;
  status: string;
  action: string | null;
  total_messages: number | null;
  processed_messages: number | null;
  progress_pct: number | null;
  eta_seconds: number | null;
  batch_size: number | null;
  throughput_ips: number | null;
  ram_pct: number | null;
  pressure: number | null;
  error: string | null;
  // The three timestamp columns are REAL epoch seconds in SQLite — surfaced
  // as ISO strings for the frontend.
  started_at: string | null;
  completed_at: string | null;
  backup_path: string | null;
  last_heartbeat: string | null;
};

export type ModelServerFsStatus = {
  // Existence flags stay separate from content so the frontend can render
  // "missing" without inspecting the string.
  status_file_exists: boolean;
  status_content: string | null;
  port_file_exists: boolean;
  port: number | null;
};

export type MemoryHealthDetail = {
  tiers: HealthTier[];
  // Live re-embed progress. Almost always empty (rebuild_status is only
  // populated during an active reconfigure_embeddings run).
  rebuild_status: RebuildStatusRow[];
  model_server: ModelServerFsStatus;
  // File counts in ~/.truememory/backlog/ and ~/.truememory/extracted/. null
  // when the directory is absent (tolerated — an older install may not have
  // materialized them yet).
  backlog_count: number | null;
  extracted_count: number | null;
};

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

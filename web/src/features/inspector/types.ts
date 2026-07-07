/**
 * Inspector API types — matched against live GET /api/memory/inspect/:id
 * (2026-07-07). Source of truth on the server: src/server/queries/inspect.ts.
 *
 * The endpoint wraps everything in an outer `{ data: ... }` envelope; the
 * inner `memory` may be null (endpoint returns HTTP 404 in that case, so we
 * never actually parse a null memory — kept in the type for completeness).
 *
 * NOTE: neither the wire payload nor tm_memories itself carries an
 * `is_directive` boolean today. The task asked for a directive badge; the
 * feature omits it and flags the missing signal in the return summary
 * rather than inferring one from content heuristics.
 */

export interface InspectMemory {
  id: number
  content: string
  category: string | null
  sender: string | null
  recipient: string | null
  modality: string | null
  emotional_valence: number | null
  created_at: string | null
  salience: number | null
  last_retrieved_at: string | null
  retrieval_count: number
  embedding_dim: number | null
}

export interface InspectEntity {
  entity: string
  message_count: number | null
  traits: string | null
  communication_style: string | null
  topics: string | null
  relationships: string | null
  updated_at: string | null
}

export interface InspectCausalEdge {
  id: number
  direction: 'cause_of' | 'effect_of'
  other_id: number
  other_preview: string
  relationship: string | null
  confidence: number | null
}

export interface InspectFactTimelineRow {
  id: number
  subject: string
  fact: string
  timestamp: string | null
  superseded_by: number | null
  entity_scope: string | null
  valid_from: string | null
  valid_to: string | null
  status: string | null
}

export interface InspectLandmark {
  id: number
  event_name: string
  timestamp: string | null
  event_type: string | null
  related_entities: string | null
}

export interface InspectCluster {
  cluster_id: number
  noise: boolean
  cluster_size: number
  summary: string | null
  session_range: string | null
}

export interface InspectNeighbor {
  id: number
  distance: number
  preview: string
  category: string | null
}

export interface InspectPayload {
  memory: InspectMemory | null
  connections: {
    entities: InspectEntity[]
    causal_edges: InspectCausalEdge[]
    fact_timeline: InspectFactTimelineRow[]
    landmark_events: InspectLandmark[]
    cluster: InspectCluster | null
  }
  neighbors: InspectNeighbor[]
  /** 256-dim L2-normalized embedding when ?vector=1, else null. */
  vector: number[] | null
}

export interface InspectEnvelope {
  data: InspectPayload
}

import { fetchJson } from '@/lib/api'

/**
 * Simulator wire contract — verified end-to-end against a live
 * sidecar/tm_sidecar/simulate.py response on 2026-07-07 (curl to
 * 127.0.0.1:8504/simulate with skip.reranker=true). If any field
 * migrates, this file is the ONE place to update — every stage renderer
 * narrows from these unions instead of restating them.
 *
 * Wire semantics inversion: the payload uses `skip.<stage> = true` to mean
 * "do not run that stage", matching the engine's `_skip_*` internal flags.
 * The composer flips this — its Switch labels read as ON = "run this stage"
 * because that's how an operator thinks. The mapping happens in QueryComposer.
 */

// ── Candidate row variants ─────────────────────────────────────────────

export type ScoreSpace =
  | 'bm25_rank'
  | 'cosine'
  | 'rrf'
  | 'blended'
  | 'rerank'

export interface CandidateBase {
  id: number
  content_preview: string
  score?: number | null
  score_space: ScoreSpace | string
}

export interface FtsExtras {
  raw_score?: number | null
}
export interface RrfExtras {
  rrf_score?: number | null
  fts_rank?: number | null
  vec_rank?: number | null
  source?: string | null
}
export interface SalienceExtras {
  salience?: number | null
  min_salience?: number | null
  margin?: number | null
  passed?: boolean
  entity_boost?: number | null
  /** Only present when the whole stage was skipped. */
  skipped?: boolean
}
export interface SurpriseExtras {
  score_before?: number | null
  score_after?: number | null
  delta?: number | null
  surprise?: number | null
  skipped?: boolean
}
export interface RerankerExtras {
  rank_before?: number | null
  rank_after?: number | null
}

export type StageExtras =
  | FtsExtras
  | RrfExtras
  | SalienceExtras
  | SurpriseExtras
  | RerankerExtras
  | Record<string, unknown>

export interface Candidate extends CandidateBase {
  extra?: StageExtras | null
}

/**
 * The reranker-skipped rows are a genuine special case — the sidecar drops
 * the `score` field and swaps in a `SKIPPED: true` flag alongside the
 * before/after ranks. Kept separate so we don't have to poke a
 * `SKIPPED?: boolean` sentinel into the base type.
 */
export interface RerankerSkippedCandidate {
  id: number
  content_preview: string
  score_space: 'rerank' | string
  SKIPPED: true
  rank_before: number | null
  rank_after: number | null
}

export type RerankerCandidate = Candidate | RerankerSkippedCandidate

// ── Stage variants ─────────────────────────────────────────────────────

export type StageName =
  | 'fts'
  | 'vector'
  | 'rrf_fusion'
  | 'salience_guard'
  | 'surprise_boost'
  | 'reranker'

export interface StageBase {
  name: StageName
  skipped?: boolean
  candidate_count?: number
  candidates: Candidate[]
  error?: string | null
}

export interface FtsStage extends StageBase {
  name: 'fts'
}
export interface VectorStage extends StageBase {
  name: 'vector'
  available?: boolean
  error?: string | null
}
export interface RrfStage extends StageBase {
  name: 'rrf_fusion'
}
export interface SalienceStage extends StageBase {
  name: 'salience_guard'
  min_salience?: number
  kept_count?: number
}
export interface SurpriseStage extends StageBase {
  name: 'surprise_boost'
}
export interface RerankerStage extends Omit<StageBase, 'candidates'> {
  name: 'reranker'
  candidates: RerankerCandidate[]
}

export type Stage =
  | FtsStage
  | VectorStage
  | RrfStage
  | SalienceStage
  | SurpriseStage
  | RerankerStage

// ── Top-level ──────────────────────────────────────────────────────────

export interface HookGate {
  would_fire: boolean
  reasons: string[]
  search_intensity?: string
  cadence_note?: string
}

export interface AuthoritativeRow {
  id: number
  content_preview: string
  score: number | null
  source: string | null
  category: string | null
  sender: string | null
  timestamp: string | null
}

export interface Authoritative {
  count: number
  results: AuthoritativeRow[]
}

export interface InjectionPreview {
  text: string
  chars_used: number
  budget: number
  per_memory_chars: number
  included_ids: (number | null)[]
  truncated_ids: (number | null)[]
  dropped_ids: (number | null)[]
}

export interface SimulateResponse {
  query: string
  hook_gate: HookGate
  stages: Stage[]
  authoritative: Authoritative
  divergence: boolean
  injection_preview: InjectionPreview
}

// ── Request ────────────────────────────────────────────────────────────

export interface SimulateSkip {
  reranker: boolean
  salience_guard: boolean
  surprise_boost: boolean
}

export interface SimulateHook {
  budget_chars?: number | null
  max_items?: number | null
}

export interface SimulateRequest {
  query: string
  limit?: number
  skip?: SimulateSkip
  hook?: SimulateHook | null
}

/**
 * POST /api/sim/simulate — first call after boot lazily builds the
 * TrueMemory engine (SQLite + vector index warm-up). With the reranker
 * enabled the first call additionally spins the cross-encoder onto the
 * GPU which can take up to a minute — the sidecar's read timeout is
 * generous so we let the browser fetch inherit that.
 */
export async function fetchSimulate(
  req: SimulateRequest,
): Promise<SimulateResponse> {
  return fetchJson<SimulateResponse>('/api/sim/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

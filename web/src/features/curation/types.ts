/**
 * Curation Studio — wire types.
 *
 * Shapes verified live against sidecar/tm_sidecar/{curation,directives}.py on
 * 2026-07-07 (curl to 127.0.0.1:8504). If any field migrates on the sidecar
 * side, this file is the ONE place to update — every renderer and hook
 * narrows from these interfaces.
 */

// ── Preview responses (two-phase confirm) ──────────────────────────────

/** Full memory row surfaced by preview-forget / preview-recategorize. */
export interface CurationMemory {
  id: number
  content: string
  sender: string | null
  recipient: string | null
  timestamp: string | null
  category: string | null
  modality: string | null
  directive: boolean
}

/** Neighbor rows are the operator's "wait, is this the only copy?" safety net. */
export interface CurationNeighbor {
  id: number | null
  content_preview: string
  cosine: number | null
  distance: number | null
  sender: string | null
  timestamp: string | null
}

export interface PreviewEnvelope {
  memory: CurationMemory
  neighbors: CurationNeighbor[]
  confirm_token: string
  expires_in_seconds: number
}

/** preview-delete-directive returns a slightly different envelope. */
export interface DirectivePreviewEnvelope {
  directive: CurationMemory
  confirm_token: string
  expires_in_seconds: number
}

// ── Write responses ────────────────────────────────────────────────────

export interface ForgetResponse {
  ok: boolean
  audit_id?: string
}

export interface RecategorizeResponse {
  ok: boolean
  audit_id?: string
  memory?: CurationMemory
}

// ── Directives ─────────────────────────────────────────────────────────

export interface DirectiveRow {
  id: number
  content: string
  user_id: string
  created_at: string | null
  category: string
}

export interface DirectivesEnvelope {
  directives: DirectiveRow[]
  count: number
}

export interface DirectiveCreateResponse {
  id?: number
  ok?: boolean
  // The engine.add() shape isn't strictly typed on the sidecar — we accept
  // any additional fields it emits and don't rely on them for rendering.
  [k: string]: unknown
}

export interface DirectiveDeleteResponse {
  ok: boolean
}

// ── Junk-heuristic vocab (Review Queue) ────────────────────────────────

/**
 * Reasons a memory can land in the review queue. Each row surfaces at most
 * one flag at a time (the first one that trips, in priority order), so the
 * filter pills stay clean.
 */
export type JunkFlag =
  | 'dict_shape'
  | 'uncategorized'
  | 'stale_unretrieved'
  | 'tiny_fragment'

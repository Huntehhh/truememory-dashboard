/**
 * Timeline API types — matched against live `/api/memory/timeline` payload
 * (2026-07-07).
 *
 * Reality notes on the wire:
 * - `valid_to` is emitted as an EMPTY STRING `""` (not `null`) when the row is
 *   currently active. We normalize that in utils.
 * - `entity_scope` can be `""` when the fact has no scope.
 * - `chain` is ordered oldest → newest; the newest row carries `active: true`.
 * - Single-row chains carry `active: true` on their only row.
 */

export interface TimelineFactRow {
  id: number
  subject: string
  fact: string
  source_message_id: number | null
  timestamp: string | null
  superseded_by: number | null
  entity_scope: string | null
  valid_from: string | null
  valid_to: string | null
  status: string | null
  active: boolean
}

export interface TimelineChain {
  subject: string
  chain: TimelineFactRow[]
}

export interface TimelineEnvelope {
  data: {
    chains: TimelineChain[]
  }
}

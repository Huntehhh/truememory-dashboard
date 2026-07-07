/**
 * Entities API types — matched against live `/api/memory/entities` (2026-07-07).
 *
 * The four JSON columns (`traits`, `communication_style`, `topics`,
 * `relationships`) arrive as `unknown` on purpose: the backend parses
 * defensively and, on a JSON parse fail, hands back the raw string instead of
 * dropping the row. The card renders each field defensively via the narrowers
 * in `./utils` — array / object → normal render, string → "unparsed" pre block,
 * null/empty → skip.
 */

export interface EntityRow {
  entity: string
  message_count: number | null
  traits: unknown
  communication_style: unknown
  topics: unknown
  relationships: unknown
  updated_at: string | null
}

export interface EntitiesEnvelope {
  data: EntityRow[]
}

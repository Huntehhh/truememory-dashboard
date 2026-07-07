/**
 * Sessions API types — matched against live `/api/memory/sessions` payload
 * (2026-07-07). The endpoint returns two parallel lists:
 *
 * - `episodes`   coherent stretches of activity the engine detected, newest
 *                first by `start_time`. `summary` is currently null on every
 *                real row — the empty-summary path is the common case.
 * - `landmarks`  moments the engine flagged as significant events, newest
 *                first by `timestamp`. `related_entities` is defensively
 *                parsed on the server and usually arrives as `string[]`,
 *                occasionally `[]`, and could theoretically be a raw string
 *                if a JSON parse fails upstream — components guard for both.
 */

export interface Episode {
  id: number
  start_time: string | null
  end_time: string | null
  message_count: number | null
  summary: string | null
}

export interface Landmark {
  id: number
  event_name: string
  timestamp: string | null
  event_type: string | null
  related_entities: unknown
  source_message_id: number | null
}

export interface SessionsEnvelope {
  limit: number
  data: {
    episodes: Episode[]
    landmarks: Landmark[]
  }
}

/**
 * Row-limit union — `'all'` means "no limit query param, server returns
 * everything." Kept as a string literal on that end so the segmented control
 * can drive the query key without a magic number.
 */
export type SessionsLimit = 25 | 100 | 'all'
export const SESSIONS_LIMITS: readonly SessionsLimit[] = [25, 100, 'all'] as const

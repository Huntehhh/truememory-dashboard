/**
 * Feed API types — matched against live `/api/memory/feed` +
 * `/api/memory/feed-categories` payloads (2026-07-07).
 *
 * NOTE: the feed row does NOT include an `is_directive` boolean. The task
 * proposed a directive flag; since the backend doesn't emit one on this
 * endpoint, no directive badge is rendered.
 */

export interface FeedRow {
  id: number
  ts: string | null
  content_preview: string
  category: string | null
  sender: string | null
  salience: number | null
  retrieval_count: number
  last_retrieved_at: string | null
}

export interface FeedEnvelope {
  limit: number
  category: string | null
  data: FeedRow[]
}

export interface FeedCategory {
  category: string
  count: number
}

export interface FeedCategoryEnvelope {
  data: FeedCategory[]
}

/** Row limits offered in the toolbar. */
export type FeedLimit = 50 | 200 | 500
export const FEED_LIMITS: readonly FeedLimit[] = [50, 200, 500] as const

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type {
  FeedCategoryEnvelope,
  FeedEnvelope,
  FeedLimit,
} from './types'

/**
 * Feed query hooks. `keys.feed.list(params)` from the central factory keeps
 * cache scoping consistent across the app.
 */

const CATEGORIES_KEY = ['feed', 'categories'] as const

async function fetchFeed(limit: FeedLimit, category: string | null): Promise<FeedEnvelope> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (category && category !== 'all') params.set('category', category)
  return fetchJson<FeedEnvelope>(`/api/memory/feed?${params.toString()}`)
}

async function fetchFeedCategories(): Promise<FeedCategoryEnvelope> {
  return fetchJson<FeedCategoryEnvelope>('/api/memory/feed-categories')
}

export function useFeed(
  limit: FeedLimit,
  category: string | null,
): UseQueryResult<FeedEnvelope> {
  return useQuery({
    queryKey: keys.feed.list({ limit, category: category ?? 'all' }),
    queryFn: () => fetchFeed(limit, category),
  })
}

export function useFeedCategories(): UseQueryResult<FeedCategoryEnvelope> {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: fetchFeedCategories,
    staleTime: 60_000,
  })
}

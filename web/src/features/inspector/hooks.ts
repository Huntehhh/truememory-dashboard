import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import { fetchInspect } from './api'
import type { InspectPayload } from './types'
import type { FeedEnvelope } from '@/features/feed/types'

/**
 * Query hooks for the Inspector.
 *
 * `keys.inspector.memory(id)` from the central factory keeps cache scoping
 * consistent; we extend it locally with a `+vec` suffix so the "reveal raw
 * vector" fetch is a separate cache entry (no cross-invalidation between the
 * two variants).
 */

const RECENT_KEY = ['inspector', 'recent'] as const

export function useInspect(
  id: number | null,
  withVector: boolean,
): UseQueryResult<InspectPayload> {
  return useQuery({
    queryKey: [
      ...keys.inspector.memory(String(id ?? 'none')),
      withVector ? 'vec' : 'meta',
    ],
    queryFn: () => {
      if (id == null) throw new Error('missing id')
      return fetchInspect(id, withVector)
    },
    enabled: id != null,
    // Even when raw-vector is off, don't refetch aggressively — inspecting a
    // memory is a deliberate action, no need to poll.
    staleTime: 60_000,
  })
}

/**
 * Recent-memories list for the landing page. Reuses /api/memory/feed —
 * cheaper than a new endpoint and matches the shape MemoryRow already
 * renders. The Inspector links to /inspector/:id from the row directly.
 */
export function useInspectRecent(limit: number = 20): UseQueryResult<FeedEnvelope> {
  return useQuery({
    queryKey: [...RECENT_KEY, limit] as const,
    queryFn: () =>
      fetchJson<FeedEnvelope>(`/api/memory/feed?limit=${limit}`),
    staleTime: 30_000,
  })
}

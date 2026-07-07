import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type { EntitiesEnvelope } from './types'

/**
 * Entities query hook. Rows come back pre-sorted by message_count DESC,
 * entity ASC — no client-side ordering needed. Uses the shared React Query
 * key factory so a Curation-Studio invalidation can reach this cache without
 * knowing its shape.
 */

async function fetchEntities(): Promise<EntitiesEnvelope> {
  return fetchJson<EntitiesEnvelope>('/api/memory/entities')
}

export function useEntities(): UseQueryResult<EntitiesEnvelope> {
  return useQuery({
    queryKey: keys.entities.list(),
    queryFn: fetchEntities,
  })
}

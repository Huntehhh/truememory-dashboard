import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type { SessionsEnvelope, SessionsLimit } from './types'

/**
 * Sessions query — fetches episodes + landmarks in one envelope.
 *
 * `limit === 'all'` deliberately drops the query param: the backend returns
 * every episode/landmark when no limit is supplied. Keeping the sentinel on
 * this side rather than translating to a large number means the cache key
 * still says "all" for the operator's mental model.
 */
async function fetchSessions(limit: SessionsLimit): Promise<SessionsEnvelope> {
  const path =
    limit === 'all'
      ? '/api/memory/sessions'
      : `/api/memory/sessions?limit=${limit}`
  return fetchJson<SessionsEnvelope>(path)
}

export function useSessions(limit: SessionsLimit): UseQueryResult<SessionsEnvelope> {
  return useQuery({
    queryKey: [...keys.sessions.all(), 'list', { limit }] as const,
    queryFn: () => fetchSessions(limit),
  })
}

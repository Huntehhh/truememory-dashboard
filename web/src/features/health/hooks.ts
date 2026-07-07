import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type { HealthDetailEnvelope } from './types'

/**
 * `keys.ops.health()` is the shared factory key (['ops','health']) — reuse it
 * so any future page or SSE nudge that touches ops health invalidates the
 * same cache slot.
 *
 * Poll interval mirrors the injections feed (30s while foregrounded) — the
 * re-embed engine emits progress ~every few seconds, so a 30s cadence keeps
 * the ETA readable without hammering the DB.
 */

async function fetchHealthDetail(): Promise<HealthDetailEnvelope> {
  return fetchJson<HealthDetailEnvelope>('/api/memory/health-detail')
}

export function useHealthDetail(): UseQueryResult<HealthDetailEnvelope> {
  return useQuery({
    queryKey: keys.ops.health(),
    queryFn: fetchHealthDetail,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

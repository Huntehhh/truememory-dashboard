import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type {
  AgingEnvelope,
  AgingPayload,
  DecayPanelsEnvelope,
  DecayPanelsPayload,
} from './types'

/**
 * Aging query hooks — nested under `keys.aging.all()` so the whole surface
 * invalidates in one call when the mirror catches up. Both endpoints unwrap
 * the `{ data }` envelope so consumers see the raw payload.
 */
const agingKeys = {
  callouts: () => [...keys.aging.all(), 'callouts'] as const,
  decayPanels: () => [...keys.aging.all(), 'decayPanels'] as const,
}

async function fetchAging(): Promise<AgingPayload> {
  const env = await fetchJson<AgingEnvelope>('/api/memory/aging')
  return env.data
}

async function fetchDecayPanels(): Promise<DecayPanelsPayload> {
  const env = await fetchJson<DecayPanelsEnvelope>('/api/memory/decay-panels')
  return env.data
}

export function useAgingCallouts(): UseQueryResult<AgingPayload> {
  return useQuery({
    queryKey: agingKeys.callouts(),
    queryFn: fetchAging,
  })
}

export function useDecayPanels(): UseQueryResult<DecayPanelsPayload> {
  return useQuery({
    queryKey: agingKeys.decayPanels(),
    queryFn: fetchDecayPanels,
  })
}

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import type {
  GateEnvelope,
  GatePayload,
  OpenLoopsEnvelope,
  OpenLoopsPayload,
} from './types'

/**
 * Gate query hooks. There's no `keys.gate` in the central factory yet
 * (Gate is a new feature — the orchestrator will register the key when it
 * wires the route), so keys stay local for now. The pattern mirrors the
 * Overview hooks: a small object of `as const` tuples per query.
 */
const gateKeys = {
  summary: () => ['gate', 'summary'] as const,
  openLoops: () => ['gate', 'openLoops'] as const,
}

async function fetchGate(): Promise<GatePayload> {
  const env = await fetchJson<GateEnvelope>('/api/memory/gate')
  return env.data
}

async function fetchOpenLoops(): Promise<OpenLoopsPayload> {
  const env = await fetchJson<OpenLoopsEnvelope>('/api/memory/open-loops')
  return env.data
}

export function useGate(): UseQueryResult<GatePayload> {
  return useQuery({
    queryKey: gateKeys.summary(),
    queryFn: fetchGate,
  })
}

export function useOpenLoops(): UseQueryResult<OpenLoopsPayload> {
  return useQuery({
    queryKey: gateKeys.openLoops(),
    queryFn: fetchOpenLoops,
  })
}

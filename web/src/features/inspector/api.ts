import { fetchJson } from '@/lib/api'
import type { InspectEnvelope, InspectPayload } from './types'

/**
 * GET /api/memory/inspect/:id — memory + connections + top-10 neighbors.
 *
 * `withVector=true` appends `?vector=1` so the raw 256-float embedding is
 * included in the payload. Kept as a separate query key so the "reveal raw
 * vector" toggle doesn't force a refetch of the neighbor/connection metadata.
 *
 * 404 (unknown id) bubbles up as an `ApiError` from `fetchJson` with
 * `status === 404` and `error === 'memory not found'` — see the Detail page
 * for the graceful handling.
 */
export async function fetchInspect(
  id: number,
  withVector: boolean,
): Promise<InspectPayload> {
  const suffix = withVector ? '?vector=1' : ''
  const env = await fetchJson<InspectEnvelope>(`/api/memory/inspect/${id}${suffix}`)
  return env.data
}

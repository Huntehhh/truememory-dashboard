import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import type { TimelineEnvelope } from './types'

/**
 * Timeline query hooks.
 *
 * `keys.timeline.*` isn't yet defined in the central `queryClient` factory, so
 * we scope the key locally (same pattern as feed's `CATEGORIES_KEY` and
 * overview's `overviewKeys`). If the central factory grows a `timeline` entry
 * later, swap the local key for it in one place.
 */

const timelineKeys = {
  chains: () => ['timeline', 'chains'] as const,
}

async function fetchTimeline(): Promise<TimelineEnvelope> {
  return fetchJson<TimelineEnvelope>('/api/memory/timeline')
}

export function useTimeline(): UseQueryResult<TimelineEnvelope> {
  return useQuery({
    queryKey: timelineKeys.chains(),
    queryFn: fetchTimeline,
  })
}

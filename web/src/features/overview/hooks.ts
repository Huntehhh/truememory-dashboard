import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type {
  ActivityEnvelope,
  ByCategoryEnvelope,
  KpiEnvelope,
  KpiPayload,
} from './types'

/**
 * Query hooks for the Overview page.
 *
 * The base key factory in `lib/queryClient` exposes `overview.kpis()`. We
 * extend it locally (no edit to lib/queryClient) with an activity-window key
 * and a by-category-window key so cache lookups stay stable.
 */
const overviewKeys = {
  activity: (days: number) => ['overview', 'activity', days] as const,
  byCategory: (days: number) => ['overview', 'byCategory', days] as const,
}

async function fetchKpi(): Promise<KpiPayload> {
  const env = await fetchJson<KpiEnvelope>('/api/memory/kpi')
  return env.data
}

async function fetchActivity(days: number): Promise<ActivityEnvelope> {
  return fetchJson<ActivityEnvelope>(`/api/memory/activity?days=${days}`)
}

async function fetchByCategory(days: number): Promise<ByCategoryEnvelope> {
  return fetchJson<ByCategoryEnvelope>(`/api/memory/by-category?days=${days}`)
}

export function useKpi(): UseQueryResult<KpiPayload> {
  return useQuery({
    queryKey: keys.overview.kpis(),
    queryFn: fetchKpi,
  })
}

export function useActivity(days: number = 84): UseQueryResult<ActivityEnvelope> {
  return useQuery({
    queryKey: overviewKeys.activity(days),
    queryFn: () => fetchActivity(days),
  })
}

export function useByCategory(days: number = 30): UseQueryResult<ByCategoryEnvelope> {
  return useQuery({
    queryKey: overviewKeys.byCategory(days),
    queryFn: () => fetchByCategory(days),
  })
}

import { QueryClient } from '@tanstack/react-query'

/**
 * One QueryClient for the whole app. Defaults chosen for a live observability
 * dashboard — stale after 30s, refetch when the operator refocuses the tab.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

/**
 * Centralized React Query key factory.
 * Every feature nests its keys under a stable root so cache invalidation
 * stays predictable (`queryClient.invalidateQueries({ queryKey: keys.feed.all })`).
 */
export const keys = {
  meta: {
    status: () => ['meta', 'status'] as const,
  },
  overview: {
    root: () => ['overview'] as const,
    kpis: () => ['overview', 'kpis'] as const,
  },
  feed: {
    all: () => ['feed'] as const,
    list: (params: Record<string, unknown> = {}) => ['feed', 'list', params] as const,
  },
  injections: {
    all: () => ['injections'] as const,
    list: (params: Record<string, unknown> = {}) => ['injections', 'list', params] as const,
  },
  themes: {
    all: () => ['themes'] as const,
    active: () => ['themes', 'active'] as const,
  },
  entities: {
    all: () => ['entities'] as const,
    list: (params: Record<string, unknown> = {}) => ['entities', 'list', params] as const,
  },
  sessions: {
    all: () => ['sessions'] as const,
  },
  ops: {
    health: () => ['ops', 'health'] as const,
  },
  aging: {
    all: () => ['aging'] as const,
  },
  simulator: {
    run: (payload: Record<string, unknown>) => ['simulator', 'run', payload] as const,
  },
  inspector: {
    memory: (id: string) => ['inspector', 'memory', id] as const,
  },
  curation: {
    queue: () => ['curation', 'queue'] as const,
  },
} as const

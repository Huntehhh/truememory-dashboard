import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { keys } from '@/lib/queryClient'
import { fetchThemeTiers, fetchThemes } from './api'
import type { ThemePoint, ThemeTier, ThemesPayload } from './types'

/**
 * Query hooks for the Themes page. Tier list uses `keys.themes.active()`;
 * the per-tier scatter payload gets its own scoped key so switching tiers
 * doesn't wipe the previous tier from cache — bounces back instantly.
 *
 * UMAP is recomputed hourly server-side (tm_themes_cache), so a 60s
 * staleTime is more than aggressive enough — we don't need to poll.
 */

const THEMES_SCATTER_KEY = ['themes', 'scatter'] as const

export function useThemeTiers(): UseQueryResult<ThemeTier[]> {
  return useQuery({
    queryKey: keys.themes.active(),
    queryFn: fetchThemeTiers,
    staleTime: 60_000,
  })
}

export function useThemes(
  tier: string | null,
): UseQueryResult<ThemesPayload> {
  return useQuery({
    queryKey: [...THEMES_SCATTER_KEY, tier ?? 'default'] as const,
    queryFn: () => fetchThemes(tier),
    staleTime: 60_000,
    // Don't fire until we've picked a tier. `null` while the tier list is
    // still loading (parent gates on that state).
    enabled: tier != null,
  })
}

// Re-export the shape so components can type their props without a deeper
// import chain.
export type { ThemePoint }

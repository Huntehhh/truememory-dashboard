import { fetchJson } from '@/lib/api'
import type {
  ThemePoint,
  ThemeTier,
  ThemeTierEnvelope,
  ThemesEnvelope,
  ThemesPayload,
} from './types'

export async function fetchThemeTiers(): Promise<ThemeTier[]> {
  const env = await fetchJson<ThemeTierEnvelope>('/api/memory/theme-tiers')
  return env.data
}

export async function fetchThemes(tier: string | null): Promise<ThemesPayload> {
  const suffix = tier ? `?tier=${encodeURIComponent(tier)}` : ''
  const env = await fetchJson<ThemesEnvelope>(`/api/memory/themes${suffix}`)
  return env.data
}

// Re-export the point type for consumers that only import from api.
export type { ThemePoint }

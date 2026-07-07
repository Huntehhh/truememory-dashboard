import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'paper' | 'ink'

interface ThemeState {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  toggle: () => void
}

/**
 * Zustand store for the app theme. Persists to localStorage under `tm-theme`
 * so the choice survives reloads. The <html> data-theme attribute is applied
 * by `useApplyTheme` (see below) plus an inline pre-hydration script in
 * index.html that prevents a light-to-dark flash on first paint.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'paper',
      setTheme: (t) => set({ theme: t }),
      toggle: () => set({ theme: get().theme === 'paper' ? 'ink' : 'paper' }),
    }),
    { name: 'tm-theme' },
  ),
)

/**
 * Small effect helper — mount once at the app root to keep <html data-theme>
 * in sync with the persisted store. Runs on every theme change, not just mount.
 */
export function applyThemeToDocument(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

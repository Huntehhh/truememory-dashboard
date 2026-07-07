/**
 * Config seam — every environment-dependent value or nav-list entry lives here.
 * NEVER hardcode personal paths, page routes, or the API base outside of this file.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Boxes,
  ClipboardList,
  Compass,
  FileSearch,
  GitBranch,
  Hourglass,
  LayoutDashboard,
  ListTree,
  Network,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  Wand2,
  Waves,
} from 'lucide-react'

/**
 * API base — empty string in dev (Vite proxies /api → http://127.0.0.1:8503).
 * In production the dashboard is served same-origin under /app so an empty base
 * still hits /api on the same host. Override via VITE_API_BASE if ever needed.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** Router basename — matches Vite `base: '/app/'`. */
export const ROUTER_BASENAME = '/app'

/** Nav grouping — controls SideNav headers and ordering. */
export type NavGroup = 'pulse' | 'diagnose' | 'understand' | 'operate'

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  pulse: 'Pulse',
  diagnose: 'Diagnose',
  understand: 'Understand',
  operate: 'Operate',
}

export const NAV_GROUP_ORDER: readonly NavGroup[] = [
  'pulse',
  'diagnose',
  'understand',
  'operate',
] as const

/**
 * Page registry — single source of truth for every route in the app.
 * `key` is used for React Query cache tagging + telemetry;
 * `path` is the URL under ROUTER_BASENAME.
 */
export interface PageDef {
  key: string
  path: string
  title: string
  eyebrow?: string
  icon: LucideIcon
  group: NavGroup
  /** Phase label for the placeholder card until the feature ships. */
  phase?: string
}

export const PAGES: readonly PageDef[] = [
  // Pulse
  {
    key: 'overview',
    path: '/',
    title: 'Overview',
    eyebrow: 'Pulse',
    icon: LayoutDashboard,
    group: 'pulse',
    phase: 'Phase 2',
  },
  {
    key: 'injections',
    path: '/injections',
    title: 'Injections',
    eyebrow: 'Pulse',
    icon: Sparkles,
    group: 'pulse',
    phase: 'Phase 2',
  },
  {
    key: 'feed',
    path: '/feed',
    title: 'Memory Feed',
    eyebrow: 'Pulse',
    icon: Waves,
    group: 'pulse',
    phase: 'Phase 2',
  },

  // Diagnose
  {
    key: 'simulator',
    path: '/simulator',
    title: 'Retrieval Simulator',
    eyebrow: 'Diagnose',
    icon: Wand2,
    group: 'diagnose',
    phase: 'Phase 3',
  },
  {
    key: 'inspector',
    path: '/inspector',
    title: 'Memory Inspector',
    eyebrow: 'Diagnose',
    icon: FileSearch,
    group: 'diagnose',
    phase: 'Phase 3',
  },
  {
    key: 'timeline',
    path: '/timeline',
    title: 'Timeline',
    eyebrow: 'Diagnose',
    icon: GitBranch,
    group: 'diagnose',
    phase: 'Phase 3',
  },

  // Understand
  {
    key: 'themes',
    path: '/themes',
    title: 'Themes',
    eyebrow: 'Understand',
    icon: Compass,
    group: 'understand',
    phase: 'Phase 4',
  },
  {
    key: 'entities',
    path: '/entities',
    title: 'Entities',
    eyebrow: 'Understand',
    icon: UserRoundSearch,
    group: 'understand',
    phase: 'Phase 4',
  },
  {
    key: 'sessions',
    path: '/sessions',
    title: 'Sessions',
    eyebrow: 'Understand',
    icon: ListTree,
    group: 'understand',
    phase: 'Phase 4',
  },

  // Operate
  {
    key: 'health',
    path: '/health',
    title: 'Health',
    eyebrow: 'Operate',
    icon: Activity,
    group: 'operate',
    phase: 'Phase 5',
  },
  {
    key: 'aging',
    path: '/aging',
    title: 'Aging',
    eyebrow: 'Operate',
    icon: Hourglass,
    group: 'operate',
    phase: 'Phase 5',
  },
  {
    key: 'curation',
    path: '/curation',
    title: 'Curation Queue',
    eyebrow: 'Operate',
    icon: ClipboardList,
    group: 'operate',
    phase: 'Phase 5',
  },
  {
    key: 'gate',
    path: '/gate',
    title: 'Gate',
    eyebrow: 'Operate',
    icon: ShieldCheck,
    group: 'operate',
    phase: 'Phase 5',
  },
] as const

/**
 * Pages that already have a dedicated feature folder scaffolded.
 * Everything else falls back to the generic placeholder route.
 */
export const FEATURE_PAGE_KEYS = new Set<string>([
  'overview',
  'feed',
  'injections',
  'simulator',
  'inspector',
  'curation',
  'themes',
  'health',
  'aging',
  'entities',
  'sessions',
])

/** Icon used for an unknown route (defensive). */
export const FALLBACK_ICON: LucideIcon = Boxes
export const NETWORK_ICON: LucideIcon = Network

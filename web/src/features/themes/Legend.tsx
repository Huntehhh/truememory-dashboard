import * as React from 'react'
import { cn } from '@/lib/utils'
import { categorySwatch } from './utils'
import type { ThemePoint } from './types'

/**
 * Legend — one chip per distinct category in the current tier, with a swatch
 * matching the scatter fill. Chips are toggle-buttons: clicking one focuses
 * the scatter on that category (all others dim). Clicking the same chip
 * again clears the focus.
 */

interface LegendProps {
  points: readonly ThemePoint[]
  active: string | null
  onSelect: (category: string | null) => void
}

interface Bucket {
  category: string | null
  count: number
}

function bucketize(points: readonly ThemePoint[]): Bucket[] {
  const map = new Map<string | null, number>()
  for (const p of points) {
    const key = p.category
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const buckets: Bucket[] = []
  for (const [category, count] of map) {
    buckets.push({ category, count })
  }
  buckets.sort((a, b) => {
    // Null (uncategorized) sinks to the end; then descending count; then name.
    if (a.category == null && b.category != null) return 1
    if (a.category != null && b.category == null) return -1
    if (b.count !== a.count) return b.count - a.count
    return String(a.category ?? '').localeCompare(String(b.category ?? ''))
  })
  return buckets
}

export function Legend({ points, active, onSelect }: LegendProps): React.ReactElement {
  const buckets = React.useMemo(() => bucketize(points), [points])

  if (buckets.length === 0) return <div className="hidden" aria-hidden />

  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Filter scatter by category"
    >
      {buckets.map((b) => {
        const label = b.category ?? 'uncategorized'
        const isActive = active === b.category
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(isActive ? null : b.category)}
            className={cn(
              'inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
              isActive
                ? 'border-[color:var(--line-strong)] bg-[color:var(--surface-strong)] text-ink'
                : 'border-[color:var(--glass-border)] bg-[color:var(--surface)] text-ink-muted hover:bg-[color:var(--surface-strong)] hover:text-ink',
            )}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-[color:var(--glass-border)]"
              style={{ backgroundColor: categorySwatch(b.category) }}
              aria-hidden
            />
            <span className="capitalize">{label}</span>
            <span className="font-mono text-[10px] tabular-nums text-ink-muted">
              {b.count.toLocaleString()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

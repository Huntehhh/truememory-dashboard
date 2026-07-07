import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { FeedCategory } from './types'

/**
 * CategoryChips — pill row of tag filters. `null` (or 'all') means no filter.
 * Active chip gets a tinted glass fill; inactive chips are hairline glass.
 */

interface CategoryChipsProps {
  categories: readonly FeedCategory[] | undefined
  active: string | null
  onSelect: (category: string | null) => void
  isLoading: boolean
}

export function CategoryChips({
  categories,
  active,
  onSelect,
  isLoading,
}: CategoryChipsProps): React.ReactElement {
  if (isLoading && !categories) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-pill" />
        ))}
      </div>
    )
  }

  const total = categories?.reduce((acc, c) => acc + c.count, 0) ?? 0

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
      <Chip
        label="All"
        count={total}
        selected={active === null}
        onClick={() => onSelect(null)}
      />
      {(categories ?? []).map((c) => (
        <Chip
          key={c.category}
          label={c.category}
          count={c.count}
          selected={active === c.category}
          onClick={() => onSelect(c.category)}
        />
      ))}
    </div>
  )
}

interface ChipProps {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}

function Chip({ label, count, selected, onClick }: ChipProps): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
        selected
          ? 'border-transparent text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
          : 'border-[color:var(--glass-border)] bg-[color:var(--surface)] text-ink-muted hover:bg-[color:var(--surface-strong)] hover:text-ink',
      )}
      style={
        selected
          ? {
              backgroundColor:
                'color-mix(in oklab, var(--navy) 12%, var(--surface-strong))',
              borderColor: 'color-mix(in oklab, var(--navy) 32%, transparent)',
            }
          : undefined
      }
    >
      <span className="capitalize">{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-ink-muted">
        {count.toLocaleString()}
      </span>
    </button>
  )
}

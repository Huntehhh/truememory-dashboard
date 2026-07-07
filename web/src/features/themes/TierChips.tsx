import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ThemeTier } from './types'

/**
 * TierChips — pill row of embedding tiers (basepro / pro / edge). Mirrors the
 * feed's CategoryChips layout so the two "row of filters" spots on the app
 * read as one visual pattern. Never emits `all`; UMAP coords aren't
 * comparable across tiers so we always pick exactly one.
 */

interface TierChipsProps {
  tiers: readonly ThemeTier[] | undefined
  active: string | null
  onSelect: (tier: string) => void
  isLoading: boolean
}

export function TierChips({
  tiers,
  active,
  onSelect,
  isLoading,
}: TierChipsProps): React.ReactElement {
  if (isLoading && !tiers) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-pill" />
        ))}
      </div>
    )
  }

  const rows = tiers ?? []
  if (rows.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        no embedding tiers cached yet — the UMAP recomputer hasn't populated
        tm_themes_cache.
      </p>
    )
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Embedding tier"
    >
      {rows.map((t) => (
        <Chip
          key={t.tier}
          tier={t.tier}
          points={t.points}
          clusters={t.clusters}
          selected={active === t.tier}
          onClick={() => onSelect(t.tier)}
        />
      ))}
    </div>
  )
}

interface ChipProps {
  tier: string
  points: number
  clusters: number
  selected: boolean
  onClick: () => void
}

function Chip({
  tier,
  points,
  clusters,
  selected,
  onClick,
}: ChipProps): React.ReactElement {
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
              borderColor:
                'color-mix(in oklab, var(--navy) 32%, transparent)',
            }
          : undefined
      }
    >
      <span className="font-mono uppercase tracking-widest">{tier}</span>
      <span className="font-mono text-[10px] tabular-nums text-ink-muted">
        {points.toLocaleString()} pts · {clusters.toLocaleString()} clusters
      </span>
    </button>
  )
}

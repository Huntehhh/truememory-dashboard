import * as React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * RawVector — collapsed by default. Expanding triggers the parent to refetch
 * with ?vector=1 (parent owns the fetch; this component only renders the
 * result). The vector is a 256-dim L2-normalized embedding when live — most
 * of the values fall in [-0.3, 0.3], so we show them in a compact mono grid
 * with two-decimal precision. `title` gives full precision on hover.
 *
 * Signal cues on the strip:
 *   - positive values tint gold, negative navy (unbiased about which is
 *     "good" — pure signum).
 *   - opacity scales with |value| so quiet dimensions sit near the surface
 *     color; loud dimensions pop.
 */

interface RawVectorProps {
  /** Full vector once the parent fetched it with ?vector=1. */
  vector: number[] | null
  /** True while the parent is fetching the vector variant. */
  isLoading: boolean
  /** Toggle callback owned by the parent (single source of truth). */
  expanded: boolean
  onToggle: () => void
  /** Server-reported dim on the memory row — used before the vector loads. */
  reportedDim: number | null
}

export function RawVector({
  vector,
  isLoading,
  expanded,
  onToggle,
  reportedDim,
}: RawVectorProps): React.ReactElement {
  const dim = vector?.length ?? reportedDim ?? 0

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex items-center justify-between gap-3 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 rounded-md',
        )}
      >
        <div className="flex items-baseline gap-2">
          <Eyebrow>Raw vector</Eyebrow>
          {dim > 0 ? (
            <StatBadge tone="neutral">{dim.toLocaleString()} dims</StatBadge>
          ) : (
            <span className="text-xs text-ink-muted">
              no vector — this memory isn't embedded in the neighbor cache
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden /> hide
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden /> reveal
            </>
          )}
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-2">
          {isLoading || vector == null ? (
            <Skeleton className="h-32 w-full" />
          ) : vector.length === 0 ? (
            <p className="text-xs text-ink-muted">
              vector fetched but empty — the cache returned zero dims.
            </p>
          ) : (
            <VectorGrid vector={vector} />
          )}
        </div>
      ) : null}
    </GlassCard>
  )
}

function VectorGrid({ vector }: { vector: number[] }): React.ReactElement {
  // Absolute-max for opacity scaling — keeps the render honest across memories
  // where the vector was normalized differently.
  const absMax = React.useMemo(() => {
    let hi = 0
    for (const v of vector) {
      const av = Math.abs(v)
      if (av > hi) hi = av
    }
    return hi || 1
  }, [vector])

  return (
    <div
      className="grid gap-1 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}
    >
      {vector.map((v, i) => (
        <VectorCell key={i} value={v} index={i} absMax={absMax} />
      ))}
    </div>
  )
}

interface VectorCellProps {
  value: number
  index: number
  absMax: number
}

function VectorCell({
  value,
  index,
  absMax,
}: VectorCellProps): React.ReactElement {
  const magnitude = Math.min(1, Math.abs(value) / absMax)
  const tokenVar = value >= 0 ? '--gold' : '--navy'
  const alpha = 0.06 + magnitude * 0.5

  return (
    <span
      title={`d${index}: ${value.toFixed(6)}`}
      className="flex items-baseline justify-between gap-1 rounded-md border border-[color:var(--glass-border)] px-1.5 py-1"
      style={{
        backgroundColor: `color-mix(in oklab, var(${tokenVar}) ${Math.round(alpha * 100)}%, transparent)`,
      }}
    >
      <span className="font-mono text-[9px] uppercase tracking-widest text-ink-muted">
        {index}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-ink">
        {value.toFixed(2)}
      </span>
    </span>
  )
}

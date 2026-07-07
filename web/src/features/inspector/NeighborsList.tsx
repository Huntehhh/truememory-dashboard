import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import { distanceToSimilarityPct, formatDistance } from './utils'
import type { InspectNeighbor } from './types'

/**
 * NeighborsList — top-10 embedding neighbors, each linking to its own
 * /inspector/:id detail. The distance bar is drawn as a 0..maxDistance
 * width so the eye can spot near-duplicates immediately (a first neighbor
 * near 0 usually means the two memories say the same thing).
 *
 * Bars are drawn relative to the widest distance in the list — the smallest
 * distance sits far from full width, but that's the point: you're looking at
 * the internal relative structure of the neighbor set, not global similarity.
 */

interface NeighborsListProps {
  neighbors: InspectNeighbor[]
}

export function NeighborsList({
  neighbors,
}: NeighborsListProps): React.ReactElement {
  const maxDistance = React.useMemo(() => {
    if (neighbors.length === 0) return 0
    let hi = 0
    for (const n of neighbors) {
      if (n.distance > hi) hi = n.distance
    }
    return hi
  }, [neighbors])

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <MetricTip
          id="inspector.neighbors"
          trigger="underline"
          label={<Eyebrow>Nearest neighbors</Eyebrow>}
        />
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          top {neighbors.length}
        </span>
      </header>

      {neighbors.length === 0 ? (
        <p className="text-xs text-ink-muted">
          no neighbors — this memory has no embedding yet or the neighbor
          cache is still warming.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {neighbors.map((n, idx) => (
            <li key={n.id}>
              <NeighborRow neighbor={n} rank={idx + 1} maxDistance={maxDistance} />
            </li>
          ))}
        </ol>
      )}
    </GlassCard>
  )
}

interface NeighborRowProps {
  neighbor: InspectNeighbor
  rank: number
  maxDistance: number
}

function NeighborRow({
  neighbor,
  rank,
  maxDistance,
}: NeighborRowProps): React.ReactElement {
  const barPct =
    maxDistance > 0 ? (neighbor.distance / maxDistance) * 100 : 0
  const sim = distanceToSimilarityPct(neighbor.distance)

  return (
    <Link
      to={`/inspector/${neighbor.id}`}
      className={cn(
        'group flex flex-col gap-2 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3',
        'transition-colors hover:bg-[color:var(--surface)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          #{rank}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          → #{neighbor.id}
        </span>
        {neighbor.category ? (
          <StatBadge tone="neutral" className="capitalize">
            {neighbor.category}
          </StatBadge>
        ) : null}
        <span className="ml-auto flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            dist
          </span>
          <span className="font-mono text-xs tabular-nums text-ink">
            {formatDistance(neighbor.distance)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            · {sim}
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 flex-shrink-0 text-ink-muted transition group-hover:text-ink"
          aria-hidden
        />
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-pill"
        style={{
          backgroundColor: 'color-mix(in oklab, var(--ink) 4%, transparent)',
        }}
        aria-hidden
      >
        <div
          className="h-full rounded-pill transition-[width] duration-500"
          style={{
            width: `${barPct}%`,
            backgroundColor:
              'color-mix(in oklab, var(--navy) 42%, transparent)',
          }}
        />
      </div>

      {neighbor.preview ? (
        <p className="line-clamp-2 text-xs text-ink-muted group-hover:text-ink">
          {neighbor.preview}
        </p>
      ) : (
        <p className="text-xs italic text-ink-muted">(no preview)</p>
      )}
    </Link>
  )
}

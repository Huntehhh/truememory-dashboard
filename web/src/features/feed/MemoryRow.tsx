import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import { formatRelative, formatSalience } from './utils'
import type { FeedRow } from './types'

/**
 * MemoryRow — slim glass card rendering one feed row. Content clamps to 3
 * lines by default; expand button reveals the full preview.
 *
 * Row click navigates to `/inspector/:id` — the target may be a placeholder
 * today; the link is intentional so the inspector page can plug in later
 * without a feed rework.
 */

interface MemoryRowProps {
  row: FeedRow
}

export function MemoryRow({ row }: MemoryRowProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <GlassCard
      variant="default"
      padding="sm"
      className="group flex flex-col gap-3 transition-colors hover:bg-[color:var(--surface-strong)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {row.category ? (
            <MetricTip
              id="feed.category"
              trigger="underline"
              label={
                <StatBadge tone="navy" className="capitalize">
                  {row.category}
                </StatBadge>
              }
            />
          ) : (
            <StatBadge tone="neutral">uncategorized</StatBadge>
          )}
          {row.sender ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              {row.sender}
            </span>
          ) : null}
        </div>
        <time
          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-ink-muted"
          dateTime={row.ts ?? undefined}
        >
          {formatRelative(row.ts)}
        </time>
      </div>

      <Link
        to={`/inspector/${row.id}`}
        className={cn(
          'block text-sm leading-relaxed text-ink transition-colors',
          'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-md',
          !expanded && 'line-clamp-3',
        )}
      >
        {row.content_preview || <span className="text-ink-muted">(empty)</span>}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MetricStat
            tipId="feed.salience"
            label="Salience"
            value={formatSalience(row.salience)}
          />
          <MetricStat
            tipId="feed.retrievalCount"
            label="Retrieved"
            value={row.retrieval_count.toLocaleString()}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            #{row.id}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            'inline-flex items-center gap-1 rounded-pill border border-transparent px-2 py-1 text-[11px] text-ink-muted transition-colors',
            'hover:border-[color:var(--line-strong)] hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
          )}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden /> Expand
            </>
          )}
        </button>
      </div>
    </GlassCard>
  )
}

interface MetricStatProps {
  tipId: 'feed.salience' | 'feed.retrievalCount'
  label: string
  value: string
}

function MetricStat({ tipId, label, value }: MetricStatProps): React.ReactElement {
  return (
    <MetricTip
      id={tipId}
      trigger="underline"
      label={
        <span className="inline-flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {label}
          </span>
          <span className="font-mono text-xs tabular-nums text-ink">{value}</span>
        </span>
      }
    />
  )
}

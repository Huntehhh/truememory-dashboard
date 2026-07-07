import * as React from 'react'
import { Tag, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/features/feed/utils'
import type { FeedRow } from '@/features/feed/types'
import type { JunkFlag } from './types'
import { JUNK_FLAG_SHORT } from './utils'

/**
 * A row in the Review Queue. Layout parallels feed/MemoryRow — same rhythm
 * so an operator flipping between the two tabs never has to re-orient.
 *
 * The junk-flag badge is the only visual addition; it sits under the
 * MetricTip for `curation.junkHeuristic` so hovering explains WHY the row
 * was surfaced without duplicating copy across four separate tooltips.
 */

const FLAG_TONE: Record<JunkFlag, 'amber' | 'red' | 'neutral'> = {
  dict_shape: 'red',
  tiny_fragment: 'amber',
  uncategorized: 'neutral',
  stale_unretrieved: 'amber',
}

export interface ReviewQueueRowProps {
  row: FeedRow
  flag: JunkFlag | null
  onForget: (row: FeedRow) => void
  onRecategorize: (row: FeedRow) => void
}

export function ReviewQueueRow({
  row,
  flag,
  onForget,
  onRecategorize,
}: ReviewQueueRowProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {row.category ? (
            <StatBadge tone="navy" className="capitalize">
              {row.category}
            </StatBadge>
          ) : (
            <StatBadge tone="neutral">uncategorized</StatBadge>
          )}
          {flag ? (
            <MetricTip
              id="curation.junkHeuristic"
              className="[&>svg]:hidden"
              label={
                <StatBadge tone={FLAG_TONE[flag]}>
                  {JUNK_FLAG_SHORT[flag]}
                </StatBadge>
              }
            />
          ) : null}
        </div>
        <time
          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-ink-muted"
          dateTime={row.ts ?? undefined}
        >
          {formatRelative(row.ts)}
        </time>
      </div>

      <p
        className={cn(
          'text-sm leading-relaxed text-ink',
          'line-clamp-3 whitespace-pre-wrap break-words',
        )}
      >
        {row.content_preview || (
          <span className="text-ink-muted">(empty)</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            #{row.id}
          </span>
          <MetricTip
            id="feed.retrievalCount"
            trigger="underline"
            label={
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  Retrieved
                </span>
                <span className="font-mono text-xs tabular-nums text-ink">
                  {row.retrieval_count.toLocaleString()}
                </span>
              </span>
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRecategorize(row)}
            aria-label={`Re-categorize memory ${row.id}`}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Re-categorize
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => onForget(row)}
            aria-label={`Forget memory ${row.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Forget
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

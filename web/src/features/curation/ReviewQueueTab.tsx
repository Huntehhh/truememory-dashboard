import * as React from 'react'
import { ClipboardList } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { FeedRow } from '@/features/feed/types'
import { useCurationFeed } from './hooks'
import { flagForRow } from './utils'
import { ReviewFilterPills, type ReviewFilterValue } from './ReviewFilterPills'
import { ReviewQueueRow } from './ReviewQueueRow'
import { ForgetDialog } from './ForgetDialog'
import { RecategorizeDialog } from './RecategorizeDialog'
import type { JunkFlag } from './types'

/**
 * ReviewQueueTab — the memory feed, filtered through client-side junk
 * heuristics.
 *
 * A single /api/memory/feed?limit=500 read powers the whole tab. Filtering is
 * pure client-side over the returned rows so pill changes are instant. The
 * default filter is `all_flagged` — the operator is here to triage, not
 * scroll every memory.
 */

const FEED_LIMIT = 500

export function ReviewQueueTab(): React.ReactElement {
  const feed = useCurationFeed(FEED_LIMIT)
  const [filter, setFilter] = React.useState<ReviewFilterValue>('all_flagged')
  const [forgetTarget, setForgetTarget] = React.useState<FeedRow | null>(null)
  const [recatTarget, setRecatTarget] = React.useState<FeedRow | null>(null)

  const rows = feed.data?.data ?? []

  // Freeze the "now" reference at page-render time so filter counts are
  // stable across re-renders (a shifting reference would nudge the
  // stale-unretrieved bucket count by 1 every second).
  const now = React.useMemo(() => Date.now(), [feed.data])

  const flagged = React.useMemo(() => {
    return rows.map((row) => ({ row, flag: flagForRow(row, now) }))
  }, [rows, now])

  const counts = React.useMemo(() => {
    const c: Record<ReviewFilterValue, number> = {
      all_flagged: 0,
      everything: rows.length,
      dict_shape: 0,
      uncategorized: 0,
      stale_unretrieved: 0,
      tiny_fragment: 0,
    }
    for (const { flag } of flagged) {
      if (flag !== null) {
        c.all_flagged += 1
        c[flag] += 1
      }
    }
    return c
  }, [flagged, rows.length])

  const visible = React.useMemo(() => {
    if (filter === 'everything') return flagged
    if (filter === 'all_flagged') return flagged.filter((f) => f.flag !== null)
    return flagged.filter((f) => f.flag === (filter as JunkFlag))
  }, [flagged, filter])

  return (
    <div className="flex flex-col gap-4">
      <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <MetricTip
              id="curation.junkHeuristic"
              trigger="underline"
              label={
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  Filter
                </span>
              }
            />
            <ReviewFilterPills
              value={filter}
              onChange={setFilter}
              counts={counts}
            />
          </div>
          <StatusLine
            visible={visible.length}
            total={rows.length}
            flaggedTotal={counts.all_flagged}
            isLoading={feed.isLoading}
            isFetching={feed.isFetching}
          />
        </div>
      </GlassCard>

      {feed.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="md">
          <p className="text-sm text-ink">Couldn't load the memory feed.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {feed.error instanceof Error
              ? feed.error.message
              : 'The API returned an error — retry once the server is reachable.'}
          </p>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void feed.refetch()
              }}
            >
              Retry
            </Button>
          </div>
        </GlassCard>
      ) : feed.isLoading || !feed.data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyPanel filter={filter} totalFlagged={counts.all_flagged} />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(({ row, flag }) => (
            <ReviewQueueRow
              key={row.id}
              row={row}
              flag={flag}
              onForget={setForgetTarget}
              onRecategorize={setRecatTarget}
            />
          ))}
        </div>
      )}

      <ForgetDialog
        target={forgetTarget}
        onClose={() => setForgetTarget(null)}
      />
      <RecategorizeDialog
        target={recatTarget}
        onClose={() => setRecatTarget(null)}
      />
    </div>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────

function StatusLine({
  visible,
  total,
  flaggedTotal,
  isLoading,
  isFetching,
}: {
  visible: number
  total: number
  flaggedTotal: number
  isLoading: boolean
  isFetching: boolean
}): React.ReactElement {
  const label = isLoading
    ? 'Loading…'
    : isFetching
      ? 'Refreshing…'
      : `Showing ${visible.toLocaleString()} · ${flaggedTotal.toLocaleString()} flagged of ${total.toLocaleString()} scanned`
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
      {label}
    </p>
  )
}

function EmptyPanel({
  filter,
  totalFlagged,
}: {
  filter: ReviewFilterValue
  totalFlagged: number
}): React.ReactElement {
  const message =
    filter === 'all_flagged'
      ? totalFlagged === 0
        ? 'Nothing tripped the heuristics — the queue is clean.'
        : 'No rows in this window match the current filter.'
      : filter === 'everything'
        ? 'The feed came back empty.'
        : 'No rows match that specific heuristic in this scan window.'
  return (
    <GlassCard variant="default" padding="lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
          <ClipboardList className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{message}</p>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Widen the filter to "Show everything" to audit the full page, or
            check back after the next extractor pass.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}

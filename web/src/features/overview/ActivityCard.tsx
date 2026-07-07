import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { HeatGrid } from '@/components/charts'
import type { ActivityEnvelope } from './types'

/**
 * ActivityCard — 12-week GitHub-style heatmap of memory_returned events.
 * Uses `--navy` as the accent so it reads calm; peaks are shown as summary.
 */

interface ActivityCardProps {
  data: ActivityEnvelope | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

export function ActivityCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: ActivityCardProps): React.ReactElement {
  const total = React.useMemo(() => {
    if (!data?.data) return 0
    return data.data.reduce((acc, r) => acc + r.count, 0)
  }, [data])

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Eyebrow>Memory activity</Eyebrow>
          <p className="text-sm text-ink-muted">
            Daily {' '}
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink">
              memory_returned
            </span>
            {' '} events across the last 12 weeks.
          </p>
        </div>
        {data ? (
          <StatBadge tone="navy">
            {total.toLocaleString()} events · {data.window_days}d
          </StatBadge>
        ) : null}
      </header>

      {isError ? (
        <div className="py-6 text-center text-sm text-ink-muted">
          {errorMessage ?? "Couldn't load activity."}
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : data.data.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-muted">
          No recorded activity in the window.
        </div>
      ) : (
        <HeatGrid data={data.data} weeks={12} accentVar="--navy" />
      )}
    </GlassCard>
  )
}

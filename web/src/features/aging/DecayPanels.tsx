import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { MetricTip } from '@/components/glass/MetricTip'
import { Skeleton } from '@/components/ui/skeleton'
import type { GlossaryKey } from '@/content/metric-glossary'
import { cn } from '@/lib/utils'
import type { DecayHistBucket, DecayPanelsPayload } from './types'

/**
 * DecayPanels — compact stat cards summarizing the four distributions.
 *
 * The v1 page rendered each distribution as a full Plotly histogram; here they
 * compress to a big DM Mono headline number + a caption. Anything that would
 * demand a chart lands elsewhere — the Aging page's job is "act on this," not
 * "graph this." Each card renders even when its histogram is empty so the
 * grid never breaks — the salience and surprise histograms currently return []
 * because tm_telemetry doesn't emit those signals, and the empty-state copy
 * says so factually.
 */

interface DecayPanelsProps {
  data: DecayPanelsPayload | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

export function DecayPanels({
  data,
  isLoading,
  isError,
  errorMessage,
}: DecayPanelsProps): React.ReactElement {
  if (isError) {
    return (
      <GlassCard variant="tinted" accent="tan" padding="md">
        <p className="text-sm text-ink">Couldn't load decay panels.</p>
        <p className="mt-1 text-xs text-ink-muted">
          {errorMessage ?? 'Retry once the API is reachable.'}
        </p>
      </GlassCard>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  const decayStats = summarizeHistogram(data.decay_histogram)
  const salienceStats = summarizeHistogram(data.salience_histogram)
  const surpriseStats = summarizeHistogram(data.surprise_histogram)
  const outlierCount = data.decay_age_scatter.filter((p) => p.is_outlier).length
  const sampleSize = data.decay_age_scatter.length
  const decayTail = tailCount(data.decay_histogram, 0.833)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatPanel
        label="Decay distribution"
        tipId="aging.decay"
        value={decayStats.total != null ? decayStats.total.toLocaleString() : '—'}
        valueLabel={decayStats.total != null ? 'scored' : ''}
        subtitle={
          decayStats.total != null
            ? `${decayTail.toLocaleString()} in the top bucket — closing on the guard threshold`
            : 'no decay scores yet'
        }
        emphasis={decayTail > 0}
      />
      <StatPanel
        label="Salience distribution"
        tipId="feed.salience"
        value={salienceStats.total != null ? salienceStats.total.toLocaleString() : '—'}
        valueLabel={salienceStats.total != null ? 'scored' : ''}
        subtitle={
          salienceStats.total != null
            ? `${salienceStats.bucketCount} buckets in play across [0, 1]`
            : 'salience histogram not emitting yet'
        }
      />
      <StatPanel
        label="Surprise at birth"
        value={surpriseStats.total != null ? surpriseStats.total.toLocaleString() : '—'}
        valueLabel={surpriseStats.total != null ? 'scored' : ''}
        subtitle={
          surpriseStats.total != null
            ? `${surpriseStats.bucketCount} buckets across the [0, 1] surprise range`
            : 'surprise histogram not emitting yet'
        }
      />
      <StatPanel
        label="Decay × age outliers"
        tipId="aging.retrievalGap"
        value={outlierCount.toLocaleString()}
        valueLabel={sampleSize > 0 ? `of ${sampleSize} sampled` : ''}
        subtitle={
          sampleSize > 0
            ? 'high decay AND at least 30 days old — forgetting candidates'
            : 'scatter sample empty'
        }
        emphasis={outlierCount > 0}
      />
    </div>
  )
}

interface StatPanelProps {
  label: string
  tipId?: GlossaryKey
  value: string
  valueLabel: string
  subtitle: string
  emphasis?: boolean
}

function StatPanel({
  label,
  tipId,
  value,
  valueLabel,
  subtitle,
  emphasis,
}: StatPanelProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        {tipId ? <MetricTip id={tipId} /> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-3xl font-medium tabular-nums',
            emphasis ? 'text-[color:var(--gold)]' : 'text-ink',
            value === '—' && 'text-ink-muted',
          )}
        >
          {value}
        </span>
        {valueLabel ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {valueLabel}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] text-ink-muted">{subtitle}</p>
    </GlassCard>
  )
}

/** Total count + bucket count for a histogram; nulls when the array is empty. */
function summarizeHistogram(buckets: DecayHistBucket[]): {
  total: number | null
  bucketCount: number
} {
  if (buckets.length === 0) return { total: null, bucketCount: 0 }
  let total = 0
  for (const b of buckets) total += b.count
  return { total, bucketCount: buckets.length }
}

/**
 * tailCount — sum of `count` across buckets whose midpoint is at or above
 * `threshold`. Used to surface the "fading fast" cohort on the decay panel
 * without a full chart. Default threshold 0.833 mirrors v1's top-2 bin
 * highlighting.
 */
function tailCount(buckets: DecayHistBucket[], threshold: number): number {
  let n = 0
  for (const b of buckets) {
    if (b.bucket >= threshold) n += b.count
  }
  return n
}

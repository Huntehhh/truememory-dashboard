import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { Skeleton } from '@/components/ui/skeleton'
import { Bars, type BarDatum } from '@/components/charts'
import type { ByCategoryEnvelope } from './types'

/**
 * CategoryCard — memories per category with an optional 7d-retrievals chip.
 * Bars accepts a `secondary` per row; we only surface it when the
 * `retrievals_7d` field is present + the median_salience is finite.
 */

interface CategoryCardProps {
  data: ByCategoryEnvelope | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

function toBarData(env: ByCategoryEnvelope | undefined): BarDatum[] {
  if (!env?.data) return []
  return env.data.map((r) => {
    const secondaryParts: string[] = []
    if (typeof r.retrievals_7d === 'number' && r.retrievals_7d > 0) {
      secondaryParts.push(`${r.retrievals_7d.toLocaleString()} recalls`)
    }
    if (r.median_salience != null && Number.isFinite(r.median_salience)) {
      secondaryParts.push(`sal ${r.median_salience.toFixed(2)}`)
    }
    return {
      label: r.category,
      value: r.count,
      secondary: secondaryParts.length > 0 ? secondaryParts.join(' · ') : undefined,
    }
  })
}

export function CategoryCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: CategoryCardProps): React.ReactElement {
  const rows = React.useMemo(() => toBarData(data), [data])

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <Eyebrow>Categories</Eyebrow>
        <p className="text-sm text-ink-muted">
          Distribution across memory categories in the last {data?.window_days ?? 30} days.
        </p>
      </header>

      {isError ? (
        <div className="py-6 text-center text-sm text-ink-muted">
          {errorMessage ?? "Couldn't load categories."}
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <Bars data={rows} accentVar="--navy" maxRows={12} />
      )}
    </GlassCard>
  )
}

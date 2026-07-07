import * as React from 'react'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { PageHeader } from '@/components/glass/PageHeader'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatFullDate } from '@/features/inspector/utils'
import { Legend } from './Legend'
import { ScatterPlot } from './ScatterPlot'
import { TierChips } from './TierChips'
import { useThemeTiers, useThemes } from './hooks'
import type { ThemeTier } from './types'

/**
 * Themes — UMAP scatter of every memory in an embedding tier, colored by
 * category. The tier chips let the operator flip between embedding models
 * (basepro / pro / edge); the active tier defaults to the one with the most
 * points so the map is dense out of the box.
 */
export default function ThemesPage(): React.ReactElement {
  const tiers = useThemeTiers()
  const [tier, setTier] = React.useState<string | null>(null)
  const [focusCategory, setFocusCategory] = React.useState<string | null>(null)

  // Default to the largest tier once the list lands. Only fire once — after
  // that, `tier` is user-controlled via TierChips.
  React.useEffect(() => {
    if (tier != null) return
    const rows = tiers.data
    if (!rows || rows.length === 0) return
    const largest = pickLargest(rows)
    setTier(largest)
  }, [tier, tiers.data])

  // Clear the focused category whenever the tier changes — colors are stable
  // across tiers but categories may not be present in the smaller tiers.
  React.useEffect(() => {
    setFocusCategory(null)
  }, [tier])

  const scatter = useThemes(tier)
  const points = scatter.data?.points ?? []
  const computedAt = scatter.data?.computed_at ?? null
  const note = scatter.data?.note ?? null

  const liveBadge = scatter.isError ? (
    <StatBadge tone="amber">error</StatBadge>
  ) : scatter.isFetching ? (
    <StatBadge tone="gold">refreshing</StatBadge>
  ) : computedAt ? (
    <StatBadge tone="sage">
      cached {formatFullDate(computedAt)}
    </StatBadge>
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Understand"
        title={
          <>
            Memory <AccentWord gold>themes.</AccentWord>
          </>
        }
        subtitle="UMAP-projected 2D map — memories that mean similar things sit close together. Tight clusters are topics; isolated points are one-offs; near-duplicates land on top of each other."
        actions={liveBadge}
      />

      <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <MetricTip
            id="themes.tier"
            trigger="underline"
            label={<Eyebrow>Embedding tier</Eyebrow>}
          />
          <TierChips
            tiers={tiers.data}
            active={tier}
            onSelect={setTier}
            isLoading={tiers.isLoading}
          />
        </div>
      </GlassCard>

      <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <MetricTip
            id="themes.umap"
            trigger="underline"
            label={<Eyebrow>UMAP scatter</Eyebrow>}
          />
          {points.length > 0 ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              {points.length.toLocaleString()} memories
              {tier ? ` · tier ${tier}` : ''}
              {focusCategory ? ` · focus ${focusCategory}` : ''}
            </span>
          ) : null}
        </header>

        {scatter.isError ? (
          <p className="text-xs text-ink-muted">
            couldn't load the scatter —{' '}
            {scatter.error instanceof Error
              ? scatter.error.message
              : 'retry after the API recovers'}
          </p>
        ) : tier == null ? (
          <Skeleton className="h-[420px] w-full" />
        ) : scatter.isLoading || !scatter.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : points.length === 0 ? (
          <EmptyPanel note={note} tier={tier} />
        ) : (
          <div className="flex flex-col gap-3">
            <Legend
              points={points}
              active={focusCategory}
              onSelect={setFocusCategory}
            />
            <ScatterPlot points={points} focusCategory={focusCategory} />
          </div>
        )}
      </GlassCard>
    </div>
  )
}

function EmptyPanel({
  note,
  tier,
}: {
  note: string | null
  tier: string | null
}): React.ReactElement {
  return (
    <GlassCard variant="tinted" accent="tan" padding="md">
      <p className="text-sm font-medium text-ink">
        No vectors cached for tier{tier ? ` "${tier}"` : ''}.
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {note ??
          'Re-embed pending — check the Health page for the rebuild queue.'}
      </p>
    </GlassCard>
  )
}

function pickLargest(rows: readonly ThemeTier[]): string | null {
  let best: ThemeTier | null = null
  for (const r of rows) {
    if (best == null || r.points > best.points) best = r
  }
  return best?.tier ?? null
}

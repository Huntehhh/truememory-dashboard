import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { AccentWord } from '@/components/glass/AccentWord'
import { MetricTip } from '@/components/glass/MetricTip'
import { Skeleton } from '@/components/ui/skeleton'
import { ChainCard } from './ChainCard'
import { useTimeline } from './hooks'
import { sortChains } from './utils'

/**
 * Timeline — supersession chains across all versioned facts. Each card is one
 * subject (e.g. `pricing_anthropic_seat`) showing its full history, oldest at
 * the top, active tip highlighted at the bottom.
 *
 * Rendering favors the multi-row story: multi-row chains sort first and read
 * as a vertical mini-timeline; single-row chains render compactly so the eye
 * grazes over them and lands on the interesting ones.
 */
export default function TimelinePage(): React.ReactElement {
  const timeline = useTimeline()
  const chains = React.useMemo(
    () => sortChains(timeline.data?.data.chains ?? []),
    [timeline.data],
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Diagnose"
        title={
          <>
            Fact <AccentWord gold>timeline.</AccentWord>
          </>
        }
        subtitle="How TrueMemory tracks a fact's evolution — every value it used to hold, when it changed, and what's active now."
        actions={
          <MetricTip
            id="inspector.timeline"
            trigger="underline"
            label={
              <span className="text-sm text-ink">Supersession chains</span>
            }
          />
        }
      />

      {timeline.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="md">
          <p className="text-sm text-ink">Couldn't load the timeline.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {timeline.error instanceof Error
              ? timeline.error.message
              : 'The API returned an error — retry once the server is reachable.'}
          </p>
        </GlassCard>
      ) : timeline.isLoading || !timeline.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : chains.length === 0 ? (
        <GlassCard
          variant="default"
          padding="lg"
          className="mx-auto max-w-xl text-center"
        >
          <p className="text-sm text-ink">No fact chains yet.</p>
          <p className="mt-1 text-xs text-ink-muted">
            TrueMemory hasn't detected any versioned facts.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {chains.map((chain) => (
            <ChainCard key={chain.subject} chain={chain} />
          ))}
        </div>
      )}
    </div>
  )
}

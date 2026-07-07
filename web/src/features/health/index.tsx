import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { PageHeader } from '@/components/glass/PageHeader'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { useHealthDetail } from './hooks'
import { ModelServerCard } from './ModelServerCard'
import { PipelineCounters } from './PipelineCounters'
import { RebuildSection } from './RebuildSection'
import { TierCard } from './TierCard'
import type { HealthTier } from './types'

/**
 * Health page — the operator's "is the pipeline moving?" glance.
 *
 * Reads /api/memory/health-detail on a 30s foreground poll (same cadence as
 * the injections feed). Four sections top-to-bottom:
 *
 *   1. Embed coverage — the one number people ask for first. Active tier
 *      gets a gold-tinted card, others stay muted. When the active tier is
 *      below 90%, a tan callout below the grid names the exact backlog
 *      delta and points at reconfigure_embeddings.
 *   2. Re-embed progress — usually the "no re-embed running" muted card.
 *      When populated it renders one card per row with progress + ETA +
 *      throughput + RAM + any error.
 *   3. Model server — folds the two independent file-lock probes into one
 *      badge (healthy/partial/down) and shows each probe's raw state.
 *   4. Pipeline queue — backlog + extracted counters.
 *
 * The live badge in the header mirrors the injections page pattern: `error`
 * on isError, `refreshing` while a fetch is in-flight, `live · 30s`
 * otherwise. Skeleton on first load; tan callout on hard error.
 */

const COVERAGE_HEALTHY_THRESHOLD = 90

export default function HealthPage(): React.ReactElement {
  const q = useHealthDetail()
  const detail = q.data?.data

  const liveBadge = q.isError ? (
    <StatBadge tone="amber">error</StatBadge>
  ) : q.isFetching ? (
    <StatBadge tone="gold">refreshing</StatBadge>
  ) : (
    <StatBadge tone="sage">live · 30s</StatBadge>
  )

  const sortedTiers = React.useMemo<HealthTier[]>(() => {
    const tiers = detail?.tiers ?? []
    return [...tiers].sort((a, b) => {
      if (a.active === b.active) return 0
      return a.active ? -1 : 1
    })
  }, [detail?.tiers])

  const activeTier = sortedTiers.find((t) => t.active) ?? null
  const backlogDelta =
    activeTier != null
      ? Math.max(0, activeTier.total_messages - activeTier.vectors)
      : 0
  const showBacklogCallout =
    activeTier != null &&
    (activeTier.coverage_pct == null ||
      activeTier.coverage_pct < COVERAGE_HEALTHY_THRESHOLD)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operate"
        title={
          <>
            Pipeline <AccentWord gold>health.</AccentWord>
          </>
        }
        subtitle="How much of the corpus is embedded, whether a re-embed is running, is the model server up, and what's queued upstream."
        actions={liveBadge}
      />

      {q.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="lg">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--sev-amber)]"
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-ink">Couldn't load pipeline health.</p>
              <p className="mt-1 text-xs text-ink-muted">
                {q.error instanceof Error
                  ? q.error.message
                  : 'The dashboard API returned an error — the mirror or Postgres may be offline.'}
              </p>
            </div>
          </div>
        </GlassCard>
      ) : q.isLoading || !detail ? (
        <LoadingState />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <MetricTip
              id="health.embedCoverage"
              trigger="underline"
              label={<span className="text-sm text-ink">Embed coverage</span>}
            />
            {sortedTiers.length === 0 ? (
              <GlassCard variant="default" padding="md">
                <p className="text-sm text-ink-muted">
                  No embedding tiers registered yet.
                </p>
              </GlassCard>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {sortedTiers.map((tier) => (
                  <TierCard key={tier.tier} tier={tier} />
                ))}
              </div>
            )}

            {showBacklogCallout && activeTier ? (
              <GlassCard variant="tinted" accent="tan" padding="md">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--sev-amber)]"
                    aria-hidden
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-ink">
                      Re-embed backlog:{' '}
                      <span className="font-mono tabular-nums">
                        {backlogDelta.toLocaleString()}
                      </span>{' '}
                      memories invisible to semantic search on the active tier.
                    </p>
                    <p className="text-xs text-ink-muted">
                      Run <span className="font-mono">reconfigure_embeddings</span> to catch up
                      — keyword search still finds them; vector search does not.
                    </p>
                  </div>
                </div>
              </GlassCard>
            ) : null}
          </section>

          <section className="flex flex-col gap-4">
            <MetricTip
              id="health.rebuildProgress"
              trigger="underline"
              label={<span className="text-sm text-ink">Re-embed progress</span>}
            />
            <RebuildSection rows={detail.rebuild_status} />
          </section>

          <section className="flex flex-col gap-4">
            <MetricTip
              id="health.modelServer"
              trigger="underline"
              label={<span className="text-sm text-ink">Model server</span>}
            />
            <ModelServerCard state={detail.model_server} />
          </section>

          <section className="flex flex-col gap-4">
            <Eyebrow>Pipeline queue</Eyebrow>
            <PipelineCounters
              backlogCount={detail.backlog_count}
              extractedCount={detail.extracted_count}
            />
          </section>
        </>
      )}
    </div>
  )
}

function LoadingState(): React.ReactElement {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-card" />
          <Skeleton className="h-56 w-full rounded-card" />
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full rounded-card" />
      </section>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full rounded-card" />
      </section>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-36" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-36 w-full rounded-card" />
          <Skeleton className="h-36 w-full rounded-card" />
        </div>
      </section>
    </div>
  )
}

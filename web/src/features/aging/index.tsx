import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { AccentWord } from '@/components/glass/AccentWord'
import { Skeleton } from '@/components/ui/skeleton'
import { CalloutCard } from './CalloutCard'
import { DecayPanels } from './DecayPanels'
import { useAgingCallouts, useDecayPanels } from './hooks'
import type { AgingPayload } from './types'

/**
 * Aging — the editorial "act on this" page.
 *
 * Two sections:
 *   1. Six narrative callouts — each is the corpus asking for a decision on
 *      one memory (or one cluster, or one global horizon). Sparse callouts
 *      render as muted "not emitting yet" cards; the lane is healthy when it
 *      goes quiet.
 *   2. Four compact stat cards summarizing the decay / salience / surprise /
 *      outlier distributions. No raw-row tables — that lives in the Feed.
 *
 * The salience and surprise histograms currently return empty payloads
 * because tm_telemetry doesn't emit salience / surprise rows yet; those
 * cards degrade gracefully to "not emitting yet."
 */
export default function AgingPage(): React.ReactElement {
  const callouts = useAgingCallouts()
  const decayPanels = useDecayPanels()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operate"
        title={
          <>
            The shape of <AccentWord gold>aging.</AccentWord>
          </>
        }
        subtitle="Six signals asking for a decision, and four distributions telling the whole story. When a lane goes quiet, the corpus is healthy — when it lights up, the engine wants a call."
      />

      <section aria-labelledby="aging-signals-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="aging-signals-heading" className="text-xl font-semibold text-ink">
            Signals worth acting on
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            live · six callouts
          </span>
        </div>
        <CalloutsGrid
          data={callouts.data}
          isLoading={callouts.isLoading}
          isError={callouts.isError}
          errorMessage={
            callouts.error instanceof Error ? callouts.error.message : undefined
          }
        />
      </section>

      <section aria-labelledby="aging-shape-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="aging-shape-heading" className="text-xl font-semibold text-ink">
            The shape of decay
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            distributions across the corpus
          </span>
        </div>
        <DecayPanels
          data={decayPanels.data}
          isLoading={decayPanels.isLoading}
          isError={decayPanels.isError}
          errorMessage={
            decayPanels.error instanceof Error ? decayPanels.error.message : undefined
          }
        />
      </section>
    </div>
  )
}

interface CalloutsGridProps {
  data: AgingPayload | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

function CalloutsGrid({
  data,
  isLoading,
  isError,
  errorMessage,
}: CalloutsGridProps): React.ReactElement {
  if (isError) {
    return (
      <GlassCard variant="tinted" accent="tan" padding="md">
        <p className="text-sm text-ink">Couldn't load aging callouts.</p>
        <p className="mt-1 text-xs text-ink-muted">
          {errorMessage ?? 'Retry once the API is reachable.'}
        </p>
      </GlassCard>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Decay leader — highest salience but going quiet. */}
      {data.decay_leader ? (
        <CalloutCard
          eyebrow="Decay leader"
          tipId="aging.decay"
          accent="tan"
          memoryId={data.decay_leader.memory_id}
          headline={data.decay_leader.content_preview}
          value={String(data.decay_leader.days_since_retrieval)}
          valueLabel="days since retrieval"
          meta={
            <>
              salience {formatSalience(data.decay_leader.salience)} ·{' '}
              {data.decay_leader.days_until_threshold} days above guard
            </>
          }
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Decay leader"
          tipId="aging.decay"
          accent="tan"
          emptyMessage="No decay leader yet — corpus too young or every high-salience memory still gets touched."
        />
      )}

      {/* Long-stored stranger — oldest never-retrieved. */}
      {data.long_stored_stranger ? (
        <CalloutCard
          eyebrow="Long-stored stranger"
          memoryId={data.long_stored_stranger.memory_id}
          headline={data.long_stored_stranger.content_preview}
          value={String(data.long_stored_stranger.days_old)}
          valueLabel="days old"
          meta={
            <>
              never retrieved · salience {formatSalience(data.long_stored_stranger.salience)}
            </>
          }
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Long-stored stranger"
          emptyMessage="Nothing has aged long enough without a retrieval to qualify."
        />
      )}

      {/* Surprise that faded — high-surprise memory gone quiet. */}
      {data.surprise_faded ? (
        <CalloutCard
          eyebrow="Surprise that faded"
          memoryId={data.surprise_faded.memory_id}
          headline={data.surprise_faded.content_preview}
          value={formatSurpriseScore(data.surprise_faded.original_surprise_score)}
          valueLabel="original surprise"
          meta={
            <>
              {data.surprise_faded.days_since_touch} days since touch ·{' '}
              {data.surprise_faded.days_old} days old
            </>
          }
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Surprise that faded"
          emptyMessage="No fading surprises — surprise telemetry may not be emitting yet."
        />
      )}

      {/* Cluster nobody visited — category with zero retrievals. */}
      {data.cluster_nobody_visited ? (
        <CalloutCard
          eyebrow="Cluster nobody visited"
          headline={
            <>
              Category <span className="font-mono text-ink">{data.cluster_nobody_visited.category}</span>{' '}
              holds a cohort of memories that has never once surfaced into a chat.
            </>
          }
          value={String(data.cluster_nobody_visited.memory_count)}
          valueLabel="memories · 0 retrievals"
          meta={
            data.cluster_nobody_visited.avg_embedding_density != null
              ? `avg valence ${data.cluster_nobody_visited.avg_embedding_density.toFixed(2)}`
              : undefined
          }
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Cluster nobody visited"
          emptyMessage="All categories are being retrieved from — no dead cohort."
        />
      )}

      {/* Retrieval gap — semantically matched but never returned. */}
      {data.retrieval_gap ? (
        <CalloutCard
          eyebrow="Retrieval gap"
          tipId="aging.retrievalGap"
          accent="gold"
          memoryId={data.retrieval_gap.memory_id}
          headline={data.retrieval_gap.content_preview}
          value={String(data.retrieval_gap.semantic_match_count)}
          valueLabel="semantic hits · 0 returns"
          meta="Matched the query embedding but never cleared the guard to inject."
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Retrieval gap"
          tipId="aging.retrievalGap"
          accent="gold"
          emptyMessage="No retrieval gaps detected — every semantic match is making it through."
        />
      )}

      {/* Memory horizon — computed retention horizon. */}
      {data.memory_horizon ? (
        <CalloutCard
          eyebrow="Memory horizon"
          headline={
            <>
              The engine's estimate for how deep the corpus can still be
              retrieved with confidence.
            </>
          }
          value={String(data.memory_horizon.horizon_days)}
          valueLabel="days"
          meta={
            data.memory_horizon.retrieval_distance_at_horizon != null
              ? `distance at horizon ${data.memory_horizon.retrieval_distance_at_horizon.toFixed(3)}`
              : 'distance signal not emitting'
          }
        />
      ) : (
        <CalloutCard
          empty
          eyebrow="Memory horizon"
          emptyMessage="Not enough retrievals to compute a horizon yet."
        />
      )}
    </div>
  )
}

function formatSalience(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—'
  return s.toFixed(2)
}

function formatSurpriseScore(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—'
  return s.toFixed(2)
}

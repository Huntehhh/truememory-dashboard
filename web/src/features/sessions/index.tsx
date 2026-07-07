import * as React from 'react'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { PageHeader } from '@/components/glass/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { EpisodeCard } from './EpisodeCard'
import { LandmarkRow } from './LandmarkRow'
import { LimitSelector } from './LimitSelector'
import { useSessions } from './hooks'
import type { SessionsLimit } from './types'

/**
 * Sessions — parallel rails for episodes (coherent activity stretches) and
 * landmarks (moments the engine flagged as significant events). Two lists
 * from one envelope, one limit control on top.
 *
 * The `lg:grid-cols-5` split lets episodes (col-span-3) breathe with their
 * multi-line summaries while landmarks (col-span-2) stay tight — a landmark
 * row is smaller than an episode card so the narrower column reads correctly.
 */

export default function SessionsPage(): React.ReactElement {
  const [limit, setLimit] = React.useState<SessionsLimit>(25)
  const sessions = useSessions(limit)

  const episodes = sessions.data?.data.episodes ?? []
  const landmarks = sessions.data?.data.landmarks ?? []
  const isLoading = sessions.isLoading || !sessions.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Understand"
        title={
          <>
            Sessions <AccentWord gold>and</AccentWord> landmarks.
          </>
        }
        subtitle="Every coherent stretch of activity the engine detected, and the moments it flagged as significant enough to remember as events."
        actions={<LimitSelector value={limit} onChange={setLimit} />}
      />

      {sessions.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="md">
          <p className="text-sm text-ink">Couldn't load sessions.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {sessions.error instanceof ApiError
              ? sessions.error.message
              : sessions.error instanceof Error
                ? sessions.error.message
                : 'The API returned an error — retry once the server is reachable.'}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="flex flex-col gap-3 lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Episodes</Eyebrow>
              <MetricTip
                id="sessions.episode"
                trigger="underline"
                label={
                  <span className="text-sm text-ink">
                    {isLoading
                      ? '—'
                      : `${episodes.length.toLocaleString()} total`}
                  </span>
                }
              />
            </div>

            {isLoading ? (
              <SkeletonList count={8} height="h-24" />
            ) : episodes.length === 0 ? (
              <GlassCard variant="default" padding="lg">
                <p className="text-sm text-ink">
                  No episodes have been detected yet.
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Episodes emerge once the engine sees enough activity to group
                  it into coherent stretches — new stores from chats will
                  populate this rail.
                </p>
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-3">
                {episodes.map((episode) => (
                  <EpisodeCard key={episode.id} episode={episode} />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Landmarks</Eyebrow>
              <MetricTip
                id="sessions.landmark"
                trigger="underline"
                label={
                  <span className="text-sm text-ink">
                    {isLoading
                      ? '—'
                      : `${landmarks.length.toLocaleString()} total`}
                  </span>
                }
              />
            </div>

            {isLoading ? (
              <SkeletonList count={8} height="h-20" />
            ) : landmarks.length === 0 ? (
              <GlassCard variant="default" padding="lg">
                <p className="text-sm text-ink">No landmarks recorded yet.</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Landmarks are moments the engine judged significant enough to
                  remember as events. The list stays empty until one is
                  extracted.
                </p>
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-3">
                {landmarks.map((landmark) => (
                  <LandmarkRow key={landmark.id} landmark={landmark} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

interface SkeletonListProps {
  count: number
  height: string
}

function SkeletonList({ count, height }: SkeletonListProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} w-full`} />
      ))}
    </div>
  )
}

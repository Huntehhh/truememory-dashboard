import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { formatDateRange, formatDuration } from './utils'
import type { Episode } from './types'

/**
 * EpisodeCard — one coherent stretch of activity the engine detected.
 *
 * Layout is a three-row card:
 *   1. Range (DM Mono `MMM D · HH:MM → MMM D · HH:MM`) + msg-count StatBadge
 *   2. Duration in a mono, muted line
 *   3. Summary text, or a muted italic `no summary` fallback — currently the
 *      common case since every real row has `summary: null`.
 */

interface EpisodeCardProps {
  episode: Episode
}

export function EpisodeCard({ episode }: EpisodeCardProps): React.ReactElement {
  const range = formatDateRange(episode.start_time, episode.end_time)
  const duration = formatDuration(episode.start_time, episode.end_time)
  const hasCount = episode.message_count != null

  return (
    <GlassCard variant="default" padding="sm" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-ink">
          {range}
        </span>
        {hasCount ? (
          <StatBadge tone="navy">
            {(episode.message_count ?? 0).toLocaleString()} msg
          </StatBadge>
        ) : null}
      </div>

      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {duration}
      </span>

      {episode.summary ? (
        <p className="text-sm leading-relaxed text-ink">{episode.summary}</p>
      ) : (
        <span className="text-xs italic text-ink-muted">no summary</span>
      )}
    </GlassCard>
  )
}

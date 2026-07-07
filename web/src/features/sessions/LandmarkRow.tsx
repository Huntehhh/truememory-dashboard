import * as React from 'react'
import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import { asStringArray, formatRelative } from './utils'
import type { Landmark } from './types'

/**
 * Per-event-type tone. Values observed in the wild:
 *   milestone · launch · job_change · financial · health · move
 * Anything else falls back to `neutral` with a plain "event" label so an
 * unknown type still renders instead of dropping the badge.
 *
 * `tan` is a design-token tone but NOT a StatBadge variant, so `move` falls
 * through to a small inline pill (see `TanBadge` below) that mimics
 * StatBadge's shape with the tan color-mix. The rest use StatBadge directly.
 */
type StatTone = 'gold' | 'sage' | 'navy' | 'amber' | 'red'
const EVENT_TONE: Record<string, StatTone | 'tan'> = {
  milestone: 'gold',
  launch: 'sage',
  job_change: 'navy',
  financial: 'amber',
  health: 'red',
  move: 'tan',
}

interface LandmarkRowProps {
  landmark: Landmark
}

export function LandmarkRow({ landmark }: LandmarkRowProps): React.ReactElement {
  const entities = asStringArray(landmark.related_entities)
  const type = landmark.event_type
  const mappedTone: StatTone | 'tan' | 'neutral' =
    type && EVENT_TONE[type] ? EVENT_TONE[type] : 'neutral'
  const badgeLabel = type ?? 'event'

  return (
    <GlassCard variant="default" padding="sm" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {formatRelative(landmark.timestamp)}
        </span>
        {mappedTone === 'tan' ? (
          <TanBadge>{badgeLabel}</TanBadge>
        ) : (
          <StatBadge tone={mappedTone} className="whitespace-nowrap">
            {badgeLabel}
          </StatBadge>
        )}
      </div>

      <p className="line-clamp-2 text-sm leading-snug text-ink">
        {landmark.event_name}
      </p>

      {entities ? (
        <div className="flex flex-wrap gap-1.5">
          {entities.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-2 py-0.5 font-mono text-[10px] text-ink-muted"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {landmark.source_message_id != null ? (
        <Link
          to={`/inspector/${landmark.source_message_id}`}
          className="self-start font-mono text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          inspect #{landmark.source_message_id}
        </Link>
      ) : null}
    </GlassCard>
  )
}

/**
 * TanBadge — StatBadge in a `tan` tone that the shared component doesn't
 * export. Kept co-located because it exists solely to keep the `move` event
 * type visually distinct without polluting the shared StatBadge tone union.
 */
function TanBadge({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-0.5',
        'font-mono text-[10px] font-medium uppercase tracking-widest',
        'bg-[color:color-mix(in_oklab,var(--tan)_10%,var(--surface))]',
        'border-[color:color-mix(in_oklab,var(--tan)_28%,transparent)]',
        'text-[color:var(--tan)]',
      )}
    >
      {children}
    </span>
  )
}

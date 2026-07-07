import * as React from 'react'
import { Link } from 'react-router-dom'
import { GlassCard, type GlassAccent } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { MetricTip } from '@/components/glass/MetricTip'
import { type GlossaryKey } from '@/content/metric-glossary'
import { cn } from '@/lib/utils'

/**
 * CalloutCard — the narrative unit of the Aging page.
 *
 * Each aging signal renders as a card:
 *   Eyebrow (metric name) + optional MetricTip
 *   Headline (a piece of a memory the corpus is asking for a decision on)
 *   Big number (in DM Mono) — the diagnostic figure for this callout
 *   Optional meta line (secondary detail)
 *
 * When `memoryId` is provided, the headline links to `/inspector/:id` — the
 * inspector page itself is still stubbed but the link is deliberate so the
 * card is inspector-ready the moment that surface lands.
 *
 * When `empty` is true, the card renders a muted "not emitting yet" placeholder
 * — sparse ≠ broken; a null callout means the lane is healthy.
 */
export interface CalloutCardProps {
  eyebrow: string
  headline: React.ReactNode
  value: string
  valueLabel: string
  meta?: React.ReactNode
  memoryId?: number | null
  tipId?: GlossaryKey
  accent?: GlassAccent
  empty?: false
}

export interface CalloutCardEmptyProps {
  eyebrow: string
  emptyMessage: string
  tipId?: GlossaryKey
  accent?: GlassAccent
  empty: true
}

type Props = CalloutCardProps | CalloutCardEmptyProps

export function CalloutCard(props: Props): React.ReactElement {
  if (props.empty) {
    const { eyebrow, emptyMessage, tipId, accent } = props
    return (
      <GlassCard
        variant="tinted"
        accent={accent ?? 'navy'}
        padding="md"
        className="flex min-h-[160px] flex-col gap-2 opacity-70"
      >
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>{eyebrow}</Eyebrow>
          {tipId ? <MetricTip id={tipId} /> : null}
        </div>
        <p className="mt-auto text-sm italic text-ink-muted">{emptyMessage}</p>
      </GlassCard>
    )
  }

  const { eyebrow, headline, value, valueLabel, meta, memoryId, tipId, accent } = props

  const headlineNode = (
    <p
      className={cn(
        'text-sm leading-relaxed text-ink line-clamp-3',
        memoryId != null &&
          'transition-colors group-hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-md',
      )}
    >
      {headline}
    </p>
  )

  return (
    <GlassCard
      variant="default"
      padding="md"
      accent={accent}
      className="group flex min-h-[160px] flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        {tipId ? <MetricTip id={tipId} /> : null}
      </div>

      {memoryId != null ? (
        <Link to={`/inspector/${memoryId}`} className="block">
          {headlineNode}
        </Link>
      ) : (
        headlineNode
      )}

      <div className="mt-auto flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium tabular-nums text-ink">
          {value}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {valueLabel}
        </span>
      </div>

      {meta ? (
        <p className="text-[11px] text-ink-muted">{meta}</p>
      ) : null}
    </GlassCard>
  )
}

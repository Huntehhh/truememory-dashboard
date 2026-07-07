import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { cn } from '@/lib/utils'
import { clampPct, formatPct, formatRelative } from './utils'
import type { HealthTier } from './types'

/**
 * A single embed-coverage card — one per registered embedding tier.
 * The active tier gets the tinted-gold accent so the eye lands there first;
 * inactive tiers stay on default glass so the visual weight matches their
 * operational weight (they're just sitting there, not doing work).
 *
 * The big number is coverage percent; the sub-line is the vector/message
 * count in the same units the engine emits. Model + dim let the operator
 * confirm the tier is what they think it is (the same `edge` slot has been
 * potion-base at different points).
 */
export interface TierCardProps {
  tier: HealthTier
}

export function TierCard({ tier }: TierCardProps): React.ReactElement {
  const isActive = tier.active
  const barWidth = clampPct(tier.coverage_pct)

  return (
    <GlassCard
      variant={isActive ? 'tinted' : 'default'}
      accent="gold"
      padding="lg"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{tier.tier.toUpperCase()}</Eyebrow>
        <StatBadge tone={isActive ? 'gold' : 'neutral'}>
          {isActive ? 'active' : 'inactive'}
        </StatBadge>
      </div>

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            'font-mono text-4xl font-medium tabular-nums md:text-5xl',
            isActive ? 'text-[color:var(--gold)]' : 'text-ink',
          )}
        >
          {formatPct(tier.coverage_pct)}
        </span>
        <span className="font-mono text-xs text-ink-muted">
          {tier.vectors.toLocaleString()} / {tier.total_messages.toLocaleString()} vectors
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-sm text-ink">
          {tier.model ?? '—'}
          <span className="text-xs text-ink-muted"> · {tier.embedding_dim ?? '—'}d</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]">
        <div
          className="h-full rounded-full bg-[color:var(--gold)]"
          style={{ width: `${barWidth}%` }}
          aria-hidden
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        <span>last: {tier.last_embedded_id ?? '—'}</span>
        <span>updated: {formatRelative(tier.last_updated)}</span>
      </div>
    </GlassCard>
  )
}

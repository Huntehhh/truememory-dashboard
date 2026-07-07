import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { MetricTip } from '@/components/glass/MetricTip'
import { cn } from '@/lib/utils'
import { formatFullDate, formatSalience, formatValence } from './utils'
import type { InspectMemory } from './types'

/**
 * HeroCard — the full memory content sits on top as a readable prose block,
 * with all the row-level metadata (category, timestamps, salience, retrieval
 * count, sender/recipient/modality) surfaced as a metric strip beneath.
 *
 * Content renders in DM Mono at readable body-text size so long facts stay
 * scannable and code-shaped extractions read cleanly. `whitespace-pre-wrap`
 * so any newlines the extractor emitted are preserved.
 */

interface HeroCardProps {
  memory: InspectMemory
}

export function HeroCard({ memory }: HeroCardProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="lg" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {memory.category ? (
            <StatBadge tone="navy" className="capitalize">
              {memory.category}
            </StatBadge>
          ) : (
            <StatBadge tone="neutral">uncategorized</StatBadge>
          )}
          {memory.sender ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              from {memory.sender}
            </span>
          ) : null}
          {memory.recipient ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              to {memory.recipient}
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          #{memory.id}
        </span>
      </div>

      <ContentBlock content={memory.content} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <MetricStat
          tipId="feed.salience"
          label="Salience"
          value={formatSalience(memory.salience)}
        />
        <MetricStat
          label="Retrieved"
          value={memory.retrieval_count.toLocaleString()}
        />
        <MetricStat label="Valence" value={formatValence(memory.emotional_valence)} />
        {memory.modality ? (
          <MetricStat label="Modality" value={memory.modality} />
        ) : null}
        {memory.embedding_dim != null && memory.embedding_dim > 0 ? (
          <MetricStat
            label="Embed dim"
            value={memory.embedding_dim.toLocaleString()}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[color:var(--line)] pt-3">
        <TimeRow label="Created" iso={memory.created_at} />
        <TimeRow label="Last retrieved" iso={memory.last_retrieved_at} />
      </div>
    </GlassCard>
  )
}

function ContentBlock({ content }: { content: string }): React.ReactElement {
  const trimmed = content.trim()
  if (!trimmed) {
    return (
      <p className="text-sm italic text-ink-muted">(memory has no content)</p>
    )
  }
  return (
    <div className="rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-4">
      <p
        className={cn(
          'whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-ink',
        )}
      >
        {trimmed}
      </p>
    </div>
  )
}

interface MetricStatProps {
  tipId?: 'feed.salience'
  label: string
  value: string
}

function MetricStat({ tipId, label, value }: MetricStatProps): React.ReactElement {
  const body = (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-ink">{value}</span>
    </span>
  )
  if (tipId) {
    return <MetricTip id={tipId} trigger="underline" label={body} />
  }
  return body
}

interface TimeRowProps {
  label: string
  iso: string | null
}

function TimeRow({ label, iso }: TimeRowProps): React.ReactElement {
  return (
    <div className="flex items-baseline gap-2">
      <Eyebrow>{label}</Eyebrow>
      <time
        className="font-mono text-xs tabular-nums text-ink"
        dateTime={iso ?? undefined}
      >
        {formatFullDate(iso)}
      </time>
    </div>
  )
}

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Compass,
  Filter,
  GitMerge,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import type { GlossaryKey } from '@/content/metric-glossary'
import { cn } from '@/lib/utils'
import { CandidateRow } from './CandidateRow'
import type { RerankerCandidate, ScoreSpace, Stage, StageName } from './api'

/**
 * A single stage section — header (stage name + score-space chip + tips)
 * plus a candidate list. Order and content per-stage:
 *
 *   fts / vector           →  raw candidates by primary score
 *   rrf_fusion             →  fused list with rank provenance chips
 *   salience_guard         →  passed dot + margin bar; failures dimmed
 *   surprise_boost         →  ↑n / ↓n rank delta
 *   reranker               →  #before → #after, or "skipped" band
 *
 * Any stage may carry a `skipped` flag (or an explicit error, for vector) —
 * both render inline rather than hiding the section, so operators can see
 * that a toggle actually took effect.
 */

interface StageMeta {
  icon: LucideIcon
  title: string
  tipId: GlossaryKey
  scoreSpace: ScoreSpace
}

const STAGE_META: Record<StageName, StageMeta> = {
  fts: {
    icon: Search,
    title: 'FTS · keyword',
    tipId: 'sim.stage.fts',
    scoreSpace: 'bm25_rank',
  },
  vector: {
    icon: Compass,
    title: 'Vector · semantic',
    tipId: 'sim.stage.vector',
    scoreSpace: 'cosine',
  },
  rrf_fusion: {
    icon: GitMerge,
    title: 'RRF · rank fusion',
    tipId: 'sim.stage.rrf',
    scoreSpace: 'rrf',
  },
  salience_guard: {
    icon: Filter,
    title: 'Salience guard',
    tipId: 'sim.stage.salienceGuard',
    scoreSpace: 'blended',
  },
  surprise_boost: {
    icon: Sparkles,
    title: 'Surprise boost',
    tipId: 'sim.stage.surprise',
    scoreSpace: 'blended',
  },
  reranker: {
    icon: RefreshCw,
    title: 'Cross-encoder rerank',
    tipId: 'sim.stage.reranker',
    scoreSpace: 'rerank',
  },
}

const SCORE_SPACE_LABEL: Record<ScoreSpace, string> = {
  bm25_rank: 'bm25 · rank',
  cosine: 'cosine',
  rrf: 'rrf',
  blended: 'blended',
  rerank: 'rerank',
}

export interface StageCardProps {
  stage: Stage
}

export function StageCard({ stage }: StageCardProps): React.ReactElement {
  const meta = STAGE_META[stage.name]
  const Icon = meta.icon
  const isVectorUnavailable =
    stage.name === 'vector' &&
    'available' in stage &&
    stage.available === false

  const skipped = stage.skipped === true
  const salienceMin =
    stage.name === 'salience_guard' && 'min_salience' in stage
      ? stage.min_salience
      : undefined
  const salienceKept =
    stage.name === 'salience_guard' && 'kept_count' in stage
      ? stage.kept_count
      : undefined

  return (
    <GlassCard
      variant="default"
      padding="md"
      className={cn(skipped && 'opacity-80')}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-pill border',
            'border-[color:var(--glass-border)] bg-[color:var(--surface)] px-2.5 py-0.5',
          )}
        >
          <Icon
            className="h-3.5 w-3.5 text-ink-muted"
            aria-hidden
          />
          <MetricTip
            id={meta.tipId}
            trigger="underline"
            label={
              <span className="text-xs font-medium text-ink">
                {meta.title}
              </span>
            }
          />
        </span>

        <MetricTip
          id="sim.scoreSpace"
          className="[&>svg]:hidden"
          label={
            <StatBadge tone="neutral" className="lowercase">
              {SCORE_SPACE_LABEL[meta.scoreSpace]}
            </StatBadge>
          }
        />

        {skipped ? <StatBadge tone="amber">skipped</StatBadge> : null}

        {salienceMin != null ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            floor {salienceMin.toFixed(2)}
          </span>
        ) : null}
        {salienceKept != null ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {salienceKept} kept
          </span>
        ) : null}

        {typeof stage.candidate_count === 'number' ? (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {stage.candidate_count} in pool
          </span>
        ) : null}
      </header>

      {isVectorUnavailable ? (
        <VectorErrorBand
          error={
            (stage as { error?: string | null }).error ??
            'Vector search unavailable — check embed coverage and the model server.'
          }
        />
      ) : null}

      {skipped ? (
        <SkippedBand
          note={
            stage.name === 'reranker'
              ? 'SKIPPED — matches live hook behavior (reranker is off in production for latency).'
              : 'SKIPPED — stage disabled by the current toggle.'
          }
        />
      ) : null}

      {stage.candidates.length === 0 && !skipped && !isVectorUnavailable ? (
        <p className="rounded-md border border-dashed border-[color:var(--glass-border)] px-3 py-4 text-xs text-ink-muted">
          No candidates surfaced at this stage.
        </p>
      ) : null}

      {stage.candidates.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {stage.candidates.map((c, i) => (
            <CandidateRow
              key={`${stage.name}-${cid(c)}-${i}`}
              stage={stage.name}
              candidate={c}
              dimmed={isDimmed(stage, c)}
            />
          ))}
        </ul>
      ) : null}
    </GlassCard>
  )
}

function cid(c: RerankerCandidate): string | number {
  return c.id ?? 'x'
}

function isDimmed(stage: Stage, c: RerankerCandidate): boolean {
  if (stage.name === 'salience_guard' && !stage.skipped) {
    const extra = (c as { extra?: { passed?: boolean } }).extra
    return extra?.passed === false
  }
  return false
}

function SkippedBand({ note }: { note: string }): React.ReactElement {
  return (
    <div
      className={cn(
        'mb-2 rounded-md border border-dashed border-[color:var(--glass-border)]',
        'bg-[color:var(--surface)] px-3 py-2',
        'font-mono text-[11px] uppercase tracking-widest text-ink-muted',
      )}
    >
      {note}
    </div>
  )
}

function VectorErrorBand({ error }: { error: string }): React.ReactElement {
  return (
    <div
      className={cn(
        'mb-2 rounded-md border px-3 py-2 text-xs',
        'border-[color:color-mix(in_oklab,var(--sev-amber)_28%,transparent)]',
        'bg-[color:color-mix(in_oklab,var(--sev-amber)_8%,var(--surface))]',
        'text-[color:var(--sev-amber)]',
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest">
        vector unavailable
      </span>
      <p className="mt-0.5 text-ink-muted">{error}</p>
    </div>
  )
}

import * as React from 'react'
import { useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import type {
  Candidate,
  RerankerCandidate,
  RerankerExtras,
  RrfExtras,
  SalienceExtras,
  StageName,
  SurpriseExtras,
} from './api'

/**
 * Per-stage variant candidate row. Every stage shares the outer shell
 * (id chip → preview → score → per-stage extras) but the extras cell
 * changes shape per stage so numbers stay in their own "score space" and
 * downstream renderers never smash together cosine ~0.6 with RRF ~0.03.
 *
 * Preview lines clamp to one line and expand on click — the sidecar
 * already truncates content to 300 chars, so full expansion is bounded.
 */

export interface CandidateRowProps {
  stage: StageName
  candidate: RerankerCandidate
  /**
   * True when this row was dropped by the salience guard. Dimmed styling +
   * amber margin — even though the sidecar still returns the row in the
   * pre-guard list, we know from `passed = false`.
   */
  dimmed?: boolean
}

export function CandidateRow({
  stage,
  candidate,
  dimmed,
}: CandidateRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  // Reranker-skipped candidates are their own shape — no `extra`, no `score`.
  const isRerankerSkipped =
    stage === 'reranker' &&
    'SKIPPED' in candidate &&
    (candidate as { SKIPPED?: unknown }).SKIPPED === true

  const preview = candidate.content_preview ?? ''
  const id = candidate.id

  return (
    <li
      className={cn(
        'group flex flex-col gap-1 rounded-lg border border-transparent',
        'px-3 py-2 transition-colors hover:border-[color:var(--glass-border)] hover:bg-[color:var(--surface)]',
        dimmed && 'opacity-55',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={`/inspector/${id}`}
          className={cn(
            'shrink-0 rounded-pill border border-[color:var(--glass-border)]',
            'bg-[color:var(--surface)] px-2 py-0.5',
            'font-mono text-[10px] text-ink-muted hover:text-ink hover:border-[color:var(--line-strong)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
          )}
          title={`Open memory #${id} in the inspector`}
        >
          #{id}
        </Link>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'group/preview min-w-0 flex-1 truncate text-left text-xs text-ink hover:text-ink',
            'focus-visible:outline-none focus-visible:underline',
            expanded && 'truncate-none whitespace-normal',
          )}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
        >
          <span className={cn(!expanded && 'line-clamp-1')}>{preview}</span>
        </button>

        <StageScore stage={stage} candidate={candidate} />

        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-ink-muted transition',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </div>

      {!isRerankerSkipped ? (
        <StageExtras stage={stage} candidate={candidate as Candidate} />
      ) : (
        <RerankerSkippedExtras candidate={candidate} />
      )}
    </li>
  )
}

// ── Score cell (varies by stage) ───────────────────────────────────────

function StageScore({
  stage,
  candidate,
}: {
  stage: StageName
  candidate: RerankerCandidate
}): React.ReactElement | null {
  if (stage === 'reranker' && 'SKIPPED' in candidate && candidate.SKIPPED) {
    // No score to render for a skipped reranker candidate.
    return null
  }
  const score = (candidate as Candidate).score
  if (typeof score !== 'number') return null

  // Cosine + RRF are already small floats; BM25/rank is 0..1 after
  // normalization; blended sits mid. Format uniformly and let the
  // score_space tag on the stage header carry the "not comparable" note.
  const shown = score >= 1 ? score.toFixed(2) : score.toFixed(4)
  return (
    <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink">
      {shown}
    </span>
  )
}

// ── Per-stage extras strip ─────────────────────────────────────────────

function StageExtras({
  stage,
  candidate,
}: {
  stage: StageName
  candidate: Candidate
}): React.ReactElement | null {
  const extra = candidate.extra as Record<string, unknown> | null | undefined
  if (!extra) return null

  if (stage === 'fts') {
    const raw = (extra as { raw_score?: number | null }).raw_score
    if (raw == null) return null
    return (
      <ExtrasLine>
        <ExtraCell label="bm25">{raw.toFixed(2)}</ExtraCell>
      </ExtrasLine>
    )
  }

  if (stage === 'rrf_fusion') {
    const e = extra as RrfExtras
    return (
      <ExtrasLine>
        {e.rrf_score != null ? (
          <ExtraCell label="rrf">{e.rrf_score.toFixed(4)}</ExtraCell>
        ) : null}
        {e.fts_rank != null ? (
          <ExtraCell label="fts#">{e.fts_rank}</ExtraCell>
        ) : null}
        {e.vec_rank != null ? (
          <ExtraCell label="vec#">{e.vec_rank}</ExtraCell>
        ) : null}
        {e.source ? <StatBadge tone="neutral">{e.source}</StatBadge> : null}
      </ExtrasLine>
    )
  }

  if (stage === 'salience_guard') {
    const e = extra as SalienceExtras
    if (e.skipped) {
      return (
        <ExtrasLine>
          <StatBadge tone="neutral">stage skipped</StatBadge>
        </ExtrasLine>
      )
    }
    const passed = e.passed === true
    const sal = e.salience
    const min = e.min_salience
    const margin = e.margin
    return (
      <ExtrasLine>
        <span
          className={cn(
            'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
            passed
              ? 'bg-[color:var(--sage)]'
              : 'bg-[color:var(--sev-amber)]',
          )}
          aria-label={passed ? 'passed' : 'failed'}
        />
        {typeof sal === 'number' ? (
          <ExtraCell label="salience">{sal.toFixed(3)}</ExtraCell>
        ) : null}
        {typeof min === 'number' ? (
          <ExtraCell label="floor">{min.toFixed(3)}</ExtraCell>
        ) : null}
        {typeof margin === 'number' ? (
          <MarginBar margin={margin} passed={passed} />
        ) : null}
      </ExtrasLine>
    )
  }

  if (stage === 'surprise_boost') {
    const e = extra as SurpriseExtras
    if (e.skipped) {
      return (
        <ExtrasLine>
          <StatBadge tone="neutral">stage skipped</StatBadge>
        </ExtrasLine>
      )
    }
    const delta = e.delta
    const arrow = deltaArrow(delta)
    return (
      <ExtrasLine>
        {typeof e.score_before === 'number' && typeof e.score_after === 'number' ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-ink-muted">
            {e.score_before.toFixed(4)}
            <ArrowRight className="h-3 w-3" aria-hidden />
            {e.score_after.toFixed(4)}
          </span>
        ) : null}
        {arrow ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums',
              arrow.tone === 'up' && 'text-[color:var(--sage)]',
              arrow.tone === 'down' && 'text-[color:var(--sev-amber)]',
              arrow.tone === 'flat' && 'text-ink-muted',
            )}
          >
            {arrow.icon}
            {arrow.text}
          </span>
        ) : null}
        {typeof e.surprise === 'number' ? (
          <ExtraCell label="surprise">{e.surprise.toFixed(3)}</ExtraCell>
        ) : null}
      </ExtrasLine>
    )
  }

  if (stage === 'reranker') {
    const e = extra as RerankerExtras
    const before = e.rank_before
    const after = e.rank_after
    if (before == null && after == null) return null
    return (
      <ExtrasLine>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-ink-muted">
          {'rank'}{' '}
          <span className="text-ink">#{before ?? '—'}</span>
          <ArrowRight className="h-3 w-3" aria-hidden />
          <span className="text-ink">#{after ?? '—'}</span>
        </span>
        <RerankMovement before={before} after={after} />
      </ExtrasLine>
    )
  }

  return null
}

// ── Reranker-skipped extras (only the SKIPPED variant) ─────────────────

function RerankerSkippedExtras({
  candidate,
}: {
  candidate: RerankerCandidate
}): React.ReactElement {
  const before = (candidate as { rank_before?: number | null }).rank_before ?? null
  return (
    <ExtrasLine>
      <StatBadge tone="neutral">stage skipped</StatBadge>
      <span className="font-mono text-[10px] tabular-nums text-ink-muted">
        rank #{before ?? '—'} at entry
      </span>
    </ExtrasLine>
  )
}

// ── Presentational bits ────────────────────────────────────────────────

function ExtrasLine({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="ml-[calc(2rem+0.75rem)] flex flex-wrap items-center gap-3 pl-1">
      {children}
    </div>
  )
}

function ExtraCell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-ink-muted">
      <span className="uppercase tracking-widest">{label}</span>
      <span className="text-ink">{children}</span>
    </span>
  )
}

function deltaArrow(delta: number | null | undefined):
  | { icon: React.ReactElement; tone: 'up' | 'down' | 'flat'; text: string }
  | null {
  if (typeof delta !== 'number') return null
  if (delta > 0) {
    return {
      icon: <ArrowUp className="h-3 w-3" aria-hidden />,
      tone: 'up',
      text: `+${delta.toFixed(4)}`,
    }
  }
  if (delta < 0) {
    return {
      icon: <ArrowDown className="h-3 w-3" aria-hidden />,
      tone: 'down',
      text: delta.toFixed(4),
    }
  }
  return {
    icon: <ArrowRight className="h-3 w-3" aria-hidden />,
    tone: 'flat',
    text: '0',
  }
}

function MarginBar({
  margin,
  passed,
}: {
  margin: number
  passed: boolean
}): React.ReactElement {
  // Domain intent: guard threshold is ~0.05 spotlight; margin ranges from
  // ~-0.05 (well below floor) to ~+0.95 (top of scale). Clip to ±0.1 for
  // visible resolution around the boundary — differences that matter live
  // in the first 100 mp of margin either way.
  const clip = 0.1
  const pct = Math.max(-1, Math.min(1, margin / clip)) // -1..+1

  return (
    <span
      className="ml-1 inline-flex h-1.5 w-16 shrink-0 items-center overflow-hidden rounded-pill bg-[color:var(--line)]"
      title={`margin ${margin >= 0 ? '+' : ''}${margin.toFixed(3)}`}
    >
      <span
        className={cn(
          'block h-full',
          passed ? 'bg-[color:var(--sage)]' : 'bg-[color:var(--sev-amber)]',
        )}
        style={{ width: `${Math.min(100, Math.abs(pct) * 100)}%` }}
      />
    </span>
  )
}

function RerankMovement({
  before,
  after,
}: {
  before: number | null | undefined
  after: number | null | undefined
}): React.ReactElement | null {
  if (typeof before !== 'number' || typeof after !== 'number') return null
  const diff = before - after // positive == moved up
  if (diff === 0) {
    return <StatBadge tone="neutral">no move</StatBadge>
  }
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-[color:var(--sage)]">
        <ArrowUp className="h-3 w-3" aria-hidden />
        {diff}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-[color:var(--sev-amber)]">
      <ArrowDown className="h-3 w-3" aria-hidden />
      {Math.abs(diff)}
    </span>
  )
}

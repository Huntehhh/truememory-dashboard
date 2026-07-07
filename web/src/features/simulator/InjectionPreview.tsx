import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import type { InjectionPreview as InjectionPreviewShape } from './api'

/**
 * The final assembled block — same shape as SessionStart's injection block:
 * one `- <content>` line per surviving memory, per-memory truncated at
 * 500 chars, whole-item drops (never partial). We surface three groupings:
 *
 *   included  — line-by-line in the DM Mono <pre>, id chip visible
 *   truncated — id chips only, styled amber; content is still in the pre
 *   dropped   — id chips only, styled muted; no content
 *
 * The gold-fill meter at top shows chars_used vs budget so operators
 * instantly see how much of the ~8KB budget the shape actually consumed.
 */
export interface InjectionPreviewProps {
  preview: InjectionPreviewShape
}

export function InjectionPreview({
  preview,
}: InjectionPreviewProps): React.ReactElement {
  const {
    text,
    chars_used,
    budget,
    per_memory_chars,
    included_ids,
    truncated_ids,
    dropped_ids,
  } = preview

  const ratio = budget > 0 ? Math.min(1, chars_used / budget) : 0
  const pct = Math.round(ratio * 100)

  return (
    <GlassCard variant="default" padding="lg" className="mt-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <MetricTip
          id="sim.injectionPreview"
          trigger="underline"
          label={
            <h2 className="text-sm font-semibold text-ink">
              Injection preview
            </h2>
          }
        />
        <StatBadge tone="neutral">
          {chars_used.toLocaleString()} / {budget.toLocaleString()} chars
        </StatBadge>
        <StatBadge tone="neutral">
          {pct}% of budget
        </StatBadge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          per-memory cap {per_memory_chars}
        </span>
      </header>

      <div
        className="mb-3 h-2 w-full overflow-hidden rounded-pill bg-[color:var(--line)]"
        role="progressbar"
        aria-label="Injection budget"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={chars_used}
      >
        <div
          className="h-full bg-[color:var(--gold)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <IdChipRow
        label="included"
        ids={included_ids}
        tone="sage"
        emptyNote="No memories fit under the budget."
      />
      {truncated_ids.length > 0 ? (
        <IdChipRow
          label="truncated"
          ids={truncated_ids}
          tone="amber"
          emptyNote={null}
        />
      ) : null}
      {dropped_ids.length > 0 ? (
        <IdChipRow
          label="dropped"
          ids={dropped_ids}
          tone="neutral"
          emptyNote={null}
        />
      ) : null}

      <div className="mt-3 min-h-0">
        <pre
          className={cn(
            'w-full overflow-auto whitespace-pre-wrap break-words rounded-lg',
            'border border-[color:var(--glass-border)] bg-[color:var(--surface)]',
            'px-4 py-3 font-mono text-xs leading-relaxed text-ink',
          )}
          style={{ maxHeight: 'min(60dvh, 100dvh)' }}
        >
          {text.length > 0
            ? text
            : '(nothing to inject — the assembled block is empty)'}
        </pre>
      </div>
    </GlassCard>
  )
}

function IdChipRow({
  label,
  ids,
  tone,
  emptyNote,
}: {
  label: string
  ids: (number | null)[]
  tone: 'sage' | 'amber' | 'neutral'
  emptyNote: string | null
}): React.ReactElement | null {
  if (ids.length === 0 && !emptyNote) return null

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      {ids.length === 0 && emptyNote ? (
        <span className="text-xs text-ink-muted">{emptyNote}</span>
      ) : (
        ids.map((id, i) =>
          id == null ? null : (
            <StatBadge key={`${label}-${id}-${i}`} tone={tone}>
              #{id}
            </StatBadge>
          ),
        )
      )}
    </div>
  )
}

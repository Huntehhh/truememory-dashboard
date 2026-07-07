import * as React from 'react'
import { cn } from '@/lib/utils'
import { JUNK_FLAG_LABEL } from './utils'
import type { JunkFlag } from './types'

/**
 * ReviewFilterPills — segmented pill row for narrowing the review queue.
 *
 * Values:
 *   'all_flagged'    — every row that trips ANY heuristic
 *   'everything'     — the raw feed, unfiltered (audit mode)
 *   JunkFlag         — one specific heuristic
 */

export type ReviewFilterValue = JunkFlag | 'all_flagged' | 'everything'

export interface ReviewFilterPillsProps {
  value: ReviewFilterValue
  onChange: (next: ReviewFilterValue) => void
  counts: Record<ReviewFilterValue, number>
}

/** Order matters — it's the reading order of the pill row. */
const OPTIONS: readonly {
  value: ReviewFilterValue
  label: string
}[] = [
  { value: 'all_flagged', label: 'All flagged' },
  { value: 'dict_shape', label: JUNK_FLAG_LABEL.dict_shape },
  { value: 'uncategorized', label: JUNK_FLAG_LABEL.uncategorized },
  { value: 'stale_unretrieved', label: JUNK_FLAG_LABEL.stale_unretrieved },
  { value: 'tiny_fragment', label: JUNK_FLAG_LABEL.tiny_fragment },
  { value: 'everything', label: 'Show everything' },
]

export function ReviewFilterPills({
  value,
  onChange,
  counts,
}: ReviewFilterPillsProps): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Review queue filter"
      className="flex flex-wrap gap-2"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
              active
                ? 'border-transparent text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
                : 'border-[color:var(--glass-border)] bg-[color:var(--surface)] text-ink-muted hover:bg-[color:var(--surface-strong)] hover:text-ink',
            )}
            style={
              active
                ? {
                    backgroundColor:
                      'color-mix(in oklab, var(--navy) 12%, var(--surface-strong))',
                    borderColor:
                      'color-mix(in oklab, var(--navy) 32%, transparent)',
                  }
                : undefined
            }
          >
            <span>{opt.label}</span>
            <span className="font-mono text-[10px] tabular-nums text-ink-muted">
              {counts[opt.value].toLocaleString()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

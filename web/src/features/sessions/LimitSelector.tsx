import * as React from 'react'
import { cn } from '@/lib/utils'
import { SESSIONS_LIMITS, type SessionsLimit } from './types'

/**
 * LimitSelector — 25 / 100 / all segmented control. Mirrors the feed's
 * shape so the whole app reads as one system; local rather than shared so
 * the two pages can drift on labels without cross-page churn.
 *
 * `'all'` is a sentinel: the hook drops the limit query param entirely when
 * this is selected, so the backend returns every episode + landmark.
 */

interface LimitSelectorProps {
  value: SessionsLimit
  onChange: (next: SessionsLimit) => void
}

export function LimitSelector({
  value,
  onChange,
}: LimitSelectorProps): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="Row limit"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill border border-[color:var(--glass-border)]',
        'bg-[color:var(--surface)] p-0.5',
      )}
    >
      {SESSIONS_LIMITS.map((limit) => {
        const selected = limit === value
        return (
          <button
            key={String(limit)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(limit)}
            className={cn(
              'rounded-pill px-3 py-1 text-xs font-mono tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
              selected
                ? 'bg-[color:var(--surface-strong)] text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {limit}
          </button>
        )
      })}
    </div>
  )
}

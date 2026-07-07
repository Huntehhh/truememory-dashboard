import * as React from 'react'
import { cn } from '@/lib/utils'
import { FEED_LIMITS, type FeedLimit } from './types'

/**
 * LimitSelector — small segmented control for row-count. Sits in the feed
 * toolbar alongside the category chips. Kept intentionally simple: an aria
 * radiogroup so it reads correctly for screen readers.
 */

interface LimitSelectorProps {
  value: FeedLimit
  onChange: (next: FeedLimit) => void
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
      {FEED_LIMITS.map((limit) => {
        const selected = limit === value
        return (
          <button
            key={limit}
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

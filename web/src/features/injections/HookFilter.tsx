import { cn } from '@/lib/utils'

/**
 * Hook filter values map to the raw `hook` column in tm_injections
 * (snake_case), while the UI labels match the operator vocab in the pipeline
 * (CamelCase). Filtering is client-side today because /api/memory/injections
 * doesn't accept a ?hook= param — the row set is small so this stays cheap.
 */
export type HookFilterValue =
  | 'all'
  | 'session_start'
  | 'user_prompt_submit'
  | 'stop'
  | 'compact'

const HOOK_OPTIONS: readonly { value: HookFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'session_start', label: 'SessionStart' },
  { value: 'user_prompt_submit', label: 'UserPromptSubmit' },
  { value: 'stop', label: 'Stop' },
  { value: 'compact', label: 'Compact' },
]

const LIMIT_OPTIONS: readonly number[] = [25, 50, 100, 250]

export interface HookFilterProps {
  hook: HookFilterValue
  onHookChange: (h: HookFilterValue) => void
  limit: number
  onLimitChange: (n: number) => void
  matchingCount: number
  totalCount: number
}

export function HookFilter({
  hook,
  onHookChange,
  limit,
  onLimitChange,
  matchingCount,
  totalCount,
}: HookFilterProps): React.ReactElement {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-pill border border-[color:var(--glass-border)]',
          'bg-[color:var(--surface)] p-1 text-ink-muted backdrop-blur-[var(--blur-card)]',
        )}
        role="group"
        aria-label="Hook type filter"
      >
        {HOOK_OPTIONS.map((o) => {
          const active = o.value === hook
          return (
            <button
              type="button"
              key={o.value}
              onClick={() => onHookChange(o.value)}
              className={cn(
                'inline-flex h-7 items-center whitespace-nowrap rounded-pill px-3 text-xs font-medium transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                active
                  ? 'bg-[color:var(--surface-strong)] text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
                  : 'hover:text-ink',
              )}
              aria-pressed={active}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {matchingCount}/{totalCount}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          Limit
        </span>
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-pill border border-[color:var(--glass-border)]',
            'bg-[color:var(--surface)] p-1 text-ink-muted backdrop-blur-[var(--blur-card)]',
          )}
          role="group"
          aria-label="Row limit"
        >
          {LIMIT_OPTIONS.map((n) => {
            const active = n === limit
            return (
              <button
                type="button"
                key={n}
                onClick={() => onLimitChange(n)}
                className={cn(
                  'inline-flex h-7 items-center rounded-pill px-2.5 font-mono text-[10px] font-medium uppercase tracking-widest transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                  active
                    ? 'bg-[color:var(--surface-strong)] text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
                    : 'hover:text-ink',
                )}
                aria-pressed={active}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

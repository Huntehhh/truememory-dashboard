import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { StatBadge } from '@/components/glass/StatBadge'
import { MetricTip } from '@/components/glass/MetricTip'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/features/feed/utils'
import type { CurationMemory, CurationNeighbor } from './types'

/**
 * Chrome for the two-phase preview dialogs — the header row, the memory
 * block, the neighbor list, and the amber warning strip.
 *
 * ForgetDialog + RecategorizeDialog + DirectiveDeleteDialog all share this
 * layout so the operator sees the same shape whichever destructive action
 * they're confirming.
 */

// ── Memory block ────────────────────────────────────────────────────────

export function MemoryBlock({
  memory,
  title,
}: {
  memory: CurationMemory
  title: string
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          #{memory.id}
        </span>
        {memory.category ? (
          <StatBadge tone="navy" className="capitalize">
            {memory.category}
          </StatBadge>
        ) : (
          <StatBadge tone="neutral">uncategorized</StatBadge>
        )}
        {memory.directive ? (
          <StatBadge tone="gold">directive</StatBadge>
        ) : null}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {formatRelative(memory.timestamp)}
        </span>
      </header>
      <pre
        className={cn(
          'max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-card',
          'border border-[color:var(--glass-border)] bg-[color:var(--surface)]',
          'px-3 py-2 font-mono text-xs leading-relaxed text-ink',
        )}
      >
        {memory.content}
      </pre>
    </section>
  )
}

// ── Neighbor list ───────────────────────────────────────────────────────

export function NeighborsList({
  neighbors,
}: {
  neighbors: readonly CurationNeighbor[]
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MetricTip
          id="inspector.neighbors"
          trigger="underline"
          label={
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              Closest surviving memories
            </span>
          }
        />
        <span className="font-mono text-[10px] tabular-nums text-ink-muted">
          {neighbors.length}
        </span>
      </div>
      {neighbors.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No neighbors in this embedding tier — either this memory has no
          vector or the store is small enough that the query didn't return
          any close matches.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {neighbors.map((n, i) => (
            <li
              key={`${n.id ?? 'null'}-${i}`}
              className={cn(
                'flex items-start gap-3 rounded-card border px-3 py-2',
                'border-[color:var(--glass-border)] bg-[color:var(--surface)]',
              )}
            >
              <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  #{n.id ?? '—'}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-ink">
                  {formatCosine(n.cosine)}
                </span>
              </div>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink line-clamp-2">
                {n.content_preview || (
                  <span className="text-ink-muted">(empty)</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Cosine similarity → tight display. Falls back to em-dash. */
function formatCosine(v: number | null): string {
  if (v == null) return '—'
  return v.toFixed(3)
}

// ── Warning strip ───────────────────────────────────────────────────────

export function WarningStrip({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-card border px-3 py-2 text-[11px] leading-relaxed',
      )}
      style={{
        backgroundColor:
          'color-mix(in oklab, var(--sev-amber) 8%, var(--surface))',
        borderColor: 'color-mix(in oklab, var(--sev-amber) 32%, transparent)',
      }}
    >
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[color:var(--sev-amber)]"
        aria-hidden
      />
      <p className="text-ink">{children}</p>
    </div>
  )
}

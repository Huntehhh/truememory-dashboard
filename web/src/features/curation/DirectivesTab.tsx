import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { DirectiveComposer } from './DirectiveComposer'
import { DirectiveRow } from './DirectiveRow'
import { DirectiveDeleteDialog } from './DirectiveDeleteDialog'
import { useDirectives } from './hooks'
import type { DirectiveRow as DirectiveRowShape } from './types'

/**
 * DirectivesTab — the standing-instruction list + composer.
 *
 * Directives auto-load into every SessionStart, so stale ones pollute every
 * future chat until they're pruned. This tab treats the list like a queue
 * of "is this still the current policy?" prompts rather than a passive log.
 */

export function DirectivesTab(): React.ReactElement {
  const q = useDirectives()
  const [deleteTarget, setDeleteTarget] =
    React.useState<DirectiveRowShape | null>(null)

  const rows = q.data?.directives ?? []
  const count = q.data?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <DirectiveComposer />

      <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            Active directives
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            {q.isLoading ? '—' : count.toLocaleString()}
          </span>
        </div>

        {q.isError ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink">Couldn't load directives.</p>
            <p className="font-mono text-[11px] text-ink-muted">
              {q.error instanceof Error ? q.error.message : 'Request failed'}
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void q.refetch()
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : q.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyPanel />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <DirectiveRow key={row.id} row={row} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </GlassCard>

      <DirectiveDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function EmptyPanel(): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
        <Sparkles className="h-4 w-4" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">No active directives.</p>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Add a standing instruction above — it will auto-load into every
          future SessionStart until deleted.
        </p>
      </div>
    </div>
  )
}

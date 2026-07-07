import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/features/feed/utils'
import type { DirectiveRow as DirectiveRowShape } from './types'

/**
 * A single directive row — full content shown (not clipped) because
 * directives are meant to be read carefully. Kept above dupes / stale
 * entries in the operator's attention hierarchy.
 */

export interface DirectiveRowProps {
  row: DirectiveRowShape
  onDelete: (row: DirectiveRowShape) => void
}

export function DirectiveRow({
  row,
  onDelete,
}: DirectiveRowProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="sm" className="flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatBadge tone="gold">directive</StatBadge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            #{row.id}
          </span>
        </div>
        <time
          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-ink-muted"
          dateTime={row.created_at ?? undefined}
        >
          {formatRelative(row.created_at)}
        </time>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
        {row.content}
      </p>
      <footer className="flex items-center justify-end">
        <Button
          variant="subtle"
          size="sm"
          onClick={() => onDelete(row)}
          aria-label={`Delete directive ${row.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </Button>
      </footer>
    </GlassCard>
  )
}

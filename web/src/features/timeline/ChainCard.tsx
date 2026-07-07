import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { cn } from '@/lib/utils'
import type { TimelineChain, TimelineFactRow } from './types'
import { formatRelative, formatValidRange } from './utils'

/**
 * A single fact-chain rendered as either:
 *   - compact single row (chain.length === 1) — the common case in current DB
 *   - vertical mini-timeline (chain.length > 1) — superseded rows struck
 *     through above the active tip.
 *
 * Kept subject-agnostic: `subject` in the header prints verbatim so a new
 * class of chain doesn't need a code change to render.
 */

export interface ChainCardProps {
  chain: TimelineChain
}

export function ChainCard({ chain }: ChainCardProps): React.ReactElement {
  const rows = chain.chain
  const isMulti = rows.length > 1
  const rowsLabel = rows.length === 1 ? 'row' : 'rows'

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow className="min-w-0 truncate" title={chain.subject}>
          {chain.subject}
        </Eyebrow>
        <StatBadge
          tone={isMulti ? 'gold' : 'neutral'}
          className="flex-shrink-0"
        >
          {rows.length} {rowsLabel}
        </StatBadge>
      </div>

      {isMulti ? <MultiRowChain rows={rows} /> : <CompactRow row={rows[0]} />}
    </GlassCard>
  )
}

/* ---------- single-row compact rendering ---------- */

function CompactRow({ row }: { row: TimelineFactRow }): React.ReactElement {
  const scope = row.entity_scope && row.entity_scope !== '' ? row.entity_scope : null
  const validFrom = row.valid_from ?? row.timestamp

  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-semibold leading-snug text-ink">{row.fact}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {scope ? (
          <span className="truncate" title={scope}>
            {scope}
          </span>
        ) : null}
        <span>{formatRelative(validFrom)}</span>
        {row.source_message_id != null ? (
          <MessageLink id={row.source_message_id} />
        ) : null}
      </div>
    </div>
  )
}

/* ---------- multi-row mini-timeline rendering ---------- */

function MultiRowChain({ rows }: { rows: TimelineFactRow[] }): React.ReactElement {
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          <ChainRow row={row} />
          {i < rows.length - 1 ? (
            <li aria-hidden className="flex justify-center py-0.5">
              <ChevronDown className="h-3 w-3 text-ink-muted" />
            </li>
          ) : null}
        </React.Fragment>
      ))}
    </ol>
  )
}

function ChainRow({ row }: { row: TimelineFactRow }): React.ReactElement {
  const isActive = row.active
  const validRange = formatValidRange(row.valid_from, row.valid_to)

  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full',
          isActive
            ? 'bg-[color:var(--sage)]'
            : 'bg-[color:var(--line-strong)]',
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'min-w-0 truncate text-sm leading-snug',
              isActive
                ? 'font-semibold text-ink'
                : 'text-ink-muted line-through',
            )}
            title={row.fact}
          >
            {row.fact}
          </span>
          {row.source_message_id != null ? (
            <MessageLink
              id={row.source_message_id}
              className="flex-shrink-0"
            />
          ) : null}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          valid: {validRange}
        </span>
      </div>
    </li>
  )
}

/* ---------- shared bits ---------- */

interface MessageLinkProps {
  id: number
  className?: string
}

function MessageLink({ id, className }: MessageLinkProps): React.ReactElement {
  return (
    <Link
      to={`/inspector/${id}`}
      className={cn(
        'font-mono text-[10px] uppercase tracking-widest text-ink-muted',
        'transition-colors hover:text-[color:var(--gold)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 rounded-pill',
        className,
      )}
      title={`Open message ${id} in Inspector`}
    >
      #{id}
    </Link>
  )
}

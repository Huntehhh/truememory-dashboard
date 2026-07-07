import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import type { RebuildRow } from './types'
import { formatEta, formatRelative } from './utils'

/**
 * Rebuild-status section — usually empty. When populated, each row is one
 * live-or-recent re-embed run pulled from the engine's own status table.
 *
 * The tone map keeps status semantics tight without swallowing unknown
 * strings — an unrecognized `status` renders `neutral` rather than crashing.
 */
type BadgeTone = 'neutral' | 'sage' | 'gold' | 'red' | 'amber' | 'navy'

function toneForStatus(status: string | null): BadgeTone {
  const s = (status ?? '').toLowerCase()
  if (s === 'running' || s === 'in_progress' || s === 'in-progress') return 'sage'
  if (s === 'completed' || s === 'complete' || s === 'done') return 'neutral'
  if (s === 'failed' || s === 'error' || s === 'errored') return 'red'
  if (s === 'paused' || s === 'stalled') return 'amber'
  if (s === 'queued' || s === 'pending' || s === 'starting') return 'navy'
  return 'neutral'
}

export interface RebuildSectionProps {
  rows: RebuildRow[]
}

export function RebuildSection({ rows }: RebuildSectionProps): React.ReactElement {
  if (rows.length === 0) {
    return (
      <GlassCard variant="default" padding="md">
        <p className="text-sm text-ink-muted">No re-embed running.</p>
        <p className="mt-1 text-xs text-ink-muted">
          A re-embed row lands here the moment the engine begins one and stays until it completes.
        </p>
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <RebuildRowCard key={row.id} row={row} />
      ))}
    </div>
  )
}

interface RebuildRowCardProps {
  row: RebuildRow
}

function RebuildRowCard({ row }: RebuildRowCardProps): React.ReactElement {
  const tone = toneForStatus(row.status)
  const processed = row.processed_messages ?? 0
  const total = row.total_messages ?? 0
  const pct = row.progress_pct != null && Number.isFinite(row.progress_pct)
    ? row.progress_pct.toFixed(1)
    : '—'
  const ips = row.throughput_ips != null && Number.isFinite(row.throughput_ips)
    ? row.throughput_ips.toFixed(1)
    : null
  const ram = row.ram_pct != null && Number.isFinite(row.ram_pct)
    ? row.ram_pct.toFixed(0)
    : null

  const source = row.tier_group ?? '—'
  const target = row.target_tier ?? '—'

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatBadge tone="navy">{source}</StatBadge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">to</span>
        <StatBadge tone="gold">{target}</StatBadge>
        <StatBadge tone={tone}>{row.status ?? 'unknown'}</StatBadge>
        {row.action ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {row.action}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            progress
          </span>
          <span className="font-mono text-sm tabular-nums text-ink">
            {processed.toLocaleString()}/{total.toLocaleString()} · {pct}%
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            eta
          </span>
          <span className="font-mono text-sm tabular-nums text-ink">
            {formatEta(row.eta_seconds)}
          </span>
        </div>

        {ips != null ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              throughput
            </span>
            <span className="font-mono text-sm tabular-nums text-ink">{ips} ips</span>
          </div>
        ) : null}

        {ram != null ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              ram
            </span>
            <span className="font-mono text-sm tabular-nums text-ink">
              {ram}%{row.pressure ? ` · ${row.pressure}` : ''}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        <span>started: {formatRelative(row.started_at)}</span>
        <span>heartbeat: {formatRelative(row.last_heartbeat)}</span>
        {row.batch_size != null ? <span>batch: {row.batch_size}</span> : null}
      </div>

      {row.error ? (
        <p className="font-mono text-xs text-[color:var(--sev-red)]">{row.error}</p>
      ) : null}
    </GlassCard>
  )
}

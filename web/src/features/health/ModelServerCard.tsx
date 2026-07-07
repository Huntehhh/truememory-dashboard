import * as React from 'react'
import { Server } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import { serverStatusFrom } from './utils'
import type { ModelServerState, ServerHealth } from './types'

/**
 * Model-server card — reads the two file-lock probes (port lock + ready
 * status file) and folds them into one badge. `partial` covers the common
 * mid-boot state where port is written but the ready sentinel hasn't landed
 * yet; we surface the individual field states below so it's obvious which
 * probe is missing.
 */

const STATUS_TONE: Record<ServerHealth, 'sage' | 'amber' | 'red'> = {
  healthy: 'sage',
  partial: 'amber',
  down: 'red',
}

const STATUS_LABEL: Record<ServerHealth, string> = {
  healthy: 'healthy',
  partial: 'partial',
  down: 'down',
}

export interface ModelServerCardProps {
  state: ModelServerState
}

export function ModelServerCard({
  state,
}: ModelServerCardProps): React.ReactElement {
  const verdict = serverStatusFrom(state)
  const tone = STATUS_TONE[verdict]

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-ink">
          <Server className="h-4 w-4 text-ink-muted" aria-hidden />
          <span className="text-sm">Embedding subprocess</span>
        </div>
        <StatBadge tone={tone}>{STATUS_LABEL[verdict]}</StatBadge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldLine label="Port" value={state.port != null ? String(state.port) : '—'} />
        <FieldLine
          label="Port lock"
          value={state.port_file_exists ? 'present' : 'missing'}
          missing={!state.port_file_exists}
        />
        <FieldLine
          label="Status file"
          value={state.status_file_exists ? 'present' : 'missing'}
          missing={!state.status_file_exists}
        />
      </div>

      {state.status_content ? (
        <pre className="max-h-40 overflow-auto rounded-md border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
          {state.status_content}
        </pre>
      ) : null}
    </GlassCard>
  )
}

interface FieldLineProps {
  label: string
  value: string
  missing?: boolean
}

function FieldLine({ label, value, missing = false }: FieldLineProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          missing ? 'text-[color:var(--sev-amber)]' : 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  )
}

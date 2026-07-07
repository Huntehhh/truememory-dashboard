import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { KpiPayload } from './types'

/**
 * KpiStrip — top row of 4 hero metrics. Uses only fields that the live
 * `/api/memory/kpi` payload actually emits. Cards for `injections24h`,
 * `stores24h`, and `directives` are OMITTED because those fields do not
 * exist on the current KPI endpoint — see the return summary for a list of
 * glossary keys flagged as unused because their metric isn't wired yet.
 */

interface KpiStripProps {
  data: KpiPayload | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

interface Delta {
  label: string
  tone: 'green' | 'red' | 'neutral'
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  const pct = v * 100
  return `${pct.toFixed(1)}%`
}

function growthPctDelta(v: number | null | undefined): Delta | null {
  if (v == null) return null
  const pts = v * 100
  const rounded = Math.abs(pts) < 0.05 ? 0 : pts
  const label = `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}% vs prior 7d`
  const tone: Delta['tone'] = rounded > 0 ? 'green' : rounded < 0 ? 'red' : 'neutral'
  return { label, tone }
}

function passRateDelta(pts: number | null | undefined): Delta | null {
  if (pts == null) return null
  const rounded = Math.abs(pts) < 0.05 ? 0 : pts
  const label = `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)} pts`
  const tone: Delta['tone'] = rounded > 0 ? 'green' : rounded < 0 ? 'red' : 'neutral'
  return { label, tone }
}

export function KpiStrip({
  data,
  isLoading,
  isError,
  errorMessage,
}: KpiStripProps): React.ReactElement {
  if (isError) {
    return (
      <GlassCard variant="tinted" accent="tan" padding="md" className="col-span-full">
        <p className="text-sm text-ink">Couldn't load KPI strip.</p>
        <p className="mt-1 text-xs text-ink-muted">{errorMessage ?? 'Retry once the API is reachable.'}</p>
      </GlassCard>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        tipId="kpi.total"
        label="Total memories"
        value={isLoading || !data ? null : formatNumber(data.total_memories)}
        delta={data ? growthPctDelta(data.growth_pct_7d) : null}
      />
      <KpiCard
        // No glossary key exists for retrieved_7d — flagged: 'kpi.retrieved7d'.
        label="Retrieved (7d)"
        value={isLoading || !data ? null : formatNumber(data.retrieved_7d)}
        subtitle="memory_returned events"
      />
      <KpiCard
        // No glossary key for the 7d window; task requested 'kpi.stores24h'
        // which doesn't apply — the KPI endpoint only exposes 7d growth.
        // Flagged: 'kpi.stores7d'.
        label="New memories (7d)"
        value={isLoading || !data ? null : formatNumber(data.growth_this_week)}
        subtitle="written this week"
      />
      <KpiCard
        tipId="kpi.gatePassRate"
        label="Gate pass rate"
        value={isLoading || !data ? null : formatPct(data.gate_pass_rate)}
        delta={data ? passRateDelta(data.gate_pass_rate_delta_pts) : null}
        subtitle={
          !isLoading && data && data.gate_pass_rate == null
            ? 'gate signals not emitted'
            : undefined
        }
      />
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string | null
  tipId?: 'kpi.total' | 'kpi.gatePassRate'
  subtitle?: string
  delta?: Delta | null
}

function KpiCard({
  label,
  value,
  tipId,
  subtitle,
  delta,
}: KpiCardProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-ink-muted">
          {label}
        </span>
        {tipId ? <MetricTip id={tipId} /> : null}
      </div>
      {value == null ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span
          className={cn(
            'font-mono text-3xl font-medium tabular-nums text-ink',
            value === '—' && 'text-ink-muted',
          )}
        >
          {value}
        </span>
      )}
      <div className="flex items-center gap-2">
        {delta ? (
          <StatBadge
            tone={delta.tone === 'green' ? 'green' : delta.tone === 'red' ? 'red' : 'neutral'}
          >
            {delta.label}
          </StatBadge>
        ) : null}
        {subtitle ? (
          <span className="truncate text-[11px] text-ink-muted">{subtitle}</span>
        ) : null}
      </div>
    </GlassCard>
  )
}

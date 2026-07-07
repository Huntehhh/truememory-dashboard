import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { Sparkline } from '@/components/charts'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RejectReasons } from './RejectReasons'
import { OpenLoops } from './OpenLoops'
import { useGate, useOpenLoops } from './hooks'
import type { GatePayload } from './types'

/**
 * Gate — encoding-gate observability.
 *
 * Layout:
 *   1. Pass-rate hero (kpi.gatePassRate) + pass/reject/total badges.
 *   2. Reject-reasons breakdown (Bars + interpretations).
 *   3. Per-session consistency sparkline — hidden when the payload has none.
 *   4. Open loops — signals that never fire, muted rows, factual only.
 *
 * When the gate payload is entirely empty (stock TrueMemory doesn't emit
 * gate_decision telemetry today), the hero renders a factual empty state
 * naming the exact upstream signal that would light it up. Sparse ≠ broken.
 */
export default function GatePage(): React.ReactElement {
  const gate = useGate()
  const openLoops = useOpenLoops()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operate"
        title={
          <>
            Encoding <AccentWord gold>gate.</AccentWord>
          </>
        }
        subtitle="What gets into memory vs what gets filtered. Pass rate, reject reasons, and per-session consistency across the last 7 days of gate decisions."
      />

      <GateHero
        data={gate.data}
        isLoading={gate.isLoading}
        isError={gate.isError}
        errorMessage={gate.error instanceof Error ? gate.error.message : undefined}
      />

      {gate.data && (gate.data.pass_count + gate.data.reject_count > 0) ? (
        <>
          <RejectReasons
            reasons={gate.data.reject_reasons}
            totalRejects={gate.data.reject_count}
          />

          {gate.data.session_pass_rates.length > 0 ? (
            <SessionConsistency values={gate.data.session_pass_rates} />
          ) : null}
        </>
      ) : null}

      <OpenLoops
        data={openLoops.data}
        isLoading={openLoops.isLoading}
        isError={openLoops.isError}
        errorMessage={
          openLoops.error instanceof Error ? openLoops.error.message : undefined
        }
      />
    </div>
  )
}

/* ────────────────────────── Hero (pass rate) ────────────────────────── */

interface GateHeroProps {
  data: GatePayload | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

function GateHero({
  data,
  isLoading,
  isError,
  errorMessage,
}: GateHeroProps): React.ReactElement {
  if (isError) {
    return (
      <GlassCard variant="tinted" accent="tan" padding="md">
        <p className="text-sm text-ink">Couldn't load gate summary.</p>
        <p className="mt-1 text-xs text-ink-muted">
          {errorMessage ?? 'Retry once the API is reachable.'}
        </p>
      </GlassCard>
    )
  }

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />
  }

  const total = data.pass_count + data.reject_count
  const hasData = total > 0
  const passPct = hasData ? data.pass_rate * 100 : null
  const rejectPct = passPct != null ? 100 - passPct : null

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Eyebrow>Pass rate (7d)</Eyebrow>
            <MetricTip id="kpi.gatePassRate" />
          </div>
          <span
            className={cn(
              'font-mono text-5xl font-medium tabular-nums leading-none',
              hasData ? 'text-ink' : 'text-ink-muted',
            )}
          >
            {passPct != null ? `${passPct.toFixed(1)}%` : '—'}
          </span>
          <p className="mt-2 max-w-xl text-xs text-ink-muted">
            {hasData
              ? `${data.pass_count.toLocaleString()} of ${total.toLocaleString()} candidates cleared the gate over the last 7 days.`
              : 'gate_decision telemetry is not emitting yet — the gate silently accepts everything the extractor produces. Wire encoding-gate.emit() into the extractor to light this up.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatBadge tone="sage">
            {data.pass_count.toLocaleString()} passed
          </StatBadge>
          <StatBadge tone="amber">
            {data.reject_count.toLocaleString()} rejected
          </StatBadge>
          <StatBadge tone="neutral">
            {total.toLocaleString()} total
          </StatBadge>
        </div>
      </div>

      {hasData && passPct != null && rejectPct != null ? (
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-pill border border-[color:var(--glass-border)]">
            <div
              className="h-full"
              style={{
                width: `${passPct}%`,
                backgroundColor:
                  'color-mix(in oklab, var(--sev-green) 42%, transparent)',
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${rejectPct}%`,
                backgroundColor:
                  'color-mix(in oklab, var(--sev-amber) 42%, transparent)',
              }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            <span>pass · {passPct.toFixed(1)}%</span>
            <span>reject · {rejectPct.toFixed(1)}%</span>
          </div>
        </div>
      ) : null}
    </GlassCard>
  )
}

/* ────────────────────── Per-session consistency ────────────────────── */

interface SessionConsistencyProps {
  values: number[]
}

function SessionConsistency({
  values,
}: SessionConsistencyProps): React.ReactElement {
  const mean = React.useMemo(
    () => (values.length === 0 ? null : values.reduce((a, v) => a + v, 0) / values.length),
    [values],
  )
  const min = React.useMemo(
    () => (values.length === 0 ? null : Math.min(...values)),
    [values],
  )
  const max = React.useMemo(
    () => (values.length === 0 ? null : Math.max(...values)),
    [values],
  )

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Eyebrow>Per-session consistency</Eyebrow>
          <p className="text-sm text-ink-muted">
            Pass rate across the last {values.length} sessions — a stable line
            reads as calibration; sudden dips read as a session where the
            extractor emitted a lot of noise.
          </p>
        </div>
        {mean != null ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            mean {(mean * 100).toFixed(0)}%
          </span>
        ) : null}
      </header>
      <div className="flex items-center gap-4">
        <Sparkline
          values={values}
          width={220}
          height={44}
          strokeVar="--navy"
          className="text-ink"
        />
        <div className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          <span>min {min != null ? `${(min * 100).toFixed(0)}%` : '—'}</span>
          <span>max {max != null ? `${(max * 100).toFixed(0)}%` : '—'}</span>
        </div>
      </div>
    </GlassCard>
  )
}

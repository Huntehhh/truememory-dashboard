import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { MetricTip } from '@/components/glass/MetricTip'
import { Bars, type BarDatum } from '@/components/charts'
import type { GateRejectReason } from './types'

/**
 * RejectReasons — top rejection reasons over the last 7 days.
 *
 * The rich payload gives us `{ reason_code, count, pct, interpretation }`
 * per row. Bars work here because reasons are categorical and short, and the
 * secondary text slot lets us surface both the pct and the interpretation on
 * the same line. When the interpretation is empty (unknown reason_code), we
 * fall through to just the pct.
 */

interface RejectReasonsProps {
  reasons: GateRejectReason[]
  totalRejects: number
}

export function RejectReasons({
  reasons,
  totalRejects,
}: RejectReasonsProps): React.ReactElement {
  const bars = React.useMemo<BarDatum[]>(
    () =>
      reasons.map((r) => {
        const pctLabel = `${(r.pct * 100).toFixed(0)}%`
        const secondary = r.interpretation
          ? `${pctLabel} · ${r.interpretation}`
          : pctLabel
        return {
          label: r.reason_code,
          value: r.count,
          secondary,
        }
      }),
    [reasons],
  )

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Eyebrow>Reject reasons</Eyebrow>
            <MetricTip id="gate.rejectReason" />
          </div>
          <p className="text-sm text-ink-muted">
            Why the gate refused candidates over the last 7 days — sorted by
            frequency.
          </p>
        </div>
        {totalRejects > 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {totalRejects.toLocaleString()} rejects
          </span>
        ) : null}
      </header>

      {reasons.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          No rejections to break down — either the gate is passing everything,
          or `gate_decision` telemetry isn't emitting yet.
        </p>
      ) : (
        <Bars data={bars} accentVar="--tan" maxRows={10} />
      )}
    </GlassCard>
  )
}

import * as React from 'react'
import { CheckCircle2, ShieldOff } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import type { HookGate } from './api'

/**
 * The verdict banner sits at the top of the results stack — first thing the
 * eye lands on because it's often the whole story ("Nothing would have
 * injected because the prompt was 8 chars"). Sage when the gate would fire,
 * amber when it wouldn't; reasons list the individual gates.
 *
 * The reasons come from the sidecar verbatim so a single source of truth
 * remains truememory.ingest.hooks.user_prompt_submit — the UI just
 * pretty-prints tokens like `length_too_short` into human phrases.
 */

const REASON_LABEL: Record<string, string> = {
  code_heavy: 'code-shaped prompt',
  no_recall_pattern: 'no recall-intent keywords',
  recall_pattern_matched: 'recall-intent keywords matched',
}

function prettyReason(raw: string): string {
  // `length_ok (32)` → "length OK (32)"
  if (raw.startsWith('length_ok')) {
    return raw.replace('length_ok', 'length OK')
  }
  if (raw.startsWith('length_too_short')) {
    return raw.replace('length_too_short', 'prompt too short')
  }
  if (raw.startsWith('length_too_long')) {
    return raw.replace('length_too_long', 'prompt too long')
  }
  return REASON_LABEL[raw] ?? raw.replace(/_/g, ' ')
}

export interface HookGateVerdictProps {
  gate: HookGate
}

export function HookGateVerdict({
  gate,
}: HookGateVerdictProps): React.ReactElement {
  const fires = gate.would_fire

  return (
    <GlassCard
      variant="tinted"
      accent={fires ? 'sage' : 'gold'}
      padding="md"
      className="mb-4"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 rounded-pill border p-2',
            fires
              ? 'border-[color:color-mix(in_oklab,var(--sage)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--sage)_10%,var(--surface))] text-[color:var(--sage)]'
              : 'border-[color:color-mix(in_oklab,var(--sev-amber)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--sev-amber)_10%,var(--surface))] text-[color:var(--sev-amber)]',
          )}
        >
          {fires ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            <ShieldOff className="h-4 w-4" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MetricTip
              id="sim.hookGate"
              trigger="underline"
              label={
                <span className="text-sm font-medium text-ink">
                  Hook gate:{' '}
                  <span
                    className={
                      fires
                        ? 'text-[color:var(--sage)]'
                        : 'text-[color:var(--sev-amber)]'
                    }
                  >
                    {fires ? 'would fire' : 'would NOT fire'}
                  </span>
                </span>
              }
            />
            {gate.search_intensity ? (
              <StatBadge tone="neutral">
                {gate.search_intensity}
              </StatBadge>
            ) : null}
          </div>

          {gate.cadence_note ? (
            <p className="mt-1 text-xs text-ink-muted">{gate.cadence_note}</p>
          ) : null}

          {gate.reasons.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {gate.reasons.map((r) => (
                <li key={r}>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill px-2 py-0.5',
                      'font-mono text-[10px] text-ink-muted',
                      'border border-[color:var(--glass-border)] bg-[color:var(--surface)]',
                    )}
                  >
                    {prettyReason(r)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </GlassCard>
  )
}

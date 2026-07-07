import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { Skeleton } from '@/components/ui/skeleton'
import type { OpenLoop, OpenLoopsPayload } from './types'

/**
 * OpenLoops — signals whose schema exists but whose runtime never fires.
 *
 * The server categorizes each loop as `crit` / `warn` / `info`. Rendered as
 * muted rows with a severity chip, a one-line title, a body paragraph, and
 * (when the server supplies it) an "activation" hint that says exactly what
 * code change would light this signal up. Presentation is factual only —
 * these are architectural TODOs, not action items.
 */

interface OpenLoopsProps {
  data: OpenLoopsPayload | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

export function OpenLoops({
  data,
  isLoading,
  isError,
  errorMessage,
}: OpenLoopsProps): React.ReactElement {
  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <Eyebrow>Open loops</Eyebrow>
        <p className="text-sm text-ink-muted">
          Signals with schema but no runtime data — the wiring the engine is
          still missing.
        </p>
      </header>

      {isError ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          {errorMessage ?? "Couldn't load open loops."}
        </p>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data.loops.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          No open loops reported — every scheduled signal is firing.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Open loops">
          {data.loops.map((loop) => (
            <LoopRow key={loop.id} loop={loop} />
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function LoopRow({ loop }: { loop: OpenLoop }): React.ReactElement {
  const tone = severityTone(loop.severity)

  return (
    <li className="rounded-card border border-[color:var(--glass-border)] bg-[color:var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatBadge tone={tone}>{loop.tag}</StatBadge>
        <span className="text-sm font-medium text-ink">{loop.title}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{loop.body}</p>
      {loop.activation ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          <span className="font-mono uppercase tracking-widest text-ink-muted">
            to activate ·{' '}
          </span>
          {loop.activation}
        </p>
      ) : null}
    </li>
  )
}

/**
 * Map the server's severity string to a StatBadge tone. Unknown strings fall
 * through to `neutral` so a future 'debug' or 'notice' severity renders
 * without needing a client update.
 */
function severityTone(
  severity: string,
): 'neutral' | 'navy' | 'gold' | 'sage' | 'red' | 'amber' | 'green' {
  switch (severity.toLowerCase()) {
    case 'crit':
      return 'red'
    case 'warn':
      return 'amber'
    case 'info':
      return 'navy'
    default:
      return 'neutral'
  }
}

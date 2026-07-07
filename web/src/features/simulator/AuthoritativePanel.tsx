import * as React from 'react'
import { CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import type { Authoritative } from './api'

/**
 * The "real answer" panel — one honest ``Memory.search()`` call rather than
 * the recomposed stage view. Visually distinct via a gold tint so a scanner
 * can jump straight to "here's what would actually inject" without walking
 * every stage.
 *
 * Divergence: the stages are a decomposition (each rebuilt from the
 * underlying primitives) while `authoritative` is the engine's own answer.
 * They usually match; when they don't, the amber badge fires and the
 * caller is guided to trust `authoritative` and treat the stage view as
 * approximate for that query.
 */
export interface AuthoritativePanelProps {
  authoritative: Authoritative
  divergence: boolean
}

export function AuthoritativePanel({
  authoritative,
  divergence,
}: AuthoritativePanelProps): React.ReactElement {
  const { count, results } = authoritative

  return (
    <GlassCard variant="tinted" accent="gold" padding="lg" className="mt-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2">
          <CheckCheck
            className="h-4 w-4 text-[color:var(--gold)]"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-ink">
            Authoritative result
          </h2>
        </span>
        <StatBadge tone="gold">Memory.search()</StatBadge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {count} row{count === 1 ? '' : 's'}
        </span>

        {divergence ? (
          <MetricTip
            id="sim.divergence"
            className="ml-auto [&>svg]:hidden"
            label={<StatBadge tone="amber">divergence</StatBadge>}
          />
        ) : (
          <MetricTip
            id="sim.divergence"
            className="ml-auto [&>svg]:hidden"
            label={<StatBadge tone="sage">stages agree</StatBadge>}
          />
        )}
      </header>

      {results.length === 0 ? (
        <p className="rounded-md border border-dashed border-[color:var(--glass-border)] px-3 py-4 text-xs text-ink-muted">
          The engine's own search returned nothing — no memory qualified after
          every stage ran. Widen the query, lower the salience floor, or run
          this in the Inspector to see what a nearby memory looks like.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((r, i) => (
            <li
              key={`${r.id}-${i}`}
              className={cn(
                'flex flex-col gap-1 rounded-lg border border-[color:var(--glass-border)]',
                'bg-[color:var(--surface)] px-3 py-2',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/inspector/${r.id}`}
                  className={cn(
                    'shrink-0 rounded-pill border border-[color:var(--glass-border)]',
                    'bg-[color:var(--surface)] px-2 py-0.5',
                    'font-mono text-[10px] text-ink hover:border-[color:var(--line-strong)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                  )}
                  title={`Open memory #${r.id} in the inspector`}
                >
                  #{r.id}
                </Link>
                {typeof r.score === 'number' ? (
                  <span className="font-mono text-[10px] tabular-nums text-ink">
                    {r.score.toFixed(4)}
                  </span>
                ) : null}
                {r.source ? (
                  <StatBadge tone="navy">{r.source}</StatBadge>
                ) : null}
                {r.category ? (
                  <StatBadge tone="neutral">{r.category}</StatBadge>
                ) : null}
                {r.sender ? (
                  <span className="font-mono text-[10px] text-ink-muted">
                    {r.sender}
                  </span>
                ) : null}
                {r.timestamp ? (
                  <span
                    className="ml-auto font-mono text-[10px] text-ink-muted"
                    title={r.timestamp}
                  >
                    {shortTime(r.timestamp)}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-ink">{r.content_preview}</p>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

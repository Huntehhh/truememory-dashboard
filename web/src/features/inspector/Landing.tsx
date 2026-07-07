import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FileSearch } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useInspectRecent } from './hooks'
import { formatFullDate } from './utils'

/**
 * Landing — the /inspector base page. Two panels:
 *   1. ID entry — jump straight to a memory by number.
 *   2. Recent memories — most-recent 20 rows from the feed as a quick pick list.
 */
export function InspectorLanding(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <IdSearchCard />
      <RecentMemoriesCard />
    </div>
  )
}

/* ── ID search ────────────────────────────────────────────────────────── */

function IdSearchCard(): React.ReactElement {
  const navigate = useNavigate()
  const [raw, setRaw] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const submit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = raw.trim()
      const id = Number.parseInt(trimmed, 10)
      if (!Number.isFinite(id) || id <= 0 || String(id) !== trimmed) {
        setError('enter a positive integer memory id')
        return
      }
      setError(null)
      navigate(`/inspector/${id}`)
    },
    [raw, navigate],
  )

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
          <FileSearch className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex flex-col">
          <Eyebrow>Jump to memory</Eyebrow>
          <p className="text-xs text-ink-muted">
            Enter a memory id — see it in full, its neighbors, and its raw
            embedding.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <label htmlFor="inspector-id" className="sr-only">
          Memory id
        </label>
        <input
          id="inspector-id"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="1404"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className={cn(
            'h-9 min-w-[10rem] rounded-pill border border-[color:var(--line-strong)]',
            'bg-[color:var(--surface)] px-4 font-mono text-sm text-ink',
            'placeholder:text-ink-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
          )}
        />
        <Button type="submit" variant="primary" size="sm">
          Inspect <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
        {error ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--sev-red)]">
            {error}
          </span>
        ) : null}
      </form>
    </GlassCard>
  )
}

/* ── Recent memories ──────────────────────────────────────────────────── */

function RecentMemoriesCard(): React.ReactElement {
  const q = useInspectRecent(20)
  const rows = q.data?.data ?? []

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <Eyebrow>Recent memories</Eyebrow>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          latest 20
        </span>
      </header>

      {q.isError ? (
        <p className="text-xs text-ink-muted">
          couldn't load the recent list —{' '}
          {q.error instanceof Error ? q.error.message : 'retry after the API recovers'}
        </p>
      ) : q.isLoading || !q.data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-ink-muted">
          the store is empty — nothing to inspect yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/inspector/${row.id}`}
                className={cn(
                  'group flex items-center gap-3 rounded-card border border-[color:var(--line)]',
                  'bg-[color:var(--surface-strong)] px-3 py-2 transition-colors',
                  'hover:bg-[color:var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                )}
              >
                <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  #{row.id}
                </span>
                {row.category ? (
                  <StatBadge tone="neutral" className="capitalize">
                    {row.category}
                  </StatBadge>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs text-ink group-hover:text-ink">
                  {row.content_preview || (
                    <span className="italic text-ink-muted">(empty)</span>
                  )}
                </span>
                <span
                  className="hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-ink-muted md:inline"
                  title={row.ts ?? ''}
                >
                  {formatFullDate(row.ts)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </GlassCard>
  )
}

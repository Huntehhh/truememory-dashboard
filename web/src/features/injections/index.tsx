import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { AccentWord } from '@/components/glass/AccentWord'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { StatBadge } from '@/components/glass/StatBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { keys } from '@/lib/queryClient'
import { fetchInjections, type InjectionRow as InjectionRowShape } from './api'
import { HookFilter, type HookFilterValue } from './HookFilter'
import { InjectionRow } from './InjectionRow'
import { InjectionDetailDialog } from './InjectionDetailDialog'

/**
 * The injection feed — every hook fire the mirror captured, newest first.
 *
 * Data flow:
 *   /api/memory/injections?limit=N  →  { limit, data: InjectionRow[] }
 *   The endpoint doesn't accept a ?hook= filter yet, so hook filtering is
 *   client-side over the fetched page. React Query polls at 30s while the tab
 *   is foregrounded — matches the mirror's poll cycle so the feed stays fresh
 *   without hammering the DB when the operator has the tab in the background.
 */
export default function InjectionsPage(): React.ReactElement {
  const [hook, setHook] = useState<HookFilterValue>('all')
  const [limit, setLimit] = useState<number>(50)
  const [selected, setSelected] = useState<InjectionRowShape | null>(null)

  const q = useQuery({
    queryKey: keys.injections.list({ limit }),
    queryFn: () => fetchInjections(limit),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const rows = q.data?.data ?? []
  const filtered = useMemo(() => {
    if (hook === 'all') return rows
    return rows.filter((r) => r.hook === hook)
  }, [rows, hook])

  const liveBadge = q.isError ? (
    <StatBadge tone="amber">error</StatBadge>
  ) : q.isFetching ? (
    <StatBadge tone="gold">refreshing</StatBadge>
  ) : (
    <StatBadge tone="sage">live · 30s</StatBadge>
  )

  return (
    <>
      <PageHeader
        eyebrow="Recall"
        title={
          <>
            <AccentWord gold>Injections</AccentWord> feed
          </>
        }
        subtitle="What TrueMemory actually placed into Claude's context — every SessionStart blanket recall, UserPromptSubmit targeted lookup, and Stop-hook capture. Click a row for the full injected block."
        actions={liveBadge}
      />

      <HookFilter
        hook={hook}
        onHookChange={setHook}
        limit={limit}
        onLimitChange={setLimit}
        matchingCount={filtered.length}
        totalCount={rows.length}
      />

      {q.isLoading ? (
        <LoadingList />
      ) : q.isError ? (
        <ErrorPanel
          message={q.error instanceof Error ? q.error.message : 'Request failed'}
          onRetry={() => {
            void q.refetch()
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyPanel hasRows={rows.length > 0} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Injection events">
          {filtered.map((row) => (
            <InjectionRow key={row.id} row={row} onOpen={setSelected} />
          ))}
        </ul>
      )}

      <InjectionDetailDialog row={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function LoadingList(): React.ReactElement {
  return (
    <ul className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-12 w-full rounded-card" />
        </li>
      ))}
    </ul>
  )
}

function EmptyPanel({ hasRows }: { hasRows: boolean }): React.ReactElement {
  return (
    <GlassCard variant="default" padding="lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">
            {hasRows ? 'No injections match this filter.' : 'No injections yet.'}
          </p>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            {hasRows
              ? 'Widen the hook filter or bump the limit — the mirror only surfaces what the injection hooks actually emitted.'
              : 'Rows appear here within one mirror poll cycle after a SessionStart, UserPromptSubmit, Stop, or Compact hook fires.'}
          </p>
        </div>
      </div>
    </GlassCard>
  )
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): React.ReactElement {
  return (
    <GlassCard variant="strong" padding="lg">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            Couldn't load injections.
          </p>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            The dashboard API returned an error — the mirror or Postgres may be
            offline. Retry, or open the Health page to inspect the pipeline.
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-muted">{message}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

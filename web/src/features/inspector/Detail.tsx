import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { AccentWord } from '@/components/glass/AccentWord'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConnectionsSection } from './ConnectionsSection'
import { HeroCard } from './HeroCard'
import { NeighborsList } from './NeighborsList'
import { RawVector } from './RawVector'
import { useInspect } from './hooks'

/**
 * Detail — /inspector/:id. Hero card, connections, neighbors, optional raw
 * vector. Prev/next arrows step through consecutive ids (memory ids are
 * monotonic; the server 404s cleanly on gaps so we don't need to know the
 * exact adjacent id set client-side).
 */
export function InspectorDetail(): React.ReactElement {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const idNum = React.useMemo(() => {
    const raw = params.id ?? ''
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0 || String(n) !== raw) return null
    return n
  }, [params.id])

  const [showVector, setShowVector] = React.useState(false)
  // Reset the vector toggle whenever we navigate to a different memory —
  // keeps the "reveal" state per-memory rather than persisting across ids.
  React.useEffect(() => {
    setShowVector(false)
  }, [idNum])

  const q = useInspect(idNum, showVector)

  const gotoRelative = (delta: -1 | 1) => {
    if (idNum == null) return
    const next = idNum + delta
    if (next < 1) return
    navigate(`/inspector/${next}`)
  }

  // Bad path param — pure client-side guard, no fetch.
  if (idNum == null) {
    return (
      <div className="flex flex-col gap-6">
        <Header id={null} />
        <ErrorPanel
          title="Invalid memory id"
          detail={`"${params.id ?? ''}" isn't a positive integer.`}
        />
      </div>
    )
  }

  const isMissing =
    q.isError && q.error instanceof ApiError && q.error.status === 404

  return (
    <div className="flex flex-col gap-6">
      <Header id={idNum} onPrev={() => gotoRelative(-1)} onNext={() => gotoRelative(1)} />

      {isMissing ? (
        <ErrorPanel
          title="Memory not found"
          detail={`#${idNum} isn't in the store. It may have been forgotten, or the id was mistyped. Try a nearby id with the arrows.`}
        />
      ) : q.isError ? (
        <ErrorPanel
          title="Couldn't load memory"
          detail={q.error instanceof Error ? q.error.message : 'request failed'}
          onRetry={() => {
            void q.refetch()
          }}
        />
      ) : q.isLoading || !q.data ? (
        <LoadingBody />
      ) : q.data.memory == null ? (
        <ErrorPanel
          title="Memory not found"
          detail={`#${idNum} isn't in the store.`}
        />
      ) : (
        <>
          <HeroCard memory={q.data.memory} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ConnectionsSection connections={q.data.connections} />
            </div>
            <div className="lg:col-span-2">
              <NeighborsList neighbors={q.data.neighbors} />
            </div>
          </div>
          <RawVector
            vector={q.data.vector}
            isLoading={q.isFetching && showVector && q.data.vector == null}
            expanded={showVector}
            onToggle={() => setShowVector((v) => !v)}
            reportedDim={q.data.memory.embedding_dim}
          />
        </>
      )}
    </div>
  )
}

/* ── Header ───────────────────────────────────────────────────────────── */

interface HeaderProps {
  id: number | null
  onPrev?: () => void
  onNext?: () => void
}

function Header({ id, onPrev, onNext }: HeaderProps): React.ReactElement {
  return (
    <PageHeader
      eyebrow="Diagnose"
      title={
        <>
          Memory <AccentWord gold>inspector</AccentWord>
          {id != null ? (
            <span className="ml-3 font-mono text-lg text-ink-muted">
              #{id}
            </span>
          ) : null}
        </>
      }
      subtitle="Full content, connections, nearest neighbors, and the raw embedding for a single memory."
      actions={
        <div className="flex items-center gap-2">
          {onPrev && onNext ? (
            <>
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous memory id"
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-pill',
                  'border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-ink-muted',
                  'transition-colors hover:bg-[color:var(--surface-strong)] hover:text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                )}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="Next memory id"
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-pill',
                  'border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-ink-muted',
                  'transition-colors hover:bg-[color:var(--surface-strong)] hover:text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                )}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : null}
          <Link
            to="/inspector"
            className={cn(
              'inline-flex items-center gap-1 rounded-pill border border-[color:var(--line-strong)]',
              'bg-[color:var(--surface)] px-3 py-1 text-xs text-ink-muted',
              'transition-colors hover:bg-[color:var(--surface-strong)] hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
            )}
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> All memories
          </Link>
        </div>
      }
    />
  )
}

/* ── States ───────────────────────────────────────────────────────────── */

function LoadingBody(): React.ReactElement {
  return (
    <>
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </>
  )
}

interface ErrorPanelProps {
  title: string
  detail: string
  onRetry?: () => void
}

function ErrorPanel({
  title,
  detail,
  onRetry,
}: ErrorPanelProps): React.ReactElement {
  return (
    <GlassCard variant="tinted" accent="tan" padding="lg">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </GlassCard>
  )
}

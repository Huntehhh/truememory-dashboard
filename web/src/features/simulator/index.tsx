import * as React from 'react'
import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { AccentWord } from '@/components/glass/AccentWord'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { StatBadge } from '@/components/glass/StatBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  fetchSimulate,
  type SimulateResponse,
} from './api'
import { AuthoritativePanel } from './AuthoritativePanel'
import { HookGateVerdict } from './HookGateVerdict'
import { InjectionPreview } from './InjectionPreview'
import {
  QueryComposer,
  toWireSkip,
  type QueryComposerValue,
} from './QueryComposer'
import { StageWaterfall } from './StageWaterfall'

/**
 * Retrieval Simulator — the "if I typed X, what would inject and why not?"
 * page. Runs a real search through the sidecar and shows every stage of
 * the pipeline as inspectable output.
 *
 * State model — deliberately local. Zustand-level persistence isn't worth
 * it here because a simulator is inherently ephemeral: you type a query,
 * you look, you type another. If we ever want back/forward through past
 * runs, that's a URL-search-param problem, not a store problem.
 */

const DEFAULT_VALUE: QueryComposerValue = {
  query: '',
  limit: 10,
  // Match live-hook behavior by default. Salience guard + surprise boost
  // are ON in production; reranker is OFF for latency.
  runReranker: false,
  runSalienceGuard: true,
  runSurpriseBoost: true,
}

export default function SimulatorPage(): React.ReactElement {
  const [composer, setComposer] = useState<QueryComposerValue>(DEFAULT_VALUE)
  const [runId, setRunId] = useState(0)

  const mutation = useMutation<SimulateResponse, Error, QueryComposerValue>({
    mutationKey: ['simulator', 'run'],
    mutationFn: (v) =>
      fetchSimulate({
        query: v.query,
        limit: v.limit,
        skip: toWireSkip(v),
      }),
  })

  const isRunning = mutation.isPending

  const submit = (): void => {
    if (!composer.query.trim()) return
    setRunId((n) => n + 1)
    mutation.mutate(composer)
  }

  const rerankerFirstRunWarning =
    isRunning && composer.runReranker && runId === 1

  return (
    <>
      <PageHeader
        eyebrow="Diagnose"
        title={
          <>
            Retrieval <AccentWord gold>Simulator</AccentWord>
          </>
        }
        subtitle="Runs your prompt through the real recall pipeline, stage by stage — the same code path a live hook would take, with every filter exposed."
        actions={
          mutation.isError ? (
            <StatBadge tone="red">error</StatBadge>
          ) : mutation.isSuccess ? (
            <StatBadge tone="sage">ran clean</StatBadge>
          ) : (
            <StatBadge tone="neutral">idle</StatBadge>
          )
        }
      />

      <QueryComposer
        value={composer}
        onChange={setComposer}
        onSubmit={submit}
        isRunning={isRunning}
      />

      {mutation.isIdle ? (
        <IdlePanel />
      ) : mutation.isPending ? (
        <LoadingPanel warnReranker={rerankerFirstRunWarning} />
      ) : mutation.isError ? (
        <ErrorPanel
          message={
            mutation.error instanceof Error
              ? mutation.error.message
              : String(mutation.error ?? 'Request failed')
          }
          onRetry={submit}
        />
      ) : mutation.isSuccess ? (
        <ResultsPanel data={mutation.data} />
      ) : null}
    </>
  )
}

// ── Sub-panels ─────────────────────────────────────────────────────────

function IdlePanel(): React.ReactElement {
  return (
    <GlassCard variant="default" padding="lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
          <Wand2 className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">
            Type a prompt above and hit Run.
          </p>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            You'll see the hook-gate verdict, every stage's candidates in
            order (fts → vector → RRF → salience → surprise → reranker), the
            engine's authoritative result, and the full injection block that
            would enter Claude's context.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}

function LoadingPanel({
  warnReranker,
}: {
  warnReranker: boolean
}): React.ReactElement {
  return (
    <GlassCard variant="default" padding="lg">
      <p className="text-sm font-medium text-ink">Running…</p>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">
        The sidecar lazy-loads the TrueMemory engine on the first request —
        expect 1–5s while SQLite and the vector index warm up.
        {warnReranker ? (
          <>
            {' '}
            <span className="text-[color:var(--sev-amber)]">
              With the reranker on, the very first run can take up to a
              minute while the cross-encoder spins onto the GPU.
            </span>
          </>
        ) : null}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
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
    <GlassCard
      variant="tinted"
      accent="gold"
      padding="lg"
      className={cn('border-[color:color-mix(in_oklab,var(--sev-amber)_28%,transparent)]')}
    >
      <p className="text-sm font-medium text-ink">Couldn't run the simulator.</p>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">
        The sidecar returned an error — usually a stale engine handle, the
        vector table missing, or the model server unreachable. Retry, or
        open Health for a live probe.
      </p>
      <p className="mt-2 font-mono text-[11px] text-ink-muted">{message}</p>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </GlassCard>
  )
}

function ResultsPanel({
  data,
}: {
  data: SimulateResponse
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <HookGateVerdict gate={data.hook_gate} />
      <StageWaterfall stages={data.stages} />
      <AuthoritativePanel
        authoritative={data.authoritative}
        divergence={data.divergence}
      />
      <InjectionPreview preview={data.injection_preview} />
    </div>
  )
}

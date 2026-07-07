import * as React from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MetricTip } from '@/components/glass/MetricTip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { FeedRow } from '@/features/feed/types'
import {
  MemoryBlock,
  NeighborsList,
  WarningStrip,
} from './PreviewDialogChrome'
import { usePreviewForget, useForget } from './hooks'
import { useCountdown } from './useCountdown'
import { useToast } from './ToastContext'

/**
 * ForgetDialog — the destructive path. Two-phase:
 *
 *   1. Preview  — POST /curation/preview-forget on open, render the memory
 *                 + neighbors + warning, arm a 60s countdown from the
 *                 sidecar-issued token TTL.
 *   2. Confirm  — POST /curation/forget with the token; on success invalidate
 *                 feed + kpi + queue queries and toast, on failure toast the
 *                 detail and let the operator retry from a fresh preview.
 *
 * The confirm button is disabled while the preview is loading, when the
 * countdown hits zero, and while the mutation is in flight.
 */

export interface ForgetDialogProps {
  target: FeedRow | null
  onClose: () => void
}

export function ForgetDialog({
  target,
  onClose,
}: ForgetDialogProps): React.ReactElement {
  const memoryId = target?.id ?? null
  const previewQ = usePreviewForget(memoryId)
  const forgetM = useForget()
  const { push } = useToast()

  // Freeze the token expiry as an absolute wall-clock timestamp the first
  // time the preview resolves. `useCountdown` uses this to keep the
  // countdown honest across tab throttling.
  const [expiryMs, setExpiryMs] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (previewQ.data) {
      setExpiryMs(Date.now() + previewQ.data.expires_in_seconds * 1000)
    } else {
      setExpiryMs(null)
    }
  }, [previewQ.data])

  // Reset local state whenever the target changes (dialog re-open on a
  // different memory, or dialog closes).
  React.useEffect(() => {
    if (target === null) setExpiryMs(null)
  }, [target])

  const remaining = useCountdown(expiryMs)
  const tokenExpired = expiryMs !== null && remaining === 0
  const confirmDisabled =
    !previewQ.data ||
    previewQ.isLoading ||
    tokenExpired ||
    forgetM.isPending

  const handleConfirm = (): void => {
    if (!previewQ.data || !target) return
    forgetM.mutate(
      {
        memoryId: target.id,
        confirmToken: previewQ.data.confirm_token,
      },
      {
        onSuccess: (res) => {
          push({
            tone: 'success',
            title: `Memory #${target.id} forgotten`,
            detail: res.audit_id
              ? `Audit id ${res.audit_id.slice(0, 8)}…`
              : undefined,
          })
          onClose()
        },
        onError: (err) => {
          push({
            tone: 'error',
            title: `Couldn't forget #${target.id}`,
            detail: err instanceof Error ? err.message : 'Unknown error',
          })
        },
      },
    )
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) onClose()
  }

  const open = target !== null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {target ? (
        <DialogContent
          className={cn(
            'w-[min(96vw,720px)] max-w-none p-0',
            'grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0',
          )}
          style={{ maxHeight: 'min(80dvh, 720px)' }}
        >
          <header className="border-b border-[color:var(--line)] px-5 py-4 pr-14">
            <DialogTitle className="text-base">
              Forget memory #{target.id}?
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              This deletes the memory from the live store. Every action lands
              in the sidecar audit log so it's reconstructable — but there's
              no undo endpoint yet.
            </DialogDescription>
          </header>

          <div className="min-h-0 overflow-auto px-5 py-4">
            {previewQ.isLoading ? (
              <PreviewLoading />
            ) : previewQ.isError ? (
              <PreviewError
                message={
                  previewQ.error instanceof Error
                    ? previewQ.error.message
                    : 'Preview failed'
                }
              />
            ) : previewQ.data ? (
              <div className="flex flex-col gap-4">
                <MemoryBlock
                  memory={previewQ.data.memory}
                  title="Memory to forget"
                />
                <NeighborsList neighbors={previewQ.data.neighbors} />
                <WarningStrip>
                  {previewQ.data.neighbors.length === 0
                    ? 'No close neighbors were found — this may be the only copy of the underlying fact. Double-check before confirming.'
                    : 'Check the neighbor list — if none of them carry the same fact, forgetting this memory removes it from the store.'}
                </WarningStrip>
              </div>
            ) : null}
          </div>

          <footer
            className={cn(
              'flex items-center justify-between gap-3 border-t px-5 py-3',
              'border-[color:var(--line)] bg-[color:var(--surface)]',
            )}
          >
            <CountdownTag
              remaining={remaining}
              expired={tokenExpired}
              armed={previewQ.data !== undefined}
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={confirmDisabled}
                aria-label={`Confirm forget memory ${target.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {forgetM.isPending ? 'Forgetting…' : 'Confirm forget'}
              </Button>
            </div>
          </footer>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

export function CountdownTag({
  remaining,
  expired,
  armed,
}: {
  remaining: number
  expired: boolean
  armed: boolean
}): React.ReactElement {
  const label = !armed
    ? 'Waiting on preview…'
    : expired
      ? 'Token expired — reopen to reissue'
      : `Token expires in ${remaining}s`
  return (
    <MetricTip
      id="curation.twoPhase"
      trigger="underline"
      label={
        <span
          className={cn(
            'font-mono text-[10px] uppercase tracking-widest',
            expired ? 'text-[color:var(--sev-amber)]' : 'text-ink-muted',
          )}
        >
          {label}
        </span>
      }
    />
  )
}

function PreviewLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function PreviewError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">Couldn't load the preview.</p>
      <p className="text-xs text-ink-muted">
        The sidecar returned an error — try closing and reopening, or check
        that the sidecar is up on 127.0.0.1:8504.
      </p>
      <p className="font-mono text-[11px] text-ink-muted">{message}</p>
    </div>
  )
}

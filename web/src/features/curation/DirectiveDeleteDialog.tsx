import * as React from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MemoryBlock, WarningStrip } from './PreviewDialogChrome'
import { CountdownTag } from './ForgetDialog'
import { useDeleteDirective, usePreviewDeleteDirective } from './hooks'
import { useCountdown } from './useCountdown'
import { useToast } from './ToastContext'
import type { DirectiveRow as DirectiveRowShape } from './types'

/**
 * DirectiveDeleteDialog — same two-phase confirm as ForgetDialog, minus
 * neighbors. Directives don't get a neighbor list because their contribution
 * to context is unconditional (they inject regardless of relevance), so
 * proximity in embedding space isn't the audit signal — content review is.
 */

export interface DirectiveDeleteDialogProps {
  target: DirectiveRowShape | null
  onClose: () => void
}

export function DirectiveDeleteDialog({
  target,
  onClose,
}: DirectiveDeleteDialogProps): React.ReactElement {
  const directiveId = target?.id ?? null
  const previewQ = usePreviewDeleteDirective(directiveId)
  const deleteM = useDeleteDirective()
  const { push } = useToast()

  const [expiryMs, setExpiryMs] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (previewQ.data) {
      setExpiryMs(Date.now() + previewQ.data.expires_in_seconds * 1000)
    } else {
      setExpiryMs(null)
    }
  }, [previewQ.data])
  React.useEffect(() => {
    if (target === null) setExpiryMs(null)
  }, [target])

  const remaining = useCountdown(expiryMs)
  const tokenExpired = expiryMs !== null && remaining === 0
  const confirmDisabled =
    !previewQ.data ||
    previewQ.isLoading ||
    tokenExpired ||
    deleteM.isPending

  const handleConfirm = (): void => {
    if (!previewQ.data || !target) return
    deleteM.mutate(
      {
        directiveId: target.id,
        confirmToken: previewQ.data.confirm_token,
      },
      {
        onSuccess: () => {
          push({
            tone: 'success',
            title: `Directive #${target.id} deleted`,
            detail: 'Will no longer auto-load at SessionStart.',
          })
          onClose()
        },
        onError: (err) => {
          push({
            tone: 'error',
            title: `Couldn't delete directive #${target.id}`,
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
            'w-[min(96vw,640px)] max-w-none p-0',
            'grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0',
          )}
          style={{ maxHeight: 'min(80dvh, 640px)' }}
        >
          <header className="border-b border-[color:var(--line)] px-5 py-4 pr-14">
            <DialogTitle className="text-base">
              Delete directive #{target.id}?
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              This removes the directive from the store — it won't auto-load
              into any future session. Recorded to the sidecar audit log with
              a before-snapshot so it's reconstructable.
            </DialogDescription>
          </header>

          <div className="min-h-0 overflow-auto px-5 py-4">
            {previewQ.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : previewQ.isError ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink">Couldn't load the preview.</p>
                <p className="font-mono text-[11px] text-ink-muted">
                  {previewQ.error instanceof Error
                    ? previewQ.error.message
                    : 'Preview failed'}
                </p>
              </div>
            ) : previewQ.data ? (
              <div className="flex flex-col gap-4">
                <MemoryBlock
                  memory={previewQ.data.directive}
                  title="Directive to delete"
                />
                <WarningStrip>
                  Directives inject unconditionally into every session. Once
                  deleted, this instruction stops loading immediately — no
                  further sessions will see it.
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
                aria-label={`Confirm delete directive ${target.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {deleteM.isPending ? 'Deleting…' : 'Confirm delete'}
              </Button>
            </div>
          </footer>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

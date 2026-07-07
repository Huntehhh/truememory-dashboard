import * as React from 'react'
import { Tag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { FeedRow } from '@/features/feed/types'
import {
  MemoryBlock,
  NeighborsList,
  WarningStrip,
} from './PreviewDialogChrome'
import { CountdownTag } from './ForgetDialog'
import { usePreviewRecategorize, useRecategorize } from './hooks'
import { useCountdown } from './useCountdown'
import { useToast } from './ToastContext'
import { CURATION_CATEGORIES } from './categories'

/**
 * RecategorizeDialog — two-phase like Forget, plus a category dropdown.
 *
 * The preview endpoint doesn't take the new category, only the memory id —
 * the token authorizes the "recategorize" action generically and the actual
 * target category is chosen at confirm time. So the flow is:
 *
 *   Open dialog → fetch preview → operator picks a new category
 *                                 (defaults to current, no-op guard) →
 *                                 confirm → recategorize + invalidate.
 */

export interface RecategorizeDialogProps {
  target: FeedRow | null
  onClose: () => void
}

export function RecategorizeDialog({
  target,
  onClose,
}: RecategorizeDialogProps): React.ReactElement {
  const memoryId = target?.id ?? null
  const previewQ = usePreviewRecategorize(memoryId)
  const recatM = useRecategorize()
  const { push } = useToast()

  const [expiryMs, setExpiryMs] = React.useState<number | null>(null)
  const [selected, setSelected] = React.useState<string>('')

  React.useEffect(() => {
    if (previewQ.data) {
      setExpiryMs(Date.now() + previewQ.data.expires_in_seconds * 1000)
      // Default the dropdown to the current category so a mis-click doesn't
      // accidentally jam the first-in-the-list value onto the memory.
      setSelected(previewQ.data.memory.category ?? '')
    } else {
      setExpiryMs(null)
    }
  }, [previewQ.data])

  React.useEffect(() => {
    if (target === null) {
      setExpiryMs(null)
      setSelected('')
    }
  }, [target])

  const remaining = useCountdown(expiryMs)
  const tokenExpired = expiryMs !== null && remaining === 0
  const currentCategory = previewQ.data?.memory.category ?? ''
  const noChange = selected === currentCategory
  const confirmDisabled =
    !previewQ.data ||
    previewQ.isLoading ||
    tokenExpired ||
    recatM.isPending ||
    selected.trim().length === 0 ||
    noChange

  const handleConfirm = (): void => {
    if (!previewQ.data || !target) return
    recatM.mutate(
      {
        memoryId: target.id,
        category: selected,
        confirmToken: previewQ.data.confirm_token,
      },
      {
        onSuccess: () => {
          push({
            tone: 'success',
            title: `Memory #${target.id} re-categorized`,
            detail: `New category: ${selected}`,
          })
          onClose()
        },
        onError: (err) => {
          push({
            tone: 'error',
            title: `Couldn't re-categorize #${target.id}`,
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
              Re-categorize memory #{target.id}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Move this memory to a different label. The content is unchanged;
              only the category assignment is rewritten (and audit-logged).
            </DialogDescription>
          </header>

          <div className="min-h-0 overflow-auto px-5 py-4">
            {previewQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
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
                  memory={previewQ.data.memory}
                  title="Memory to re-categorize"
                />

                <section className="flex flex-col gap-2">
                  <label
                    htmlFor="recat-select"
                    className="font-mono text-[10px] uppercase tracking-widest text-ink-muted"
                  >
                    New category
                  </label>
                  <select
                    id="recat-select"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className={cn(
                      'rounded-card border border-[color:var(--glass-border)]',
                      'bg-[color:var(--surface)] px-3 py-2 text-sm text-ink',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                    )}
                  >
                    {CURATION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {currentCategory && !CURATION_CATEGORIES.includes(
                    currentCategory as (typeof CURATION_CATEGORIES)[number],
                  ) ? (
                    <p className="text-[11px] text-ink-muted">
                      Current category{' '}
                      <span className="font-mono">{currentCategory}</span> is
                      outside the nine canonical labels — pick one from the
                      list to normalize.
                    </p>
                  ) : null}
                </section>

                <NeighborsList neighbors={previewQ.data.neighbors} />
                <WarningStrip>
                  Recategorization is non-destructive — the memory keeps its
                  content, vector, and salience. Only the category rollup
                  moves.
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
                aria-label={`Confirm re-categorize memory ${target.id}`}
              >
                <Tag className="h-3.5 w-3.5" aria-hidden />
                {recatM.isPending
                  ? 'Applying…'
                  : noChange && previewQ.data
                    ? 'Pick a different category'
                    : 'Confirm re-categorize'}
              </Button>
            </div>
          </footer>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

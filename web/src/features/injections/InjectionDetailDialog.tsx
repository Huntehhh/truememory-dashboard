import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatBadge } from '@/components/glass/StatBadge'
import { cn } from '@/lib/utils'
import type { InjectionRow } from './api'
import { absoluteTime, formatChars, hookLabel } from './format'

export interface InjectionDetailDialogProps {
  row: InjectionRow | null
  onClose: () => void
}

/**
 * The full injected block, exactly as it entered Claude's context. Rendered as
 * a monospaced <pre> with whitespace preserved — the payload is a chunk of
 * assembled directives + retrieved memories that can run several KB, so the
 * dialog wraps a scroll container capped at (100dvh - 96px).
 */
export function InjectionDetailDialog({
  row,
  onClose,
}: InjectionDetailDialogProps): React.ReactElement {
  const isOpen = row !== null
  const handleOpenChange = (next: boolean): void => {
    if (!next) onClose()
  }
  const isHit = row !== null && (row.memory_count ?? 0) > 0

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {row ? (
        <DialogContent
          className={cn(
            'w-[min(96vw,960px)] max-w-none p-0',
            'grid grid-rows-[auto_minmax(0,1fr)] gap-0',
          )}
          style={{ height: 'min(720px, calc(100dvh - 96px))' }}
        >
          <div className="border-b border-[color:var(--line)] px-5 py-4 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge tone="navy">{hookLabel(row.hook)}</StatBadge>
              {row.action ? (
                <StatBadge tone="neutral">{row.action}</StatBadge>
              ) : null}
              <StatBadge tone={isHit ? 'sage' : 'amber'}>
                {row.memory_count ?? 0} memories
              </StatBadge>
              <StatBadge tone="neutral">
                {formatChars(row.char_count)} chars
              </StatBadge>
            </div>
            <DialogTitle className="mt-3 text-base">
              Injection #{row.id}
            </DialogTitle>
            <DialogDescription className="mt-1 font-mono text-[11px] text-ink-muted">
              {absoluteTime(row.ts)}
              {row.session_id ? (
                <>
                  {' · session '}
                  <span title={row.session_id}>{row.session_id}</span>
                </>
              ) : (
                <> · session unknown</>
              )}
            </DialogDescription>
            {row.query ? (
              <p className="mt-2 text-xs text-ink-muted">
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  Query
                </span>{' '}
                · {row.query}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 overflow-hidden">
            <pre
              className={cn(
                'h-full overflow-auto whitespace-pre-wrap break-words',
                'px-5 py-4 font-mono text-xs leading-relaxed text-ink',
              )}
            >
              {row.full_content ?? row.preview ?? '(no content)'}
            </pre>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

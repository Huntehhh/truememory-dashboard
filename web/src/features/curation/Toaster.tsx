import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, type ToastTone } from './ToastContext'

/**
 * Toaster — renders whatever `<ToastProvider>` is holding. Sits at the page
 * root inside `features/curation/index.tsx`.
 *
 * Toasts are stacked bottom-right so they don't fight the header when the
 * operator is scanning the queue.
 */

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

/**
 * Static per-tone class names. Kept as full string literals so Tailwind's
 * JIT scanner picks them up — a concatenated `'text-' + accent` at runtime
 * would be invisible to the class extractor and quietly go unstyled.
 */
const TONE_ICON_CLASS: Record<ToastTone, string> = {
  success: 'text-[color:var(--sev-green)]',
  error: 'text-[color:var(--sev-red)]',
  info: 'text-[color:var(--navy)]',
}

export function Toaster(): React.ReactElement {
  const { toasts, dismiss } = useToast()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone]
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-card border p-3',
              'bg-[color:var(--surface-strong)] shadow-card',
              'border-[color:var(--glass-border)] backdrop-blur-[var(--blur-card)]',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 flex-shrink-0',
                TONE_ICON_CLASS[t.tone],
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">{t.title}</p>
              {t.detail ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                  {t.detail}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className={cn(
                'rounded-pill p-1 text-ink-muted transition-colors',
                'hover:bg-[color:var(--surface)] hover:text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
              )}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}

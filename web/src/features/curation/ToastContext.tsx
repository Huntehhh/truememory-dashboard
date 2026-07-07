import * as React from 'react'

/**
 * A minimal inline toast system scoped to the Curation Studio.
 *
 * No external dep — a React context + a small reducer over an array. The
 * curation surface is the only page that mutates data today, so keeping the
 * toaster local to `features/curation` avoids polluting app-wide layout.
 */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  detail?: string | undefined
}

interface ToastContextValue {
  toasts: readonly Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

/** Auto-dismiss window — long enough to read a two-line status, short enough
 *  that a cascade of writes doesn't stack forever. */
const TOAST_TTL_MS = 4500

let toastSequence = 0

export function ToastProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [toasts, setToasts] = React.useState<readonly Toast[]>([])
  const timers = React.useRef<Map<string, number>>(new Map())

  const dismiss = React.useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle !== undefined) {
      window.clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const push = React.useCallback(
    (t: Omit<Toast, 'id'>): void => {
      toastSequence += 1
      const id = `toast-${toastSequence}`
      setToasts((prev) => [...prev, { ...t, id }])
      const handle = window.setTimeout(() => dismiss(id), TOAST_TTL_MS)
      timers.current.set(id, handle)
    },
    [dismiss],
  )

  React.useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((handle) => window.clearTimeout(handle))
      map.clear()
    }
  }, [])

  const value = React.useMemo(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (ctx === null) {
    throw new Error('useToast must be called inside <ToastProvider>')
  }
  return ctx
}

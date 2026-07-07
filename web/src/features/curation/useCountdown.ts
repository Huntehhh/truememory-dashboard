import * as React from 'react'

/**
 * Wall-clock countdown — returns integer seconds remaining until `expiryMs`.
 *
 * Wall-clock (not decremented tick counter) so tab-throttling, sleep/wake,
 * and browser DevTools pauses stay honest — the countdown always tells the
 * operator the true time left on the sidecar-issued confirm token.
 *
 * Returns 0 when `expiryMs` is null OR the expiry has passed. Consumers
 * disable the confirm button on `remaining === 0` and force the operator
 * to reopen the preview (which will re-fetch and issue a fresh token).
 */
export function useCountdown(expiryMs: number | null): number {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (expiryMs === null) return
    const tick = (): void => setNow(Date.now())
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [expiryMs])

  if (expiryMs === null) return 0
  return Math.max(0, Math.ceil((expiryMs - now) / 1000))
}

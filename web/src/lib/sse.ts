import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/config'

/**
 * Server-Sent Events lifecycle hook for named-event streams.
 *
 * Contract with the sidecar's `/api/sim/events` endpoint:
 *   event: hello      one-shot on connect
 *   event: injection  a row was appended to ~/.truememory/injections.log
 *   event: store      a row was appended to ~/.truememory/stores.log
 *   event: ping       ~15s heartbeat
 *
 * Reconnect policy — 3 attempts with 0.5s / 1s / 2s backoff, then dormant.
 * `status` cycles connecting → live on `open`, connecting → off when the
 * retry budget is exhausted, and back to connecting when the caller changes
 * the url (or a manual reset — not exposed today).
 *
 * `onEvent(type, data)` receives already-JSON-parsed payloads. Unparseable
 * frames are dropped silently — the caller is meant to invalidate a React
 * Query key on `injection`, not run business logic off the payload body.
 */
export type SseStatus = 'live' | 'connecting' | 'off'

export interface UseEventSourceOptions {
  /** Called for every named event this hook subscribes to. */
  onEvent?: (type: string, data: unknown) => void
  /** Event names to subscribe to. Defaults to the sidecar's live set. */
  events?: readonly string[]
  /** Disable — used to gate the subscription without unmounting the caller. */
  enabled?: boolean
}

export interface UseEventSourceResult {
  status: SseStatus
}

const DEFAULT_EVENTS = ['hello', 'injection', 'store', 'ping'] as const
const RETRY_DELAYS_MS = [500, 1000, 2000] as const

export function useEventSource(
  path: string,
  opts: UseEventSourceOptions = {},
): UseEventSourceResult {
  const { onEvent, events = DEFAULT_EVENTS, enabled = true } = opts
  const [status, setStatus] = useState<SseStatus>(enabled ? 'connecting' : 'off')

  // Latest callback in a ref so we don't tear down the EventSource every
  // time the caller inlines a new onEvent lambda.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }

    let cancelled = false
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const url = `${API_BASE}${path}`

    const cleanupSource = (): void => {
      if (es) {
        // Named listeners were added via addEventListener; closing tears them
        // all down. removeEventListener is unnecessary here.
        es.close()
        es = null
      }
    }

    const connect = (): void => {
      if (cancelled) return
      setStatus('connecting')

      let source: EventSource
      try {
        source = new EventSource(url)
      } catch {
        // Extremely defensive — bad URL or the browser refused. Treat like
        // a permanent failure so we don't hot-loop.
        setStatus('off')
        return
      }
      es = source

      source.onopen = (): void => {
        if (cancelled) return
        attempts = 0
        setStatus('live')
      }

      const handler = (name: string) => (ev: MessageEvent): void => {
        if (cancelled) return
        let parsed: unknown = ev.data
        if (typeof ev.data === 'string') {
          try {
            parsed = JSON.parse(ev.data)
          } catch {
            parsed = ev.data
          }
        }
        onEventRef.current?.(name, parsed)
      }

      for (const name of events) {
        source.addEventListener(name, handler(name))
      }

      source.onerror = (): void => {
        if (cancelled) return
        cleanupSource()
        if (attempts >= RETRY_DELAYS_MS.length) {
          setStatus('off')
          return
        }
        const delay = RETRY_DELAYS_MS[attempts]
        attempts += 1
        setStatus('connecting')
        retryTimer = setTimeout(() => {
          retryTimer = null
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      cleanupSource()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, events.join('|')])

  return { status }
}

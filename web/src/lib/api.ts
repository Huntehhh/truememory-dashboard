import { API_BASE } from '@/config'

/**
 * Backend error envelope. The dashboard API responds with either the payload
 * directly or `{ error: string, detail?: string }` on failure — mirror that.
 */
export interface ApiErrorPayload {
  error: string
  detail?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string | undefined

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/**
 * Typed JSON fetch against the Observatory backend.
 *
 * - Prepends `API_BASE` (empty string in dev — Vite proxy routes /api → :8503).
 * - Throws `ApiError` on non-2xx or if the payload contains an `error` key,
 *   so React Query surfaces the failure via `isError`.
 */
export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const raw = (await res.json().catch(() => null)) as
    | (T & Partial<ApiErrorPayload>)
    | null

  if (!res.ok) {
    const msg = raw?.error ?? res.statusText ?? 'Request failed'
    throw new ApiError(res.status, msg, raw?.detail)
  }

  if (raw && typeof raw === 'object' && 'error' in raw && raw.error) {
    throw new ApiError(res.status, raw.error, raw.detail)
  }

  return raw as T
}

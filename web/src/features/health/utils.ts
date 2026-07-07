import type { ModelServerState, ServerHealth } from './types'

/**
 * Small formatters for the health page. Kept local so the Overview page's
 * mini-health widgets (if we ever add them) can share OR diverge without
 * accidentally coupling.
 */

/**
 * Format an ISO timestamp as a compact relative label:
 *   "just now" · "3m ago" · "2h ago" · "yesterday" · "3d ago" · "Jul 4"
 * Falls back to an ISO date if `iso` can't be parsed. Returns `—` on null so
 * "never" reads visually the same as any other missing value on the page.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso.slice(0, 10)
  const now = Date.now()
  const deltaSec = Math.max(0, Math.round((now - then) / 1000))

  if (deltaSec < 60) return 'just now'
  const deltaMin = Math.round(deltaSec / 60)
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHr = Math.round(deltaMin / 60)
  if (deltaHr < 24) return `${deltaHr}h ago`
  const deltaDay = Math.round(deltaHr / 24)
  if (deltaDay === 1) return 'yesterday'
  if (deltaDay < 7) return `${deltaDay}d ago`

  const d = new Date(then)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Format ETA seconds as a compact `Xh Ym`, `Xm Ys`, `Xs`, or `—`.
 * The engine can report huge ETAs early in a re-embed (batch size hasn't
 * warmed up), so we keep the granularity down to seconds without spilling
 * more than two units.
 */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remS = s % 60
  if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}

/**
 * Coverage percent → `26.0%` / `—`. The API already scales to 0–100, so we
 * clamp defensively at the boundaries — a mis-shaped payload that ships 260.3
 * instead of 26.03 shouldn't blow the progress bar past 100%.
 */
export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

/**
 * Compound status verdict from the two independent file probes. `healthy`
 * only when BOTH file locks exist — the engine writes port on start and
 * status file on ready, so "port + no status" is a legitimate mid-boot
 * state we call `partial` (not `down`) to keep operators from restarting
 * during a warm-up.
 */
export function serverStatusFrom(s: ModelServerState): ServerHealth {
  const status = s.status_file_exists
  const port = s.port_file_exists
  if (status && port) return 'healthy'
  if (status || port) return 'partial'
  return 'down'
}

/** Clamp a coverage number to the 0–100 range for progress-bar widths. */
export function clampPct(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

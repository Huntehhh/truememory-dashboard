/**
 * Small formatting helpers for the memory feed.
 * Kept local so the Overview page + Feed page don't accidentally share
 * inconsistent time / salience formatting.
 */

/**
 * Format an ISO timestamp as a compact relative label:
 *   "just now" · "3m ago" · "2h ago" · "yesterday" · "3d ago" · "Jul 4"
 * Falls back to an ISO date if `iso` can't be parsed.
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

/** Format salience as `.XX` or `—` when null. */
export function formatSalience(s: number | null): string {
  if (s == null) return '—'
  return s.toFixed(2)
}

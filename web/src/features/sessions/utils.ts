/**
 * Formatting helpers for the sessions page. Kept local so this page's
 * episode/landmark formatting stays independent from the feed's row helpers —
 * two rails render two different rhythms and one accidental shared change
 * would drift them.
 */

/**
 * Compact relative label used for landmark timestamps and episode start-time
 * fallbacks:
 *   `just now` · `3m ago` · `2h ago` · `yesterday` · `3d ago` · `Jul 4`
 * Returns `—` when the input is missing or unparseable so a partial row still
 * renders.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '—'
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
 * Format a single ISO instant as `MMM D · HH:MM` (locale-aware month, 24h
 * clock so the eye can read a range at a glance). Returns `—` on missing or
 * unparseable input.
 */
function formatMoment(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const d = new Date(t)
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${day} · ${hh}:${mm}`
}

/**
 * Format an episode's start → end as a single compact range. When one side
 * is missing we render the other side alone; when both are missing the
 * caller gets a plain em-dash.
 */
export function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return '—'
  if (!start) return formatMoment(end)
  if (!end) return `${formatMoment(start)} → —`
  return `${formatMoment(start)} → ${formatMoment(end)}`
}

/**
 * Format an episode duration. `instant` when start and end are the same
 * second (a one-message episode), `Xm` under an hour, `Xh Ym` otherwise.
 * Returns `—` if either bound is missing so we never render a fake zero.
 */
export function formatDuration(
  start: string | null,
  end: string | null,
): string {
  if (!start || !end) return '—'
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—'
  const secs = Math.max(0, Math.round((b - a) / 1000))
  if (secs === 0) return 'instant'
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const remMin = mins % 60
  return remMin === 0 ? `${hrs}h` : `${hrs}h ${remMin}m`
}

/**
 * Defensively coerce a landmark's `related_entities` payload to a clean
 * `string[]` or `null`. The server usually hands us an array; occasionally
 * an empty array; theoretically a raw string when an upstream JSON parse
 * fails. Anything else drops to `null` so the row hides the chip strip
 * rather than crashing on `.map` of a non-array.
 */
export function asStringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const clean = v.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )
    return clean.length > 0 ? clean : null
  }
  if (typeof v === 'string' && v.trim().length > 0) {
    return [v.trim()]
  }
  return null
}

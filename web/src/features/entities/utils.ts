/**
 * Local formatters + defensive type-narrowers for entity profile fields.
 *
 * The entity endpoint's four JSON columns arrive as `unknown` because the
 * backend parses defensively — a parse fail hands back the raw string instead
 * of dropping the row. Callers use asArray / asObject / asString to decide
 * whether to render chips, a facts row, or an "unparsed" pre block.
 *
 * `formatRelative` is duplicated (intentionally, not imported) from
 * `../feed/utils.ts` to keep the entities feature independently deletable.
 */

/**
 * Format an ISO timestamp as a compact relative label:
 *   "just now" · "3m ago" · "2h ago" · "yesterday" · "3d ago" · "Jul 4"
 * Falls back to the date slice of `iso` if it can't be parsed.
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

/** Narrow `unknown` to an array; return null if it isn't one. */
export function asArray<T>(v: unknown): T[] | null {
  return Array.isArray(v) ? (v as T[]) : null
}

/**
 * Narrow `unknown` to a plain object (not null, not array).
 * Returns null if the shape is anything else.
 */
export function asObject(v: unknown): Record<string, unknown> | null {
  if (v === null) return null
  if (typeof v !== 'object') return null
  if (Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/** Narrow `unknown` to a string; return null if it isn't one. */
export function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

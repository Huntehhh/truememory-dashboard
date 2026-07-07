/**
 * Formatting helpers for the Inspector. Kept local so timestamp / distance
 * conventions don't drift between the detail page, neighbor list, and the
 * connections section.
 */

/** ISO → "Jul 4, 2026 · 3:22 PM" (locale-aware). Falls back to raw on parse fail. */
export function formatFullDate(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Cosine distance → percentage-remaining-similarity string. `0.05` → `95%`.
 * Values outside [0,2] are clamped rather than rejected — the raw payload
 * is trusted, but a bug upstream shouldn't blow up the render.
 */
export function distanceToSimilarityPct(d: number): string {
  const clamped = Math.min(2, Math.max(0, d))
  // For unit vectors: cosine = 1 - d. Report as a percentage of "closeness".
  const sim = Math.max(0, 1 - clamped)
  return `${(sim * 100).toFixed(1)}%`
}

/** Format a distance for the neighbor row — 4 decimals, tabular. */
export function formatDistance(d: number): string {
  return d.toFixed(4)
}

/** Salience → `.XX` or em-dash when null. Mirrors the feed convention. */
export function formatSalience(s: number | null): string {
  if (s == null) return '—'
  return s.toFixed(2)
}

/** Emotional valence [-1, 1] → `+.42` / `-.30` / `—`. */
export function formatValence(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

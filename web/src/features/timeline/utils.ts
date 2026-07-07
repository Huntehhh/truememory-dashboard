import type { TimelineChain, TimelineFactRow } from './types'

/**
 * Formatting + ordering helpers for the timeline. Kept out of render code so
 * ChainCard reads as pure JSX. None throw — they degrade to em-dash on bad
 * input so a partial row still renders.
 */

/** Treat both `null` and empty-string as "no value" — the wire uses `""`. */
function isBlank(s: string | null | undefined): s is null {
  return s === null || s === undefined || s === ''
}

/** Compact relative-time like `42s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function formatRelative(iso: string | null): string {
  if (isBlank(iso)) return '—'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return '—'
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

/** Short calendar date like `Jul 6` or `Jul 6, 2025` for older rows. */
export function formatDateShort(iso: string | null): string {
  if (isBlank(iso)) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const thisYear = new Date().getFullYear()
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === thisYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  return d.toLocaleDateString(undefined, opts)
}

/** The chain "tip" — the row that's currently active (falls back to the last). */
export function chainTip(chain: TimelineFactRow[]): TimelineFactRow | undefined {
  if (chain.length === 0) return undefined
  const active = chain.find((row) => row.active)
  return active ?? chain[chain.length - 1]
}

/**
 * Sort chains for display:
 * 1. Multi-row chains first (they carry the supersession story).
 * 2. Within each group, newest tip descending (`timestamp` on the tip row).
 * 3. Fall back to subject alphabetical when timestamps are absent, so the
 *    order stays deterministic between renders.
 */
export function sortChains(chains: TimelineChain[]): TimelineChain[] {
  const withMeta = chains.map((c) => {
    const tip = chainTip(c.chain)
    const tipTs = tip?.timestamp ? Date.parse(tip.timestamp) : NaN
    return {
      c,
      isMulti: c.chain.length > 1,
      tipTs: Number.isNaN(tipTs) ? -Infinity : tipTs,
    }
  })
  withMeta.sort((a, b) => {
    if (a.isMulti !== b.isMulti) return a.isMulti ? -1 : 1
    if (b.tipTs !== a.tipTs) return b.tipTs - a.tipTs
    return a.c.subject.localeCompare(b.c.subject)
  })
  return withMeta.map((m) => m.c)
}

/** Human range for the "valid: [x → y]" line. Empty `valid_to` reads "now". */
export function formatValidRange(
  validFrom: string | null,
  validTo: string | null,
): string {
  const from = formatDateShort(validFrom)
  const to = isBlank(validTo) ? 'now' : formatDateShort(validTo)
  return `${from} → ${to}`
}

/**
 * Formatting helpers scoped to the injections feed. Kept out of render code so
 * the row/dialog components read as pure JSX. None of these throw — they degrade
 * to em-dash so a partial row still renders.
 */

const HOOK_LABEL: Record<string, string> = {
  session_start: 'SessionStart',
  user_prompt_submit: 'UserPromptSubmit',
  stop: 'Stop',
  compact: 'Compact',
  smoke_test: 'SmokeTest',
}

export function hookLabel(hook: string): string {
  return HOOK_LABEL[hook] ?? hook
}

/** Compact relative-time like `42s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
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
  return new Date(then).toLocaleDateString()
}

export function absoluteTime(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleString()
}

/** First 8 chars + ellipsis — enough to disambiguate sessions in a scan. */
export function shortSession(id: string | null): string {
  if (!id || id === 'unknown') return '—'
  if (id.length <= 9) return id
  return `${id.slice(0, 8)}…`
}

/** `842` / `1.2k` / `18.4k` — compact char/byte counts for pill cells. */
export function formatChars(n: number | null): string {
  if (n === null) return '—'
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}

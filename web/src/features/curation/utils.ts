import type { FeedRow } from '@/features/feed/types'
import type { JunkFlag } from './types'

/**
 * Client-side junk heuristics for the Review Queue.
 *
 * Kept pure + side-effect-free so unit tests can pin them without importing
 * React or fetch. Each heuristic answers ONE question about a single feed row
 * and returns `true` when the row should be flagged for review.
 */

const DICT_KV_RE = /['"][a-z_][a-z0-9_]*['"]\s*:/i
const STALE_UNRETRIEVED_DAYS = 30
const TINY_FRAGMENT_MIN_CHARS = 25

/**
 * Dict/code-shaped content — the classic extractor-artifact tell.
 * Three signals; ANY one fires the flag:
 *   1. Content begins with '{' or '[' (a raw literal leaked into a memory).
 *   2. Density of braces/brackets/quotes exceeds 30% of characters (dense
 *      structured content, not prose).
 *   3. Contains a `'key':` style token (single- or double-quoted key,
 *      colon, whitespace) — an artifact of dumping a Python/JS dict.
 */
export function isDictShape(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length === 0) return false
  const first = trimmed[0]
  if (first === '{' || first === '[') return true
  if (DICT_KV_RE.test(trimmed)) return true
  let structural = 0
  for (const ch of trimmed) {
    if (
      ch === '{' ||
      ch === '}' ||
      ch === '[' ||
      ch === ']' ||
      ch === '"' ||
      ch === "'"
    ) {
      structural += 1
    }
  }
  return structural / trimmed.length > 0.3
}

/** Missing/blank category — the extractor declined to guess. */
export function isUncategorized(row: FeedRow): boolean {
  return !row.category || row.category.trim().length === 0
}

/**
 * Stale-unretrieved — old enough to matter, never surfaced.
 * A memory less than 30 days old still gets a chance to be relevant; older
 * than that with zero retrievals is dead weight (subject to embed-coverage
 * caveat noted in the glossary — we surface but don't auto-forget).
 */
export function isStaleUnretrieved(
  row: FeedRow,
  now: number = Date.now(),
): boolean {
  if (row.retrieval_count > 0) return false
  if (!row.ts) return false
  const ts = Date.parse(row.ts)
  if (!Number.isFinite(ts)) return false
  const ageMs = now - ts
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  return ageDays > STALE_UNRETRIEVED_DAYS
}

/** Tiny fragment — content shorter than a coherent thought. */
export function isTinyFragment(content: string): boolean {
  return content.trim().length < TINY_FRAGMENT_MIN_CHARS
}

/**
 * Return the single highest-priority flag for a row, or `null` when the row
 * looks clean. Priority favors the most damaging + easy-to-audit reasons:
 *   dict_shape > tiny_fragment > uncategorized > stale_unretrieved
 */
export function flagForRow(row: FeedRow, now?: number): JunkFlag | null {
  const content = row.content_preview ?? ''
  if (isDictShape(content)) return 'dict_shape'
  if (isTinyFragment(content)) return 'tiny_fragment'
  if (isUncategorized(row)) return 'uncategorized'
  if (isStaleUnretrieved(row, now)) return 'stale_unretrieved'
  return null
}

/** Human label for the filter pills + row badges. */
export const JUNK_FLAG_LABEL: Record<JunkFlag, string> = {
  dict_shape: 'Dict/code shape',
  tiny_fragment: 'Tiny fragment',
  uncategorized: 'Uncategorized',
  stale_unretrieved: 'Stale · never used',
}

/** Compact reason chip label — same info, tighter for the row toolbar. */
export const JUNK_FLAG_SHORT: Record<JunkFlag, string> = {
  dict_shape: 'dict-shape',
  tiny_fragment: 'tiny',
  uncategorized: 'no cat',
  stale_unretrieved: 'stale',
}

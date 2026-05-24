/**
 * Shared HTTP-boundary helpers for the dashboard routers (usage + memory).
 *
 * Hoisted from routes.ts and memory-routes.ts which previously duplicated
 * these three functions verbatim — keeping them in one place removes drift
 * risk if the error-handling posture ever changes.
 */
import type { Response } from 'express';

/**
 * Parse + clamp a query-string integer. Renamed from `parseInt` (which
 * shadowed the global of the same name and was confusing to read) — the
 * call shape is identical, the behavior is identical, the name is just
 * less treacherous.
 */
export function parseClampInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === 'string' ? value : '';
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Disable response caching — every dashboard poll must see fresh data. */
export function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

/**
 * 500 + clean JSON error body. Never surfaces stack traces — keeps the
 * dashboard friendly and avoids leaking internals into the network tab.
 */
export function fail(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : 'internal error';
  res.status(500).json({ error: msg });
}

/**
 * Category palette for the UMAP scatter. Every color is derived from the
 * theme's accent tokens via color-mix so the legend stays coherent when the
 * operator flips between paper / ink themes.
 *
 * `tokenVar` picks the base (--navy / --gold / --sage / --tan / severity),
 * `mix` picks the mix percent — a rough saturation knob that lets a small
 * base palette cover the 10 categories the extractor emits today without
 * blowing out into arbitrary hex values that would drift from the design
 * tokens.
 *
 * Categories seen live (2026-07-07):
 *   technical, decision, preference, personal, activity, correction,
 *   temporal, relationship, reference, general, (null → uncategorized)
 */

export interface CategoryColor {
  tokenVar: string
  /** Percentage mix against transparent — controls saturation of the dot. */
  mix: number
}

/** Stable mapping — order matters only for the legend, colors don't shift. */
const PALETTE: Record<string, CategoryColor> = {
  technical: { tokenVar: '--navy', mix: 70 },
  decision: { tokenVar: '--gold', mix: 75 },
  preference: { tokenVar: '--sage', mix: 65 },
  personal: { tokenVar: '--tan', mix: 78 },
  activity: { tokenVar: '--navy', mix: 42 },
  correction: { tokenVar: '--sev-amber', mix: 70 },
  temporal: { tokenVar: '--sev-green', mix: 62 },
  relationship: { tokenVar: '--gold', mix: 45 },
  reference: { tokenVar: '--sage', mix: 38 },
  general: { tokenVar: '--tan', mix: 42 },
}

const UNCATEGORIZED: CategoryColor = { tokenVar: '--ink-muted', mix: 55 }

/** Fallback rotation for categories the palette doesn't have a slot for. */
const FALLBACK_CYCLE: readonly CategoryColor[] = [
  { tokenVar: '--navy', mix: 55 },
  { tokenVar: '--gold', mix: 60 },
  { tokenVar: '--sage', mix: 55 },
  { tokenVar: '--tan', mix: 60 },
  { tokenVar: '--sev-amber', mix: 55 },
  { tokenVar: '--sev-green', mix: 50 },
]

/** Deterministic string hash — 32-bit signed FNV-ish, no crypto needed. */
function stableHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

export function categoryColor(category: string | null): CategoryColor {
  if (category == null) return UNCATEGORIZED
  const hit = PALETTE[category]
  if (hit) return hit
  const fallback = FALLBACK_CYCLE[stableHash(category) % FALLBACK_CYCLE.length]
  // Defensive — FALLBACK_CYCLE is non-empty at build time; keeps TS happy.
  return fallback ?? UNCATEGORIZED
}

export function categoryFill(cat: string | null): string {
  const c = categoryColor(cat)
  return `color-mix(in oklab, var(${c.tokenVar}) ${c.mix}%, transparent)`
}

/** Solid variant for the legend swatch — same hue, higher saturation. */
export function categorySwatch(cat: string | null): string {
  const c = categoryColor(cat)
  return `color-mix(in oklab, var(${c.tokenVar}) ${Math.min(100, c.mix + 15)}%, transparent)`
}

/** Point radius adapts to density so a busy tier doesn't turn to slush. */
export function pointRadius(count: number): number {
  if (count < 150) return 4.5
  if (count < 350) return 3.5
  if (count < 700) return 3
  return 2.5
}

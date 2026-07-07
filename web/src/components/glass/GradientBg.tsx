import * as React from 'react'
import { cn } from '@/lib/utils'

export type GradientVariant = 'hero' | 'corner' | 'band'

export interface GradientBgProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GradientVariant
  /** Force a lower opacity (0-1) — defaults to variant preset. */
  intensity?: number
  /** Turn off the grain overlay if you're stacking another one nearby. */
  showGrain?: boolean
}

/**
 * Ambient mesh — 3-4 layered radial gradients (lavender/peach/butter) at
 * *very* low saturation, heavily blurred. Sits absolute behind content;
 * `pointer-events-none` so it never eats clicks.
 *
 * In dark mode ("ink") the mesh drops to ~35% opacity via --mesh-opacity
 * so it reads as a whisper on top of the ink base, not a color wash.
 */
export function GradientBg({
  variant = 'hero',
  intensity,
  showGrain = true,
  className,
  ...props
}: GradientBgProps): React.ReactElement {
  const layers = LAYERS[variant]

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      {...props}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          opacity: intensity ?? 1,
          filter: 'blur(80px) saturate(80%)',
          mixBlendMode: 'normal',
          background: layers,
          // Ink mode override — CSS custom prop is set in theme.css.
          // Multiply into the opacity via a nested wrapper so the outer opacity remains authorable.
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'inherit',
            opacity: 'var(--mesh-opacity)',
          }}
        />
      </div>
      {showGrain ? <div className="grain" /> : null}
    </div>
  )
}

const LAVENDER = '#c9b8e8'
const PEACH = '#f3d5c0'
const BUTTER = '#f7e8c3'
const MINT = '#cfe2d3'

const LAYERS: Record<GradientVariant, string> = {
  hero: [
    `radial-gradient(1200px 700px at 12% 20%, ${LAVENDER}55, transparent 60%)`,
    `radial-gradient(900px 700px at 82% 30%, ${PEACH}55, transparent 60%)`,
    `radial-gradient(1000px 600px at 40% 90%, ${BUTTER}66, transparent 65%)`,
    `radial-gradient(700px 500px at 90% 90%, ${MINT}44, transparent 70%)`,
  ].join(', '),
  corner: [
    `radial-gradient(900px 700px at 100% 0%, ${PEACH}55, transparent 55%)`,
    `radial-gradient(700px 600px at 0% 100%, ${LAVENDER}55, transparent 60%)`,
    `radial-gradient(600px 500px at 100% 100%, ${BUTTER}55, transparent 60%)`,
  ].join(', '),
  band: [
    `radial-gradient(1600px 400px at 50% 10%, ${LAVENDER}44, transparent 60%)`,
    `radial-gradient(1600px 400px at 50% 90%, ${BUTTER}55, transparent 60%)`,
  ].join(', '),
}

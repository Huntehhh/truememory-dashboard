import * as React from 'react'

/**
 * Shared SVG filter definitions for the grain overlay.
 * Rendered ONCE at the App root — every `.grain` div references
 * `filter: url(#tm-grain)` from index.css.
 *
 * `feTurbulence` w/ `fractalNoise` + low baseFrequency + two octaves gives a
 * printed-paper grain — much softer than random dot noise.
 */
export function GrainOverlay(): React.ReactElement {
  return (
    <svg
      aria-hidden
      focusable={false}
      style={{
        position: 'fixed',
        width: 0,
        height: 0,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id="tm-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={2}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0.55 0"
          />
        </filter>
      </defs>
    </svg>
  )
}

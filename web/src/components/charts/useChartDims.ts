import * as React from 'react'

/**
 * Measure a container with ResizeObserver so charts can render at their real
 * available width without needing an explicit `width` prop. Height is optional —
 * most charts pick a fixed aspect ratio; only pass it when the container is
 * flex-driven.
 *
 * Returns a stable ref to attach + the latest dimensions. Emits `{ width: 0 }`
 * on first render so downstream components can early-return until the first
 * measurement lands.
 */
export interface ChartDims {
  width: number
  height: number
}

export function useChartDims<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T | null>
  dims: ChartDims
} {
  const ref = React.useRef<T | null>(null)
  const [dims, setDims] = React.useState<ChartDims>({ width: 0, height: 0 })

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = (): void => {
      const rect = el.getBoundingClientRect()
      setDims({ width: rect.width, height: rect.height })
    }

    measure()

    const ro = new ResizeObserver(() => {
      measure()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
    }
  }, [])

  return { ref, dims }
}

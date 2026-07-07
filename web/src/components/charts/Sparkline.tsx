import * as React from 'react'
import { scaleLinear } from 'd3-scale'
import { line, curveMonotoneX } from 'd3-shape'
import { extent } from 'd3-array'
import { cn } from '@/lib/utils'

/**
 * Sparkline — a tiny inline trend chart. D3 builds the path string; React owns
 * the <svg>. Inherits `currentColor` so it slots into any parent's ink color.
 */

export interface SparklineProps {
  values: readonly number[]
  width?: number
  height?: number
  className?: string
  /** Optional accent — overrides currentColor when set. */
  strokeVar?: string
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
  strokeVar,
}: SparklineProps): React.ReactElement | null {
  const path = React.useMemo(() => {
    if (values.length < 2) return null
    const [minY, maxY] = extent(values) as [number | undefined, number | undefined]
    const lo = minY ?? 0
    const hi = maxY ?? 1
    const yScale = scaleLinear().domain([lo, hi]).range([height - 2, 2])
    const xScale = scaleLinear()
      .domain([0, values.length - 1])
      .range([2, width - 2])
    const gen = line<number>()
      .x((_, i) => xScale(i))
      .y((v) => yScale(v))
      .curve(curveMonotoneX)
    return gen(values as number[])
  }, [values, width, height])

  if (!path) return null

  return (
    <svg
      className={cn('block overflow-visible', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend"
    >
      <path
        d={path}
        fill="none"
        stroke={strokeVar ? `var(${strokeVar})` : 'currentColor'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

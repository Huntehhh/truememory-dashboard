import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { scaleLinear } from 'd3-scale'
import { extent } from 'd3-array'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useChartDims } from '@/components/charts/useChartDims'
import { cn } from '@/lib/utils'
import { categoryFill, pointRadius } from './utils'
import type { ThemePoint } from './types'

/**
 * ScatterPlot — the UMAP 2D projection.
 *
 * D3 owns the domain→range scales; React DOM owns every element. No
 * d3-selection — matches the house style in components/charts/. Zoom/pan
 * is intentionally NOT wired: at 546 points (the largest tier), a
 * well-sized responsive SVG with density-tuned radius reads fine without
 * pan/zoom, and skipping that surface keeps this a single small component.
 *
 * Rendering approach:
 *   - Each point is a Radix Tooltip trigger so hover surfaces category +
 *     preview using the app-wide tooltip system.
 *   - Click → navigate('/inspector/:id') — same target the feed row links to.
 *   - Aspect ratio is locked (16:10) so long-thin windows don't distort the
 *     UMAP layout past what's already inherent to the projection.
 *
 * Kept in features/themes/ (not components/charts/) per the wave rule —
 * another wave may generalize Scatter into the charts kit.
 */

interface ScatterPlotProps {
  points: readonly ThemePoint[]
  /**
   * If set, only points in this category glow — the rest fade out. `null`
   * lifts the filter (all-on).
   */
  focusCategory: string | null
  /** Optional per-point hover callback — parent uses it to sync a details panel later. */
  onHover?: (id: number | null) => void
}

const MARGIN = { top: 16, right: 16, bottom: 16, left: 16 }
const ASPECT_RATIO = 10 / 16 // height = width * this

export function ScatterPlot({
  points,
  focusCategory,
  onHover,
}: ScatterPlotProps): React.ReactElement {
  const { ref, dims } = useChartDims<HTMLDivElement>()
  const navigate = useNavigate()

  const width = dims.width || 0
  const height = Math.max(320, width * ASPECT_RATIO)

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const scales = React.useMemo(() => {
    if (points.length === 0) return null
    const [xLo, xHi] = extent(points, (p) => p.x)
    const [yLo, yHi] = extent(points, (p) => p.y)
    if (xLo == null || xHi == null || yLo == null || yHi == null) return null

    // Pad the domain so the outermost points don't sit on the edge.
    const xPad = (xHi - xLo || 1) * 0.05
    const yPad = (yHi - yLo || 1) * 0.05

    const xScale = scaleLinear<number, number>()
      .domain([xLo - xPad, xHi + xPad])
      .range([0, innerW])

    // Invert Y so higher-y values render toward the top — matches every UMAP
    // viewer I've seen; SVG's natural top-down y feels wrong for a map.
    const yScale = scaleLinear<number, number>()
      .domain([yLo - yPad, yHi + yPad])
      .range([innerH, 0])

    return { xScale, yScale }
  }, [points, innerW, innerH])

  const radius = React.useMemo(() => pointRadius(points.length), [points.length])

  return (
    <div ref={ref} className="relative w-full">
      {width === 0 ? (
        // First-paint: reserve height so the layout doesn't jump when dims land.
        <div style={{ height: 480 }} aria-hidden />
      ) : scales == null || points.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-ink-muted"
          style={{ height }}
        >
          no points to plot
        </div>
      ) : (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`UMAP scatter — ${points.length} memories`}
        >
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {points.map((p) => (
              <ScatterPoint
                key={p.id}
                point={p}
                cx={scales.xScale(p.x)}
                cy={scales.yScale(p.y)}
                r={radius}
                dimmed={focusCategory != null && p.category !== focusCategory}
                onClick={() => navigate(`/inspector/${p.id}`)}
                onHover={onHover}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}

interface ScatterPointProps {
  point: ThemePoint
  cx: number
  cy: number
  r: number
  dimmed: boolean
  onClick: () => void
  onHover?: (id: number | null) => void
}

function ScatterPoint({
  point,
  cx,
  cy,
  r,
  dimmed,
  onClick,
  onHover,
}: ScatterPointProps): React.ReactElement {
  const fill = categoryFill(point.category)

  const enter = React.useCallback(() => {
    if (onHover) onHover(point.id)
  }, [onHover, point.id])

  const leave = React.useCallback(() => {
    if (onHover) onHover(null)
  }, [onHover])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          stroke="color-mix(in oklab, var(--ink) 22%, transparent)"
          strokeWidth={0.6}
          onClick={onClick}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocus={enter}
          onBlur={leave}
          tabIndex={0}
          className={cn(
            'cursor-pointer transition-opacity',
            'focus-visible:outline-none',
            dimmed ? 'opacity-[0.12]' : 'opacity-90 hover:opacity-100',
          )}
          aria-label={`Memory #${point.id} — ${point.category ?? 'uncategorized'}`}
        />
      </TooltipTrigger>
      <TooltipContent align="center" side="top">
        <p className="font-medium text-ink">
          #{point.id}
          {point.category ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              {point.category}
            </span>
          ) : null}
        </p>
        {point.label ? (
          <p className="mt-1 line-clamp-3 text-xs text-ink-muted">
            {point.label}
          </p>
        ) : null}
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {point.retrievals.toLocaleString()} retrieval
          {point.retrievals === 1 ? '' : 's'}
          {point.cluster_label >= 0 ? ` · cluster c${point.cluster_label}` : ' · noise'}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

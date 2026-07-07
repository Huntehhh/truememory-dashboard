import * as React from 'react'
import { scaleSequential } from 'd3-scale'
import { extent } from 'd3-array'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useChartDims } from './useChartDims'

/**
 * HeatGrid — GitHub-style calendar heatmap. 12 weeks × 7 days (default).
 *
 * D3 handles the math (color scale, domain extent). React owns every DOM node —
 * no d3-selection anywhere. The color ramp is derived from a single CSS accent
 * token by varying alpha so both `paper` + `ink` themes look right.
 */

export interface HeatGridDatum {
  /** ISO date `YYYY-MM-DD`. */
  day: string
  count: number
}

export interface HeatGridProps {
  data: readonly HeatGridDatum[]
  /** Number of trailing weeks to display. Defaults to 12. */
  weeks?: number
  /** CSS token driving the color ramp — pick a var name from theme.css. */
  accentVar?: string
  className?: string
}

interface Cell {
  key: string
  date: Date
  iso: string
  count: number
  inRange: boolean
}

/** Days of the week in Sun-first order (matches the grid rows). */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Strip a Date to midnight UTC — activity is bucketed by day, not by hour. */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Parse `YYYY-MM-DD` as UTC midnight. Safe against timezone drift. */
function parseISODay(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10))
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function isoDay(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build a 7×weeks grid ending on today (rightmost column = current week).
 * Rows are day-of-week (Sun..Sat), columns are weeks oldest→newest.
 */
function buildGrid(
  weeks: number,
  counts: Map<string, number>,
): { cells: Cell[]; weeksCount: number } {
  const today = startOfDayUTC(new Date())
  const cells: Cell[] = []

  // Anchor: last column's Sunday = start of current week.
  const currentWeekSunday = new Date(today)
  currentWeekSunday.setUTCDate(
    currentWeekSunday.getUTCDate() - currentWeekSunday.getUTCDay(),
  )

  for (let col = 0; col < weeks; col += 1) {
    const weekOffset = weeks - 1 - col
    const weekStart = new Date(currentWeekSunday)
    weekStart.setUTCDate(weekStart.getUTCDate() - weekOffset * 7)
    for (let row = 0; row < 7; row += 1) {
      const day = new Date(weekStart)
      day.setUTCDate(day.getUTCDate() + row)
      const iso = isoDay(day)
      cells.push({
        key: `${col}-${row}`,
        date: day,
        iso,
        count: counts.get(iso) ?? 0,
        inRange: day <= today,
      })
    }
  }

  return { cells, weeksCount: weeks }
}

/**
 * Compress the raw activity rows into a Map for O(1) lookup while walking
 * the grid. Keeps HeatGrid immune to sparse/missing days.
 */
function toCountMap(rows: readonly HeatGridDatum[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    m.set(r.day, r.count)
  }
  return m
}

/** Human-friendly month label for the column axis. */
function formatMonth(d: Date): string {
  return MONTH_LABELS[d.getUTCMonth()] ?? ''
}

export function HeatGrid({
  data,
  weeks = 12,
  accentVar = '--navy',
  className,
}: HeatGridProps): React.ReactElement {
  const { ref, dims } = useChartDims<HTMLDivElement>()

  const counts = React.useMemo(() => toCountMap(data), [data])
  const { cells } = React.useMemo(() => buildGrid(weeks, counts), [weeks, counts])

  // Color scale — max count anchors the alpha ramp so quiet days sit near the
  // surface color and the busiest day pushes near the accent.
  const [minCount, maxCount] = React.useMemo(() => {
    const nonZero = cells
      .filter((c) => c.inRange && c.count > 0)
      .map((c) => c.count)
    const [lo, hi] = extent(nonZero)
    return [lo ?? 0, hi ?? 0]
  }, [cells])

  const alphaScale = React.useMemo(
    () => scaleSequential<number, number>().domain([0, maxCount || 1]).range([0.08, 0.92]),
    [maxCount],
  )

  const cellSize = 12
  const cellGap = 3
  const rowHeight = cellSize + cellGap
  const colWidth = cellSize + cellGap

  // Compute the month-band header — one label per column where a new month starts.
  const monthHeaders = React.useMemo(() => {
    const headers: Array<{ col: number; label: string }> = []
    let lastMonth = -1
    for (let col = 0; col < weeks; col += 1) {
      // Sample the top row (Sunday) of each column
      const cell = cells[col * 7]
      if (!cell) continue
      const m = cell.date.getUTCMonth()
      if (m !== lastMonth) {
        headers.push({ col, label: formatMonth(cell.date) })
        lastMonth = m
      }
    }
    return headers
  }, [cells, weeks])

  return (
    <div ref={ref} className={cn('w-full overflow-x-auto', className)}>
      <div className="inline-block">
        {/* Month header row */}
        <div className="ml-8 flex" style={{ height: 14 }}>
          {Array.from({ length: weeks }).map((_, col) => {
            const header = monthHeaders.find((h) => h.col === col)
            return (
              <div
                key={col}
                style={{ width: colWidth }}
                className="font-mono text-[9px] uppercase tracking-widest text-ink-muted"
              >
                {header?.label ?? ''}
              </div>
            )
          })}
        </div>
        <div className="flex">
          {/* Day-of-week gutter */}
          <div className="mr-2 flex flex-col" style={{ paddingTop: 0 }}>
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                style={{ height: rowHeight }}
                className={cn(
                  'font-mono text-[9px] uppercase tracking-widest text-ink-muted',
                  // Only show Mon/Wed/Fri labels — matches GH density
                  i === 1 || i === 3 || i === 5 ? 'opacity-100' : 'opacity-0',
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
              gridAutoFlow: 'column',
              gap: cellGap,
            }}
          >
            {cells.map((cell) => (
              <HeatCell
                key={cell.key}
                cell={cell}
                cellSize={cellSize}
                accentVar={accentVar}
                alpha={alphaScale(cell.count)}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="ml-8 mt-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ink-muted">
          <span>less</span>
          {[0.08, 0.28, 0.5, 0.72, 0.92].map((a) => (
            <span
              key={a}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 3,
                backgroundColor: `color-mix(in oklab, var(${accentVar}) ${Math.round(
                  a * 100,
                )}%, transparent)`,
              }}
            />
          ))}
          <span>more</span>
          {maxCount > 0 ? (
            <span className="ml-3">
              peak {maxCount.toLocaleString()} / low {minCount.toLocaleString()}
            </span>
          ) : null}
          {dims.width === 0 ? null : null /* dims kept live for future responsiveness */}
        </div>
      </div>
    </div>
  )
}

interface HeatCellProps {
  cell: Cell
  cellSize: number
  accentVar: string
  alpha: number
}

/**
 * Single cell — separated so hover/focus states are stable across re-renders.
 * Uses Radix Tooltip via TooltipContent so it inherits the app's tooltip system.
 */
function HeatCell({
  cell,
  cellSize,
  accentVar,
  alpha,
}: HeatCellProps): React.ReactElement {
  const backgroundColor = cell.inRange
    ? cell.count === 0
      ? 'color-mix(in oklab, var(--ink) 4%, transparent)'
      : `color-mix(in oklab, var(${accentVar}) ${Math.round(alpha * 100)}%, transparent)`
    : 'transparent'

  const pretty = formatCellDate(cell.iso)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${pretty}: ${cell.count} events`}
          className="rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor,
            border: cell.inRange
              ? '1px solid color-mix(in oklab, var(--ink) 6%, transparent)'
              : '1px solid transparent',
            visibility: cell.inRange ? 'visible' : 'hidden',
          }}
        />
      </TooltipTrigger>
      <TooltipContent align="center" side="top">
        <p className="font-medium text-ink">{pretty}</p>
        <p className="mt-0.5 text-ink-muted">
          {cell.count === 0
            ? 'No memory events'
            : `${cell.count.toLocaleString()} memory event${cell.count === 1 ? '' : 's'}`}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

/** `2026-05-17` → `Sun, May 17 2026` (UTC-local) for tooltip legibility. */
function formatCellDate(iso: string): string {
  const d = parseISODay(iso)
  const dayName = DAY_LABELS[d.getUTCDay()]
  const month = MONTH_LABELS[d.getUTCMonth()]
  return `${dayName}, ${month} ${d.getUTCDate()} ${d.getUTCFullYear()}`
}

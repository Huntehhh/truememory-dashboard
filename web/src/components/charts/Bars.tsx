import * as React from 'react'
import { scaleLinear } from 'd3-scale'
import { max as d3max } from 'd3-array'
import { cn } from '@/lib/utils'
import { useChartDims } from './useChartDims'

/**
 * Bars — horizontal category bars with count + secondary metric.
 *
 * D3 owns the linear scale (value → pixel width). React owns every DOM node.
 * The bar fill inherits from `--navy` at 24% opacity so both themes read the
 * same accent without a token swap.
 */

export interface BarDatum {
  label: string
  value: number
  /** Optional secondary metric shown in a muted DM Mono chip after the count. */
  secondary?: string
}

export interface BarsProps {
  data: readonly BarDatum[]
  /** CSS var driving the fill color. */
  accentVar?: string
  className?: string
  /** Empty-state message when data is [] — override for context. */
  emptyMessage?: string
  /** Max rows to show (extras collapsed under a "+N more" chip). */
  maxRows?: number
}

export function Bars({
  data,
  accentVar = '--navy',
  className,
  emptyMessage = 'No data in this window.',
  maxRows,
}: BarsProps): React.ReactElement {
  const { ref, dims } = useChartDims<HTMLDivElement>()

  const shown = React.useMemo(() => {
    if (maxRows == null) return data
    return data.slice(0, maxRows)
  }, [data, maxRows])

  const remainder = maxRows == null ? 0 : Math.max(data.length - maxRows, 0)

  const maxValue = React.useMemo(() => d3max(shown, (d) => d.value) ?? 0, [shown])

  const scale = React.useMemo(
    () =>
      scaleLinear<number, number>()
        .domain([0, maxValue || 1])
        .range([0, 100]),
    [maxValue],
  )

  if (shown.length === 0) {
    return (
      <div ref={ref} className={cn('py-6 text-center text-sm text-ink-muted', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('flex w-full flex-col gap-3', className)}>
      {shown.map((d) => {
        const pct = scale(d.value)
        return (
          <div key={d.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink">{d.label}</span>
              <span className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums text-ink-muted">
                <span className="text-ink">{d.value.toLocaleString()}</span>
                {d.secondary ? (
                  <span className="text-ink-muted">{d.secondary}</span>
                ) : null}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-pill"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--ink) 4%, transparent)',
              }}
            >
              <div
                className="h-full rounded-pill transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: `color-mix(in oklab, var(${accentVar}) 42%, transparent)`,
                }}
              />
            </div>
          </div>
        )
      })}
      {remainder > 0 ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          + {remainder} more
        </p>
      ) : null}
      {dims.width === 0 ? null : null}
    </div>
  )
}

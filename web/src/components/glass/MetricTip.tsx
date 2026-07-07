import * as React from 'react'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { GLOSSARY, type GlossaryKey, type MetricDoc } from '@/content/metric-glossary'
import { cn } from '@/lib/utils'

export interface MetricTipProps {
  id: GlossaryKey
  /** Optional custom trigger; defaults to a subtle ⓘ icon after `label`. */
  label?: React.ReactNode
  /** Style variant — icon-only or an underlined trigger word. */
  trigger?: 'icon' | 'underline'
  className?: string
}

/**
 * Hover/focus tooltip pulling copy from the glossary. The glossary is the ONE
 * place explainer prose lives — never write copy inline in a chart component.
 */
export function MetricTip({
  id,
  label,
  trigger = 'icon',
  className,
}: MetricTipProps): React.ReactElement {
  // Widen from the const-narrowed literal so optional fields like `formula`
  // remain accessible without a per-entry override.
  const doc: MetricDoc = GLOSSARY[id]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-pill text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
            trigger === 'underline'
              ? 'underline decoration-dotted decoration-[color:var(--line-strong)] underline-offset-4 hover:decoration-ink'
              : 'text-ink-muted hover:text-ink',
            className,
          )}
          aria-label={`About ${doc.title}`}
        >
          {label}
          {trigger === 'icon' ? (
            <Info className="h-3.5 w-3.5" aria-hidden />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-sm">
        <p className="font-medium text-ink">{doc.title}</p>
        <p className="mt-1 text-ink-muted">{doc.body}</p>
        {doc.formula ? (
          <p className="mt-2 font-mono text-[10px] text-ink-muted">
            {doc.formula}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

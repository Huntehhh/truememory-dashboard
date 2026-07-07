import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { StatBadge } from '@/components/glass/StatBadge'
import { MetricTip } from '@/components/glass/MetricTip'
import { cn } from '@/lib/utils'
import type { InjectionRow as InjectionRowShape } from './api'
import {
  absoluteTime,
  formatChars,
  hookLabel,
  relativeTime,
  shortSession,
} from './format'

/**
 * Per-hook tone so the eye can group the feed at a glance. Sits in a fixed
 * StatBadge tone vocabulary — `neutral` is the fallback so an unknown hook
 * name still renders instead of crashing on a missing key.
 */
const HOOK_TONE: Record<string, 'neutral' | 'navy' | 'gold' | 'sage'> = {
  session_start: 'navy',
  user_prompt_submit: 'gold',
  stop: 'neutral',
  compact: 'sage',
  smoke_test: 'neutral',
}

export interface InjectionRowProps {
  row: InjectionRowShape
  onOpen: (row: InjectionRowShape) => void
}

/**
 * A slim clickable row for the injection feed.
 *
 * Layout is a horizontal flex strip: hook badge → relative time → session id →
 * memory count → outcome tag → char count → query preview → chevron.
 *
 * MetricTips wrap the cells that map to a glossary concept. The MetricTip
 * button sits inside the row's role="button" container — this technically nests
 * interactive elements per ARIA, but the trade-off is intentional: clicks on a
 * tip trigger bubble up and open the same detail dialog they'd hint at, so the
 * behavior stays consistent whether the operator hovers or clicks.
 */
export function InjectionRow({
  row,
  onOpen,
}: InjectionRowProps): React.ReactElement {
  const isHit = (row.memory_count ?? 0) > 0
  const memoryTone: 'sage' | 'amber' = isHit ? 'sage' : 'amber'
  const outcome = isHit ? 'hit' : 'empty'
  const hookTone = HOOK_TONE[row.hook] ?? 'neutral'

  const activate = (): void => {
    onOpen(row)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  const previewText = row.query ?? row.preview ?? '—'

  return (
    <li>
      <GlassCard
        as="article"
        variant="default"
        padding="none"
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={handleKeyDown}
        aria-label={`Open injection ${row.id} — ${hookLabel(row.hook)} · ${(row.memory_count ?? 0)} memories`}
        className={cn(
          'group flex items-center gap-3 overflow-hidden px-4 py-2.5',
          'cursor-pointer transition-colors hover:bg-[color:var(--surface-strong)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
        )}
      >
        <MetricTip
          id="injections.hook"
          className="[&>svg]:hidden"
          label={
            <StatBadge tone={hookTone} className="whitespace-nowrap">
              {hookLabel(row.hook)}
            </StatBadge>
          }
        />

        <span
          className="hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-ink-muted md:inline"
          title={absoluteTime(row.ts)}
        >
          {relativeTime(row.ts)}
        </span>

        <MetricTip
          id="injections.sessionId"
          className="hidden [&>svg]:hidden lg:inline-flex"
          label={
            <span className="font-mono text-[10px] text-ink-muted" title={row.session_id ?? 'unknown'}>
              {shortSession(row.session_id)}
            </span>
          }
        />

        <MetricTip
          id="injections.memoryCount"
          className="[&>svg]:hidden"
          label={
            <StatBadge tone={memoryTone} className="whitespace-nowrap">
              {(row.memory_count ?? 0)} mem
            </StatBadge>
          }
        />

        <MetricTip
          id="injections.outcome"
          className="hidden [&>svg]:hidden md:inline-flex"
          label={
            <span
              className={cn(
                'font-mono text-[10px] uppercase tracking-widest',
                isHit
                  ? 'text-[color:var(--sage)]'
                  : 'text-[color:var(--sev-amber)]',
              )}
            >
              {outcome}
            </span>
          }
        />

        <MetricTip
          id="injections.charCount"
          className="hidden [&>svg]:hidden md:inline-flex"
          label={
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              {formatChars(row.char_count)}
            </span>
          }
        />

        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          {previewText}
        </span>

        <ChevronRight
          className="h-4 w-4 flex-shrink-0 text-ink-muted transition group-hover:text-ink"
          aria-hidden
        />
      </GlassCard>
    </li>
  )
}

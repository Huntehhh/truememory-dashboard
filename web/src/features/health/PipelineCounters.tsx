import * as React from 'react'
import { Database, HardDrive } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'

/**
 * Pipeline-queue counters — two symmetric stat cards.
 *
 * `backlog_count` = transcripts waiting for the local Ollama extractor.
 * `extracted_count` = extraction outputs waiting on the encoding gate.
 *
 * Design intent (kept in code so the layout stays honest): both are pipeline
 * queues, not user-facing metrics — treat null as "directory missing" (fresh
 * install) and 0 as "empty and drained". The formatter renders those as `—`
 * and `0` respectively so the difference is legible at a glance.
 *
 * No glossary key exists for `extracted_count` — flagged in the report so
 * the main-thread author can add one; rendered plain here per spec.
 */

export interface PipelineCountersProps {
  backlogCount: number | null
  extractedCount: number | null
}

export function PipelineCounters({
  backlogCount,
  extractedCount,
}: PipelineCountersProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <CounterCard
        icon={<HardDrive className="h-4 w-4 text-ink-muted" aria-hidden />}
        label={
          <MetricTip
            id="ops.backlog"
            trigger="underline"
            label={<span className="text-sm text-ink">Extraction backlog</span>}
          />
        }
        value={backlogCount}
        subtitle="Transcripts queued for extraction."
      />
      <CounterCard
        icon={<Database className="h-4 w-4 text-ink-muted" aria-hidden />}
        label={<span className="text-sm text-ink">Extracted</span>}
        value={extractedCount}
        subtitle="Extractions completed, awaiting encoding."
      />
    </div>
  )
}

interface CounterCardProps {
  icon: React.ReactNode
  label: React.ReactNode
  value: number | null
  subtitle: string
}

function CounterCard({
  icon,
  label,
  value,
  subtitle,
}: CounterCardProps): React.ReactElement {
  const display = value != null ? value.toLocaleString() : '—'
  return (
    <GlassCard variant="default" padding="lg" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
      <span className="font-mono text-4xl font-medium tabular-nums text-ink md:text-5xl">
        {display}
      </span>
      <span className="text-xs text-ink-muted">{subtitle}</span>
    </GlassCard>
  )
}

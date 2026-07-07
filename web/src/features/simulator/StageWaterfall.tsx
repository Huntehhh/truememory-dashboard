import * as React from 'react'
import type { Stage } from './api'
import { StageCard } from './StageCard'

/**
 * The stage waterfall — six sections in pipeline order.
 *
 *   fts → vector → rrf_fusion → salience_guard → surprise_boost → reranker
 *
 * We deliberately don't hide skipped stages: the section still renders with a
 * "skipped" band so the reader can trace what actually ran. Order is enforced
 * by the sidecar — we render the array as-received.
 */
export interface StageWaterfallProps {
  stages: Stage[]
}

export function StageWaterfall({
  stages,
}: StageWaterfallProps): React.ReactElement {
  return (
    <section aria-label="Retrieval stages" className="flex flex-col gap-3">
      {stages.map((s) => (
        <StageCard key={s.name} stage={s} />
      ))}
    </section>
  )
}

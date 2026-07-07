import * as React from 'react'
import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/glass/GlassCard'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { StatBadge } from '@/components/glass/StatBadge'
import { MetricTip } from '@/components/glass/MetricTip'
import { cn } from '@/lib/utils'
import { formatFullDate } from './utils'
import type {
  InspectCausalEdge,
  InspectCluster,
  InspectEntity,
  InspectFactTimelineRow,
  InspectLandmark,
} from './types'

/**
 * ConnectionsSection — every "how does this memory relate to the rest of the
 * store" panel wrapped in a single glass card. Individual panels render only
 * when their source table has rows for this memory; most connection tables
 * are sparse today (empty is normal, not an error) so we surface muted
 * "no X recorded" one-liners instead of skeletons or error states.
 *
 * If NONE of the panels have data, the entire section collapses to a single
 * muted line — keeps the detail page honest instead of showing five empty
 * "no data" chips in a row.
 */

interface ConnectionsSectionProps {
  connections: {
    entities: InspectEntity[]
    causal_edges: InspectCausalEdge[]
    fact_timeline: InspectFactTimelineRow[]
    landmark_events: InspectLandmark[]
    cluster: InspectCluster | null
  }
}

export function ConnectionsSection({
  connections,
}: ConnectionsSectionProps): React.ReactElement {
  const { entities, causal_edges, fact_timeline, landmark_events, cluster } =
    connections

  const hasAnything =
    entities.length > 0 ||
    causal_edges.length > 0 ||
    fact_timeline.length > 0 ||
    landmark_events.length > 0 ||
    cluster != null

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <Eyebrow>Connections</Eyebrow>
        {!hasAnything ? (
          <span className="text-xs text-ink-muted">no connections recorded</span>
        ) : null}
      </header>

      {hasAnything ? (
        <div className="flex flex-col gap-5">
          {entities.length > 0 ? <EntitiesPanel entities={entities} /> : null}
          {cluster != null ? <ClusterPanel cluster={cluster} /> : null}
          {fact_timeline.length > 0 ? (
            <FactTimelinePanel rows={fact_timeline} />
          ) : null}
          {causal_edges.length > 0 ? <CausalPanel edges={causal_edges} /> : null}
          {landmark_events.length > 0 ? (
            <LandmarksPanel events={landmark_events} />
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  )
}

/* ── Entities ─────────────────────────────────────────────────────────── */

function EntitiesPanel({
  entities,
}: {
  entities: InspectEntity[]
}): React.ReactElement {
  return (
    <PanelFrame label="Entities" count={entities.length}>
      <ul className="flex flex-col gap-3">
        {entities.map((e) => (
          <li
            key={e.entity}
            className="flex flex-col gap-1 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{e.entity}</span>
              {e.message_count != null ? (
                <StatBadge tone="neutral">
                  {e.message_count.toLocaleString()} msgs
                </StatBadge>
              ) : null}
            </div>
            {e.topics ? (
              <EntityLine label="Topics" value={e.topics} />
            ) : null}
            {e.traits ? <EntityLine label="Traits" value={e.traits} /> : null}
            {e.communication_style ? (
              <EntityLine label="Style" value={e.communication_style} />
            ) : null}
            {e.relationships ? (
              <EntityLine label="Relationships" value={e.relationships} />
            ) : null}
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}

function EntityLine({
  label,
  value,
}: {
  label: string
  value: string
}): React.ReactElement {
  return (
    <div className="flex gap-2 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <span className="text-ink-muted">{value}</span>
    </div>
  )
}

/* ── Cluster ──────────────────────────────────────────────────────────── */

function ClusterPanel({
  cluster,
}: {
  cluster: InspectCluster
}): React.ReactElement {
  return (
    <PanelFrame label="Cluster" count={null}>
      <div className="flex flex-col gap-2 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatBadge tone={cluster.noise ? 'neutral' : 'navy'}>
            {cluster.noise
              ? 'noise cluster'
              : `cluster c${cluster.cluster_id}`}
          </StatBadge>
          {cluster.cluster_size > 0 ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              {cluster.cluster_size.toLocaleString()} other member
              {cluster.cluster_size === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {cluster.summary ? (
          <p className="text-sm text-ink">{cluster.summary}</p>
        ) : null}
        {cluster.session_range ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            sessions {cluster.session_range}
          </span>
        ) : null}
      </div>
    </PanelFrame>
  )
}

/* ── Fact timeline ────────────────────────────────────────────────────── */

function FactTimelinePanel({
  rows,
}: {
  rows: InspectFactTimelineRow[]
}): React.ReactElement {
  return (
    <PanelFrame
      label={
        <MetricTip
          id="inspector.timeline"
          trigger="underline"
          label={<span>Fact timeline</span>}
        />
      }
      count={rows.length}
    >
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-1 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{r.subject}</span>
              <div className="flex flex-wrap items-center gap-2">
                {r.status ? (
                  <StatBadge
                    tone={r.status === 'superseded' ? 'amber' : 'sage'}
                  >
                    {r.status}
                  </StatBadge>
                ) : null}
                {r.superseded_by != null ? (
                  <Link
                    to={`/inspector/${r.superseded_by}`}
                    className="font-mono text-[10px] uppercase tracking-widest text-ink-muted underline decoration-dotted decoration-[color:var(--line-strong)] underline-offset-4 hover:text-ink hover:decoration-ink"
                  >
                    → #{r.superseded_by}
                  </Link>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-ink-muted">{r.fact}</p>
            {r.entity_scope ? (
              <EntityLine label="Scope" value={r.entity_scope} />
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {r.valid_from ? (
                <TimeRow label="Valid from" iso={r.valid_from} />
              ) : null}
              {r.valid_to ? (
                <TimeRow label="Valid to" iso={r.valid_to} />
              ) : null}
              {r.timestamp && !r.valid_from ? (
                <TimeRow label="Recorded" iso={r.timestamp} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}

/* ── Causal edges ─────────────────────────────────────────────────────── */

function CausalPanel({
  edges,
}: {
  edges: InspectCausalEdge[]
}): React.ReactElement {
  return (
    <PanelFrame label="Causal edges" count={edges.length}>
      <ul className="flex flex-col gap-2">
        {edges.map((edge) => (
          <li key={edge.id}>
            <Link
              to={`/inspector/${edge.other_id}`}
              className={cn(
                'group flex flex-col gap-1 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3',
                'transition-colors hover:bg-[color:var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatBadge tone={edge.direction === 'cause_of' ? 'gold' : 'navy'}>
                  {edge.direction === 'cause_of' ? 'causes' : 'caused by'}
                </StatBadge>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  → #{edge.other_id}
                </span>
                {edge.relationship ? (
                  <span className="font-mono text-[10px] text-ink-muted">
                    · {edge.relationship}
                  </span>
                ) : null}
                {edge.confidence != null ? (
                  <span className="font-mono text-[10px] text-ink-muted">
                    conf {edge.confidence.toFixed(2)}
                  </span>
                ) : null}
              </div>
              {edge.other_preview ? (
                <p className="line-clamp-2 text-xs text-ink-muted group-hover:text-ink">
                  {edge.other_preview}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}

/* ── Landmarks ────────────────────────────────────────────────────────── */

function LandmarksPanel({
  events,
}: {
  events: InspectLandmark[]
}): React.ReactElement {
  return (
    <PanelFrame label="Landmark events" count={events.length}>
      <ul className="flex flex-col gap-2">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="flex flex-col gap-1 rounded-card border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {ev.event_name}
              </span>
              {ev.event_type ? (
                <StatBadge tone="neutral">{ev.event_type}</StatBadge>
              ) : null}
            </div>
            {ev.related_entities ? (
              <EntityLine label="Related" value={ev.related_entities} />
            ) : null}
            {ev.timestamp ? (
              <TimeRow label="When" iso={ev.timestamp} />
            ) : null}
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}

/* ── Panel frame + shared bits ────────────────────────────────────────── */

interface PanelFrameProps {
  label: React.ReactNode
  /** Row count for the muted chip, or null when a count doesn't apply. */
  count: number | null
  children: React.ReactNode
}

function PanelFrame({
  label,
  count,
  children,
}: PanelFrameProps): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <Eyebrow>{label}</Eyebrow>
        {count != null ? (
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            {count.toLocaleString()}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function TimeRow({
  label,
  iso,
}: {
  label: string
  iso: string | null
}): React.ReactElement {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <time
        className="font-mono text-xs tabular-nums text-ink"
        dateTime={iso ?? undefined}
      >
        {formatFullDate(iso)}
      </time>
    </div>
  )
}
